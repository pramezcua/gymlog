import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { db, uid, type CalendarEntry, type Routine, type Session } from '../db';
import PageHeader from '../components/PageHeader';
import Sheet from '../components/Sheet';
import { addDays, deleteSession, fmtDateLong, fmtTime, fmtVolume, rpeTone, startOfWeek, startSession, toISODate, todayISO } from '../lib/utils';

type View = 'month' | 'week';
const fmtKg = (kg: number) => `${Math.round(kg).toLocaleString('es-ES')}`;
const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export default function CalendarPage() {
  const nav = useNavigate();
  const [view, setView] = useState<View>('month');
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<CalendarEntry | null>(null);

  const days = view === 'month'
    ? Array.from({ length: 42 }, (_, i) => addDays(startOfWeek(new Date(cursor.getFullYear(), cursor.getMonth(), 1)), i))
    : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i));
  const from = toISODate(days[0]);
  const to = toISODate(days[days.length - 1]);

  const entries = useLiveQuery(() => db.calendar.where('date').between(from, to, true, true).toArray(), [from, to]) ?? [];
  const sessions = useLiveQuery(() => db.sessions.where('date').between(from, to, true, true).toArray(), [from, to]) ?? [];
  const routines = useLiveQuery(() => db.routines.toArray(), []) ?? [];
  const routineById = new Map(routines.map(r => [r.id, r]));
  const sessionById = new Map(sessions.map(s => [s.id, s]));
  const byDate = new Map<string, CalendarEntry[]>();
  for (const e of entries) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  // Orden dentro de cada día: hechas, en curso, programadas, saltadas
  const rank = (e: CalendarEntry) => (e.status === 'done' ? 0 : e.sessionId ? 1 : e.status === 'planned' ? 2 : 3);
  for (const list of byDate.values()) list.sort((a, b) => rank(a) - rank(b) || a.updatedAt - b.updatedAt);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }), // mantener pulsado para arrastrar
  );

  function onDragStart(e: DragStartEvent) {
    setDragging(entries.find(x => x.id === e.active.id) ?? null);
    navigator.vibrate?.(20);
  }
  async function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const date = e.over?.id as string | undefined;
    const entry = entries.find(x => x.id === e.active.id);
    if (date && entry && entry.date !== date) await db.calendar.update(entry.id, { date, updatedAt: Date.now() });
  }

  function shift(n: number) {
    setCursor(c => view === 'month' ? new Date(c.getFullYear(), c.getMonth() + n, 1) : addDays(c, 7 * n));
  }
  const title = view === 'month'
    ? cursor.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
    : `${days[0].toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`;
  const today = todayISO();

  return (
    <div className="pb-24">
      <PageHeader title="Calendario" action={
        <div className="flex rounded-xl bg-zinc-800 p-1 text-sm">
          {(['month', 'week'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} className={`rounded-lg px-3 py-1.5 ${view === v ? 'bg-zinc-950 text-lime-400' : 'text-zinc-400'}`}>
              {v === 'month' ? 'Mes' : 'Semana'}
            </button>
          ))}
        </div>
      } />

      <div className="flex items-center justify-between px-4 py-3">
        <button className="btn-ghost px-3" onClick={() => shift(-1)} aria-label="Anterior">‹</button>
        <button className="text-base font-semibold first-letter:uppercase" onClick={() => setCursor(new Date())}>{title}</button>
        <button className="btn-ghost px-3" onClick={() => shift(1)} aria-label="Siguiente">›</button>
      </div>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        {view === 'month' ? (
          <div className="px-2">
            <div className="grid grid-cols-7 pb-1 text-center text-[11px] text-zinc-500">{WEEKDAYS.map(d => <span key={d}>{d}</span>)}</div>
            <div className="grid grid-cols-7 gap-1">
              {days.map(d => {
                const iso = toISODate(d);
                return (
                  <DayCell key={iso} iso={iso} onTap={() => setSelected(iso)}
                    className={`min-h-20 rounded-lg p-1 ${d.getMonth() !== cursor.getMonth() ? 'opacity-40' : ''}`}>
                    <span className={`mb-0.5 inline-grid h-6 w-6 place-items-center rounded-full text-xs ${iso === today ? 'bg-lime-400 font-bold text-zinc-950' : 'text-zinc-300'}`}>{d.getDate()}</span>
                    <div className="space-y-0.5">
                      {(byDate.get(iso) ?? []).map(e => (
                        <EntryChip key={e.id} entry={e} routine={e.routineId ? routineById.get(e.routineId) : undefined}
                          session={e.sessionId ? sessionById.get(e.sessionId) : undefined} compact />
                      ))}
                    </div>
                  </DayCell>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-2 px-4">
            {days.map(d => {
              const iso = toISODate(d);
              const list = byDate.get(iso) ?? [];
              return (
                <DayCell key={iso} iso={iso} onTap={() => setSelected(iso)} className="card flex min-h-16 gap-3 p-3">
                  <div className={`w-10 shrink-0 text-center ${iso === today ? 'text-lime-400' : 'text-zinc-400'}`}>
                    <p className="text-[11px] uppercase">{d.toLocaleDateString('es-ES', { weekday: 'short' })}</p>
                    <p className="text-xl font-bold">{d.getDate()}</p>
                  </div>
                  <div className="flex-1 space-y-1">
                    {list.length === 0 && <p className="pt-2 text-sm text-zinc-600">Descanso</p>}
                    {list.map(e => (
                      <EntryChip key={e.id} entry={e} routine={e.routineId ? routineById.get(e.routineId) : undefined}
                        session={e.sessionId ? sessionById.get(e.sessionId) : undefined} />
                    ))}
                  </div>
                </DayCell>
              );
            })}
          </div>
        )}
        <DragOverlay>
          {dragging && <EntryChip entry={dragging} routine={dragging.routineId ? routineById.get(dragging.routineId) : undefined} overlay />}
        </DragOverlay>
      </DndContext>

      <div className="space-y-1 px-4 pt-4 text-xs text-zinc-500">
        <p><b className="text-zinc-300">✓ Color lleno</b> = rutina hecha · <b className="text-zinc-300">Contorno</b> = rutina programada.</p>
        <p>Toca un día para ver los kg movidos, programar una rutina o eliminar una que hayas puesto por error.</p>
        <p>Mantén pulsada una rutina programada y arrástrala a otro día para cambiarla de fecha.</p>
      </div>

      <DaySheet date={selected} onClose={() => setSelected(null)} routines={routines}
        entries={selected ? byDate.get(selected) ?? [] : []} sessionById={sessionById}
        onOpenSession={id => nav(`/sesion/${id}`)} />
    </div>
  );
}

function DayCell({ iso, onTap, className, children }: { iso: string; onTap: () => void; className: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: iso });
  return (
    <div ref={setNodeRef} onClick={onTap} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && onTap()}
      className={`${className} cursor-pointer transition ${isOver ? 'bg-lime-400/15 ring-2 ring-lime-400' : 'bg-zinc-900'}`}>
      {children}
    </div>
  );
}

function EntryChip({ entry, routine, session, compact, overlay }: {
  entry: CalendarEntry; routine?: Routine; session?: Session; compact?: boolean; overlay?: boolean;
}) {
  const canDrag = entry.status === 'planned' && !entry.sessionId && !overlay;
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: entry.id, disabled: !canDrag });
  const done = entry.status === 'done' && session;
  const name = routine?.name ?? session?.type ?? 'Sesión';
  const color = routine?.color ?? '#71717a';

  if (compact) {
    // Hecha: fondo de color lleno con ✓ · Programada: solo contorno
    return (
      <div ref={setNodeRef} {...listeners} {...attributes}
        className={`line-clamp-2 break-words rounded px-0.5 text-[10px] font-medium leading-[13px] tracking-tight ${isDragging ? 'opacity-30' : ''} ${entry.status === 'skipped' ? 'line-through opacity-50' : ''}`}
        style={done
          ? { background: color, color: '#09090b' }
          : { boxShadow: `inset 0 0 0 1px ${color}`, color, touchAction: canDrag ? 'none' : undefined }}
        title={done ? `${name} · ${fmtVolume(session.totalVolume ?? 0)} movidos` : `${name} (programada)`}>
        {done && '✓ '}{name}
      </div>
    );
  }
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      className={`flex items-center gap-2 rounded-lg bg-zinc-800 px-2 py-1.5 text-sm ${isDragging ? 'opacity-30' : ''} ${overlay ? 'shadow-xl ring-2 ring-lime-400' : ''} ${entry.status === 'skipped' ? 'line-through opacity-50' : ''}`}
      style={{ borderLeft: `4px solid ${color}`, touchAction: canDrag ? 'none' : undefined }}>
      {canDrag && <span className="text-zinc-500" aria-hidden>⠿</span>}
      <span className="flex-1 truncate font-medium">{name}</span>
      {done ? (
        <span className="text-xs text-lime-400">✓ hecha</span>
      ) : (
        <span className="text-xs text-zinc-500">{entry.sessionId ? 'en curso' : entry.status === 'skipped' ? 'saltada' : 'programada'}</span>
      )}
    </div>
  );
}

function DaySheet({ date, onClose, routines, entries, sessionById, onOpenSession }: {
  date: string | null; onClose: () => void; routines: Routine[]; entries: CalendarEntry[];
  sessionById: Map<string, Session>; onOpenSession: (id: string) => void;
}) {
  const [routineId, setRoutineId] = useState('');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  if (!date) return null;
  const isPast = date < todayISO();

  async function plan() {
    if (!routineId) return;
    await db.calendar.add({ id: uid(), date: date!, routineId, status: 'planned', updatedAt: Date.now() });
    setRoutineId('');
  }

  return (
    <Sheet open onClose={onClose} title={fmtDateLong(date)}>
      <div className="space-y-2">
        {entries.length === 0 && <p className="text-sm text-zinc-500">Ninguna rutina este día.</p>}
        {entries.map(e => {
          const r = routines.find(x => x.id === e.routineId);
          const s = e.sessionId ? sessionById.get(e.sessionId) : undefined;
          return (
            <div key={e.id} className="card space-y-2 p-3" style={{ borderLeft: `4px solid ${r?.color ?? '#71717a'}` }}>
              <div className="flex items-center justify-between">
                <p className="font-semibold">{r?.name ?? s?.type ?? 'Sesión'}</p>
                <span className={`text-xs ${e.status === 'done' ? 'text-lime-400' : 'text-zinc-500'}`}>{e.status === 'done' ? '✓ hecha' : e.status === 'skipped' ? 'saltada' : s ? 'en curso' : 'programada'}</span>
              </div>
              {s?.status === 'done' && (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-zinc-800 p-2">
                    <p className="text-lg font-bold tabular-nums text-lime-400">{fmtKg(s.totalVolume ?? 0)}</p>
                    <p className="text-[11px] text-zinc-400">kg movidos</p>
                  </div>
                  <div className="rounded-xl bg-zinc-800 p-2">
                    <p className="text-lg font-bold tabular-nums">{fmtTime(s.durationSec ?? 0)}</p>
                    <p className="text-[11px] text-zinc-400">duración</p>
                  </div>
                  <div className="rounded-xl bg-zinc-800 p-2">
                    <p className="flex items-center justify-center gap-1 text-lg font-bold tabular-nums">
                      <i className={`h-2 w-2 rounded-full ${rpeTone(s.avgRpe)}`} />{s.avgRpe ?? '—'}
                    </p>
                    <p className="text-[11px] text-zinc-400">RPE medio</p>
                  </div>
                </div>
              )}
              {confirmDel === e.id ? (
                <div className="space-y-2 rounded-xl border border-rose-500/40 p-3">
                  <p className="text-sm">¿Eliminar {s ? 'esta rutina hecha y todas sus series' : 'esta rutina del calendario'}? No se puede deshacer.</p>
                  <div className="flex gap-2">
                    <button className="btn-ghost flex-1 text-sm" onClick={() => setConfirmDel(null)}>Cancelar</button>
                    <button className="btn-danger flex-1 text-sm" onClick={async () => {
                      if (s) await deleteSession(s.id); else await db.calendar.delete(e.id);
                      setConfirmDel(null);
                    }}>Eliminar</button>
                  </div>
                </div>
              ) : (
              <div className="flex flex-wrap gap-2">
                {s && <button className="btn-ghost text-sm" onClick={() => onOpenSession(s.id)}>{s.status === 'done' ? 'Ver / editar series' : 'Continuar'}</button>}
                {!s && e.status === 'planned' && r && (
                  <button className="btn-primary text-sm" onClick={async () => onOpenSession(await startSession({ routineId: r.id, date, calendarId: e.id }))}>
                    Empezar
                  </button>
                )}
                {!s && (
                  <button className="btn-ghost text-sm" onClick={() => db.calendar.update(e.id, { status: e.status === 'skipped' ? 'planned' : 'skipped', updatedAt: Date.now() })}>
                    {e.status === 'skipped' ? 'Reactivar' : 'Marcar saltado'}
                  </button>
                )}
                <button className="btn-danger text-sm" onClick={() => setConfirmDel(e.id)}>Eliminar</button>
              </div>
              )}
            </div>
          );
        })}

        <div className="pt-2">
          <label className="label" htmlFor="plan-routine">{isPast ? 'Añadir una rutina a este día' : 'Programar una rutina'}</label>
          <div className="flex gap-2">
            <select id="plan-routine" className="input" value={routineId} onChange={e => setRoutineId(e.target.value)}>
              <option value="">Elegir rutina…</option>
              {routines.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <button className="btn-primary" disabled={!routineId} onClick={plan}>Añadir</button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

