import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid, type Routine, type RoutineItem } from '../db';
import PageHeader from '../components/PageHeader';
import ExercisePicker from '../components/ExercisePicker';
import { REST_OPTIONS, RPE_OPTIONS, fmtTime } from '../lib/utils';

const COLORS = ['#a3e635', '#38bdf8', '#f97316', '#e879f9', '#facc15', '#f43f5e', '#2dd4bf', '#a78bfa'];
const TYPES = ['Empuje', 'Jalón', 'Pierna', 'Torso', 'Full body', 'Brazos', 'Cardio', 'Otro'];

export default function RoutineEditor() {
  const { id = 'nueva' } = useParams();
  const nav = useNavigate();
  const isNew = id === 'nueva';
  const [r, setR] = useState<Routine | null>(null);
  const [picker, setPicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const exercises = useLiveQuery(() => db.exercises.toArray(), []) ?? [];
  const exName = (eid: string) => exercises.find(e => e.id === eid)?.name ?? '…';

  useEffect(() => {
    if (isNew) setR({ id: uid(), name: '', type: 'Empuje', color: COLORS[0], defaultRestSec: 120, items: [], updatedAt: Date.now() });
    else db.routines.get(id).then(x => setR(x ?? null));
  }, [id, isNew]);

  if (!r) return <div className="p-6 text-zinc-500">Cargando…</div>;

  const patch = (p: Partial<Routine>) => setR({ ...r, ...p });
  const patchItem = (i: number, p: Partial<RoutineItem>) => patch({ items: r.items.map((it, j) => (j === i ? { ...it, ...p } : it)) });
  const move = (i: number, d: number) => {
    const items = [...r.items];
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    patch({ items });
  };
  async function save() {
    await db.routines.put({ ...r!, name: r!.name.trim() || r!.type, updatedAt: Date.now() });
    nav('/rutinas');
  }

  return (
    <div className="pb-28">
      <PageHeader back title={isNew ? 'Nueva rutina' : 'Editar rutina'} action={<button className="btn-primary" onClick={save}>Guardar</button>} />
      <div className="space-y-4 p-4">
        <div>
          <label className="label" htmlFor="rname">Nombre</label>
          <input id="rname" className="input" placeholder="p. ej. Empuje A" value={r.name} onChange={e => patch({ name: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="rtype">Tipo</label>
            <input id="rtype" className="input" list="rtypes" value={r.type} onChange={e => patch({ type: e.target.value })} />
            <datalist id="rtypes">{TYPES.map(t => <option key={t} value={t} />)}</datalist>
          </div>
          <div>
            <label className="label" htmlFor="rrest">Descanso global</label>
            <select id="rrest" className="input" value={r.defaultRestSec} onChange={e => patch({ defaultRestSec: +e.target.value })}>
              {REST_OPTIONS.map(s => <option key={s} value={s}>{fmtTime(s)}</option>)}
            </select>
          </div>
        </div>
        <div>
          <span className="label">Color</span>
          <div className="flex flex-wrap gap-2">
            {COLORS.map(c => (
              <button key={c} onClick={() => patch({ color: c })} aria-label={`Color ${c}`}
                className={`h-9 w-9 rounded-full ${r.color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-950' : ''}`} style={{ background: c }} />
            ))}
          </div>
        </div>

        <h2 className="label pt-2">Ejercicios</h2>
        {r.items.map((it, i) => (
          <div key={i} className="card space-y-3 p-3">
            <div className="flex items-center gap-2">
              <span className="w-6 text-center text-sm font-bold text-zinc-500">{i + 1}</span>
              <p className="flex-1 font-semibold">{exName(it.exerciseId)}</p>
              <button className="btn-ghost px-3" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir">↑</button>
              <button className="btn-ghost px-3" disabled={i === r.items.length - 1} onClick={() => move(i, 1)} aria-label="Bajar">↓</button>
              <button className="btn-danger px-3" onClick={() => patch({ items: r.items.filter((_, j) => j !== i) })} aria-label="Quitar">✕</button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Num label="Series" value={it.targetSets} onChange={v => patchItem(i, { targetSets: Math.max(1, v) })} />
              <Num label="Reps mín" value={it.repsMin} onChange={v => patchItem(i, { repsMin: v })} />
              <Num label="Reps máx" value={it.repsMax} onChange={v => patchItem(i, { repsMax: v })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">RPE objetivo</label>
                <select className="input" value={it.targetRpe ?? ''} onChange={e => patchItem(i, { targetRpe: e.target.value ? +e.target.value : undefined })}>
                  <option value="">—</option>
                  {RPE_OPTIONS.map(x => <option key={x} value={x}>RPE {String(x).replace('.', ',')}{x >= 5 ? ` · RIR ${Math.round(10 - x)}` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Descanso</label>
                <select className="input" value={it.restSec ?? ''} onChange={e => patchItem(i, { restSec: e.target.value ? +e.target.value : undefined })}>
                  <option value="">Global ({fmtTime(r.defaultRestSec)})</option>
                  {REST_OPTIONS.map(s => <option key={s} value={s}>{fmtTime(s)}</option>)}
                </select>
              </div>
            </div>
            <input className="input" placeholder="Notas para esta rutina (opcional)" value={it.notes ?? ''}
              onChange={e => patchItem(i, { notes: e.target.value || undefined })} />
          </div>
        ))}
        <button onClick={() => setPicker(true)} className="min-h-14 w-full rounded-2xl border-2 border-dashed border-zinc-700 text-zinc-300">+ Añadir ejercicio</button>

        {!isNew && (confirmDelete ? (
          <div className="card space-y-2 p-3">
            <p>¿Eliminar la rutina? Las sesiones ya registradas se conservan.</p>
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => setConfirmDelete(false)}>Cancelar</button>
              <button className="btn-danger flex-1" onClick={async () => { await db.routines.delete(r.id); nav('/rutinas'); }}>Eliminar</button>
            </div>
          </div>
        ) : <button className="btn-danger w-full" onClick={() => setConfirmDelete(true)}>Eliminar rutina</button>)}
      </div>

      <ExercisePicker open={picker} onClose={() => setPicker(false)}
        onPick={exerciseId => setR(cur => cur && ({ ...cur, items: [...cur.items, { exerciseId, targetSets: 3, repsMin: 8, repsMax: 12 }] }))} />
    </div>
  );
}

function Num({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input type="number" inputMode="numeric" className="input text-center" value={value}
        onFocus={e => e.target.select()} onChange={e => onChange(Math.max(0, Math.round(+e.target.value || 0)))} />
    </div>
  );
}
