import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid, type SessionExercise, type WorkSet } from '../db';
import Stepper from '../components/Stepper';
import MediaViewer from '../components/MediaViewer';
import ExercisePicker from '../components/ExercisePicker';
import Sheet from '../components/Sheet';
import {
  REST_OPTIONS, RPE_OPTIONS, addExerciseToSession, avgRpeOf, deleteSession, finishSession,
  fmtDateLong, fmtTime, fmtVolume, lastWorkSet, modeOf, setSummary, volumeOf,
} from '../lib/utils';
import type { ExerciseMode } from '../db';

const REST_KEY = 'gymlog.rest';

function useNow(active = true) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

type Rest = { sessionId: string; until: number; total: number };

/** Temporizador de descanso persistido para sobrevivir a recargas o salir de la pantalla. */
function useRestTimer(sessionId: string) {
  const [rest, setRestState] = useState<Rest | null>(() => {
    try {
      const r = JSON.parse(localStorage.getItem(REST_KEY) ?? 'null') as Rest | null;
      return r?.sessionId === sessionId ? r : null;
    } catch { return null; }
  });
  const setRest = (r: Rest | null) => {
    setRestState(r);
    try { r ? localStorage.setItem(REST_KEY, JSON.stringify(r)) : localStorage.removeItem(REST_KEY); } catch { /* sin storage */ }
  };
  return [rest, setRest] as const;
}

export default function SessionLogger() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const session = useLiveQuery(async () => (await db.sessions.get(id)) ?? null, [id]);
  const items = useLiveQuery(() => db.sessionExercises.where('sessionId').equals(id).sortBy('order'), [id]);
  const allSets = useLiveQuery(() => db.sets.where('sessionId').equals(id).toArray(), [id]) ?? [];
  const [rest, setRest] = useRestTimer(id);
  const [picker, setPicker] = useState(false);
  const [confirm, setConfirm] = useState<'finish' | 'delete' | null>(null);
  const active = session?.status === 'active';
  const now = useNow(active || !!rest);

  const remaining = rest ? Math.ceil((rest.until - now) / 1000) : 0;
  useEffect(() => {
    if (rest && remaining === 0) navigator.vibrate?.([250, 120, 250]);
  }, [remaining, rest]);

  if (session === null) {
    return <div className="p-6 text-zinc-400">Sesión no encontrada. <button className="text-lime-400" onClick={() => nav('/')}>Volver</button></div>;
  }
  if (!session || !items) return <div className="p-6 text-zinc-500">Cargando…</div>;

  const elapsed = active ? Math.floor((now - session.startedAt) / 1000) : session.durationSec ?? 0;
  const doneCount = allSets.filter(s => s.done).length;

  async function completeSet(set: WorkSet, restSec: number) {
    const t = Date.now();
    const prev = allSets.filter(s => s.done && s.completedAt).sort((a, b) => b.completedAt! - a.completedAt!)[0];
    await db.sets.update(set.id, {
      done: true, completedAt: t,
      restTakenSec: prev ? Math.round((t - prev.completedAt!) / 1000) : undefined,
    });
    if (active) setRest({ sessionId: id, until: t + restSec * 1000, total: restSec });
    navigator.vibrate?.(30);
  }

  async function moveExercise(item: SessionExercise, dir: -1 | 1) {
    const j = items!.findIndex(i => i.id === item.id) + dir;
    if (j < 0 || j >= items!.length) return;
    const other = items![j];
    await db.transaction('rw', db.sessionExercises, async () => {
      await db.sessionExercises.update(item.id, { order: other.order });
      await db.sessionExercises.update(other.id, { order: item.order });
    });
  }

  async function removeExercise(item: SessionExercise) {
    await db.transaction('rw', [db.sets, db.sessionExercises], async () => {
      await db.sets.where('sessionExerciseId').equals(item.id).delete();
      await db.sessionExercises.delete(item.id);
    });
  }

  return (
    <div className={`min-h-dvh ${rest ? 'pb-44' : 'pb-24'}`}>
      {/* Cabecera fija: rutina, cronómetro, descanso global */}
      <header className="sticky z-20 border-b border-zinc-800 bg-zinc-950/95 px-4 py-2 backdrop-blur"
        style={{ top: 'env(safe-area-inset-top, 0px)' }}>
        <div className="flex items-center gap-2">
          <button onClick={() => nav(-1)} className="-ml-2 h-11 w-9 text-2xl text-zinc-400" aria-label="Volver">‹</button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-zinc-500 first-letter:uppercase">{fmtDateLong(session.date)}</p>
            <input value={session.type} aria-label="Tipo de sesión"
              onChange={e => db.sessions.update(id, { type: e.target.value, updatedAt: Date.now() })}
              className="w-full truncate bg-transparent text-lg font-bold outline-none" />
          </div>
          <div className="text-right">
            <p className={`font-mono text-2xl tabular-nums ${active ? 'text-lime-400' : 'text-zinc-300'}`}>{fmtTime(elapsed)}</p>
            <p className="text-[11px] text-zinc-500">{doneCount} series · {fmtVolume(volumeOf(allSets))}</p>
          </div>
          {active && (
            <button onClick={() => setConfirm('finish')} className="btn-primary ml-1 min-h-11 px-3 text-sm">Finalizar</button>
          )}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-zinc-400">
          <label className="flex items-center gap-1">Descanso global
            <select className="rounded-lg bg-zinc-800 px-2 py-1 text-zinc-100" value={session.defaultRestSec}
              onChange={e => db.sessions.update(id, { defaultRestSec: +e.target.value, updatedAt: Date.now() })}>
              {REST_OPTIONS.map(s => <option key={s} value={s}>{fmtTime(s)}</option>)}
            </select>
          </label>
          {!active && <span className="rounded-full bg-zinc-800 px-2 py-1">Completada · RPE {avgRpeOf(allSets) ?? '—'}</span>}
        </div>
      </header>

      <main className="space-y-4 p-3">
        {items.length === 0 && (
          <p className="card p-6 text-center text-zinc-400">Sesión vacía. Añade tu primer ejercicio.</p>
        )}
        {items.map((it, i) => (
          <ExerciseCard key={it.id} item={it} defaultRest={session.defaultRestSec}
            sets={allSets.filter(s => s.sessionExerciseId === it.id).sort((a, b) => a.idx - b.idx)}
            onComplete={completeSet} isFirst={i === 0} isLast={i === items.length - 1}
            onMove={d => moveExercise(it, d)} onRemove={() => removeExercise(it)} />
        ))}

        <button onClick={() => setPicker(true)}
          className="min-h-14 w-full rounded-2xl border-2 border-dashed border-zinc-700 text-zinc-300 active:bg-zinc-900">
          + Añadir ejercicio
        </button>

        <textarea className="input min-h-20 py-2" placeholder="Notas de la sesión (sensaciones, molestias…)"
          value={session.notes ?? ''} onChange={e => db.sessions.update(id, { notes: e.target.value, updatedAt: Date.now() })} />

        {active ? (
          <button onClick={() => setConfirm('finish')} className="btn-primary min-h-14 w-full text-lg">Finalizar rutina</button>
        ) : (
          <button onClick={() => db.sessions.update(id, { status: 'active', updatedAt: Date.now() })} className="btn-ghost w-full">
            Reabrir sesión
          </button>
        )}
        <button onClick={() => setConfirm('delete')} className="btn-danger w-full">Eliminar sesión</button>

      </main>

      <Sheet open={confirm != null} onClose={() => setConfirm(null)}
        title={confirm === 'finish' ? 'Finalizar rutina' : 'Eliminar sesión'}>
        {confirm === 'finish' ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-zinc-800 p-3"><p className="text-lg font-bold tabular-nums">{fmtTime(elapsed)}</p><p className="text-[11px] text-zinc-400">duración</p></div>
              <div className="rounded-xl bg-zinc-800 p-3"><p className="text-lg font-bold tabular-nums">{doneCount}</p><p className="text-[11px] text-zinc-400">series hechas</p></div>
              <div className="rounded-xl bg-zinc-800 p-3"><p className="text-lg font-bold tabular-nums">{fmtVolume(volumeOf(allSets))}</p><p className="text-[11px] text-zinc-400">volumen</p></div>
            </div>
            {doneCount === 0 && <p className="rounded-xl bg-amber-400/10 p-3 text-sm text-amber-300">No has marcado ninguna serie como hecha (✓). Puedes finalizar igualmente.</p>}
            <p className="text-sm text-zinc-400">Se guardará en el calendario: {fmtDateLong(session.date)}.</p>
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => setConfirm(null)}>Seguir entrenando</button>
              <button className="btn-primary flex-1" onClick={async () => { await finishSession(id); setRest(null); setConfirm(null); nav('/calendario'); }}>Finalizar y guardar</button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p>¿Eliminar la sesión y todas sus series? No se puede deshacer.</p>
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => setConfirm(null)}>Cancelar</button>
              <button className="btn-danger flex-1" onClick={async () => { setRest(null); await deleteSession(id); nav('/'); }}>Eliminar</button>
            </div>
          </div>
        )}
      </Sheet>

      <ExercisePicker open={picker} onClose={() => setPicker(false)} onPick={exId => addExerciseToSession(id, exId)} />

      {/* Temporizador de descanso fijo abajo */}
      {rest && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-700 bg-zinc-900 px-4 pt-3"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }} role="timer" aria-live="polite">
          <div className="mx-auto max-w-xl">
            <div className="mb-2 h-1.5 overflow-hidden rounded bg-zinc-800">
              <div className={`h-full transition-[width] duration-500 ${remaining <= 0 ? 'bg-rose-500' : 'bg-lime-400'}`}
                style={{ width: `${Math.max(0, Math.min(1, remaining / rest.total)) * 100}%` }} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <button className="btn-ghost" onClick={() => setRest({ ...rest, until: rest.until - 15000 })}>−15 s</button>
              <div className="text-center">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">{remaining <= 0 ? 'Tiempo extra' : 'Descanso'}</p>
                <p className={`font-mono text-4xl tabular-nums ${remaining <= 0 ? 'text-rose-400' : ''}`}>
                  {remaining <= 0 ? `+${fmtTime(-remaining)}` : fmtTime(remaining)}
                </p>
              </div>
              <button className="btn-ghost" onClick={() => setRest({ ...rest, until: rest.until + 15000, total: rest.total + 15 })}>+15 s</button>
              <button className="btn-ghost px-3 text-zinc-400" onClick={() => setRest(null)} aria-label="Cerrar temporizador">✕</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ExerciseCard({ item, sets, defaultRest, onComplete, isFirst, isLast, onMove, onRemove }: {
  item: SessionExercise; sets: WorkSet[]; defaultRest: number;
  onComplete: (s: WorkSet, restSec: number) => void;
  isFirst: boolean; isLast: boolean; onMove: (d: -1 | 1) => void; onRemove: () => void;
}) {
  const exercise = useLiveQuery(() => db.exercises.get(item.exerciseId), [item.exerciseId]);
  const previous = useLiveQuery(() => lastWorkSet(item.exerciseId, item.sessionId), [item.exerciseId, item.sessionId]);
  const [showMedia, setShowMedia] = useState(false);
  const [menu, setMenu] = useState(false);
  const restSec = item.restSec ?? defaultRest;

  if (!exercise) return null;
  const notes = item.notes ?? exercise.notes;
  const mode = modeOf(exercise);

  async function addSet() {
    const last = sets.at(-1) ?? previous;
    await db.sets.add({
      id: uid(), sessionId: item.sessionId, sessionExerciseId: item.id, exerciseId: item.exerciseId,
      idx: sets.length ? Math.max(...sets.map(s => s.idx)) + 1 : 0, kind: 'work',
      reps: mode === 'time' ? 0 : last?.reps ?? 10, weight: mode === 'time' ? 0 : last?.weight ?? 0, unit: last?.unit ?? 'kg',
      durationSec: mode === 'time' ? last?.durationSec ?? 0 : undefined,
      distanceKm: mode === 'time' ? last?.distanceKm : undefined,
      rpe: last?.rpe, rir: last?.rir, done: false,
    });
  }

  let workNo = 0;
  return (
    <section className="card overflow-hidden">
      <div className="flex items-start justify-between gap-2 p-4 pb-2">
        <div className="min-w-0">
          <h2 className="font-semibold leading-tight">{exercise.name}</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            <span className="capitalize">{exercise.muscle}</span>
            {item.target && <> · Objetivo: <span className="text-lime-400">{item.target}</span></>}
          </p>
          {previous && <p className="text-xs text-zinc-500">Anterior: <span className="text-zinc-300">{setSummary(previous, mode)}</span></p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {exercise.media.length > 0 && (
            <button onClick={() => setShowMedia(v => !v)} className={`btn-ghost px-3 text-sm ${showMedia ? 'text-lime-400' : ''}`} aria-label="Ver vídeo">▶</button>
          )}
          <button onClick={() => setMenu(v => !v)} className="btn-ghost px-3" aria-label="Opciones del ejercicio">⋯</button>
        </div>
      </div>

      {menu && (
        <div className="mx-4 mb-2 grid grid-cols-3 gap-2">
          <button className="btn-ghost text-sm" disabled={isFirst} onClick={() => onMove(-1)}>↑ Subir</button>
          <button className="btn-ghost text-sm" disabled={isLast} onClick={() => onMove(1)}>↓ Bajar</button>
          <button className="btn-danger text-sm" onClick={onRemove}>Quitar</button>
        </div>
      )}

      {showMedia && <div className="mb-2 space-y-2">{exercise.media.map((m, i) => <MediaViewer key={i} media={m} />)}</div>}
      {notes && <p className="mx-4 mb-2 rounded-lg bg-zinc-800/60 p-2 text-xs text-zinc-300">💡 {notes}</p>}

      <div className="mx-4 mb-2 flex items-center gap-2 text-xs text-zinc-400">
        <label htmlFor={`rest-${item.id}`}>Descanso entre series</label>
        <select id={`rest-${item.id}`} value={item.restSec ?? ''}
          onChange={e => db.sessionExercises.update(item.id, { restSec: e.target.value ? +e.target.value : undefined })}
          className="rounded-lg bg-zinc-800 px-2 py-1 text-zinc-100">
          <option value="">{fmtTime(defaultRest)} (global)</option>
          {REST_OPTIONS.map(s => <option key={s} value={s}>{fmtTime(s)}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-[2.25rem_1fr_1fr_3.25rem] gap-2 px-4 text-[11px] uppercase tracking-wide text-zinc-500">
        <span>{mode === 'time' ? 'Bloque' : 'Serie'}</span>
        {mode === 'time'
          ? <><span className="text-center">Tiempo (min)</span><span className="text-center">Distancia (km)</span></>
          : <><span className="text-center">Peso ({sets[0]?.unit ?? 'kg'})</span><span className="text-center">Reps</span></>}
        <span className="text-center">Hecha</span>
      </div>
      <ul className="divide-y divide-zinc-800">
        {sets.map(s => (
          <SetRow key={s.id} set={s} mode={mode} label={s.kind === 'warmup' ? 'C' : String(++workNo)} onComplete={() => onComplete(s, restSec)} />
        ))}
      </ul>
      <button onClick={addSet} className="min-h-12 w-full font-medium text-lime-400 active:bg-zinc-800">{mode === 'time' ? '+ Bloque' : '+ Serie'}</button>
    </section>
  );
}

function SetRow({ set, mode, label, onComplete }: { set: WorkSet; mode: ExerciseMode; label: string; onComplete: () => void }) {
  const upd = (p: Partial<WorkSet>) => db.sets.update(set.id, p);
  const [more, setMore] = useState(false);

  return (
    <li className={`px-4 py-3 ${set.done ? 'bg-lime-400/[.06]' : ''}`}>
      <div className="grid grid-cols-[2.25rem_1fr_1fr_3.25rem] items-center gap-2">
        <button onClick={() => setMore(v => !v)} aria-label="Opciones de la serie"
          className={`h-12 rounded-lg text-sm font-bold ${set.kind === 'warmup' ? 'text-amber-400' : 'text-zinc-400'}`}>{label}</button>
        {mode === 'time' ? (
          <>
            <Stepper label="minutos" value={Math.round(((set.durationSec ?? 0) / 60) * 10) / 10} step={1} onChange={v => upd({ durationSec: Math.round(v * 60) })} />
            <Stepper label="kilómetros" value={set.distanceKm ?? 0} step={0.5} onChange={v => upd({ distanceKm: v || undefined })} />
          </>
        ) : (
          <>
            <Stepper label="peso" value={set.weight} step={set.unit === 'kg' ? 2.5 : 5} onChange={v => upd({ weight: v })} />
            <Stepper label="repeticiones" value={set.reps} step={1} onChange={v => upd({ reps: Math.round(v) })} />
          </>
        )}
        <button onClick={() => (set.done ? upd({ done: false, completedAt: undefined, restTakenSec: undefined }) : onComplete())}
          aria-label={set.done ? 'Desmarcar serie' : 'Completar serie'} aria-pressed={set.done}
          className={`h-12 rounded-xl text-xl font-bold transition ${set.done ? 'bg-lime-400 text-zinc-950' : 'bg-zinc-800 text-zinc-500'}`}>✓</button>
      </div>

      {/* RPE con un toque; RIR se autocompleta como 10 − RPE y es editable */}
      <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
        <span>RPE{set.restTakenSec != null && <> · descanso real previo {fmtTime(set.restTakenSec)}</>}</span>
        <span className="flex items-center gap-1">
          <label htmlFor={`rir-${set.id}`}>RIR</label>
          <button type="button" className="h-8 w-8 rounded-lg bg-zinc-800 text-base text-zinc-300" aria-label="Restar RIR"
            onClick={() => upd({ rir: Math.max(0, (set.rir ?? 1) - 1) })}>−</button>
          <input id={`rir-${set.id}`} type="number" inputMode="numeric" min={0} max={10} value={set.rir ?? ''}
            onChange={e => upd({ rir: e.target.value === '' ? undefined : Math.max(0, Math.min(10, +e.target.value)) })}
            className="h-8 w-9 rounded-lg bg-zinc-800 text-center text-sm text-zinc-100 tabular-nums" />
          <button type="button" className="h-8 w-8 rounded-lg bg-zinc-800 text-base text-zinc-300" aria-label="Sumar RIR"
            onClick={() => upd({ rir: Math.min(10, (set.rir ?? -1) + 1) })}>+</button>
        </span>
      </div>
      <RpeChips value={set.rpe} onPick={r => set.rpe === r ? upd({ rpe: undefined, rir: undefined }) : upd({ rpe: r, rir: Math.max(0, Math.round(10 - r)) })} />


      {more && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          <button className="btn-ghost text-sm" onClick={() => upd({ kind: set.kind === 'warmup' ? 'work' : 'warmup' })}>
            {set.kind === 'warmup' ? 'Efectiva' : 'Calentamiento'}
          </button>
          <button className="btn-ghost text-sm" disabled={mode === 'time'} onClick={() => upd({ unit: set.unit === 'kg' ? 'lb' : 'kg' })}>
            Usar {set.unit === 'kg' ? 'lb' : 'kg'}
          </button>
          <button className="btn-danger text-sm" onClick={() => db.sets.delete(set.id)}>Borrar</button>
        </div>
      )}
    </li>
  );
}

/** Fila deslizable de RPE 0–10 (pasos de 0,5); al abrirse se centra en el valor elegido o en 7. */
function RpeChips({ value, onPick }: { value?: number; onPick: (r: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = ref.current;
    const chip = box?.querySelector<HTMLElement>(`[data-rpe="${value ?? 7}"]`);
    if (box && chip) box.scrollLeft = chip.offsetLeft - box.clientWidth / 2 + chip.clientWidth / 2;
  }, [value]);
  return (
    <div ref={ref} className="no-scrollbar relative mt-1 flex gap-1 overflow-x-auto scroll-smooth">
      {RPE_OPTIONS.map(r => (
        <button key={r} data-rpe={r} onClick={() => onPick(r)} aria-label={`RPE ${r}`} aria-pressed={value === r}
          className={`h-10 min-w-11 shrink-0 rounded-lg text-[13px] tabular-nums ${value === r ? 'bg-lime-400 font-bold text-zinc-950' : r % 1 ? 'bg-zinc-800/70 text-zinc-400' : 'bg-zinc-800 text-zinc-200'}`}>
          {String(r).replace('.', ',')}
        </button>
      ))}
    </div>
  );
}
