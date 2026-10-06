import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router';
import { db } from '../db';
import { addDays, fmtDateLong, fmtVolume, startOfWeek, startSession, toISODate, todayISO } from '../lib/utils';

export default function Home() {
  const nav = useNavigate();
  const today = todayISO();
  const active = useLiveQuery(() => db.sessions.where('status').equals('active').toArray(), []) ?? [];
  const planned = useLiveQuery(() => db.calendar.where('date').equals(today).filter(c => c.status === 'planned' && !c.sessionId).toArray(), [today]) ?? [];
  const routines = useLiveQuery(() => db.routines.orderBy('name').toArray(), []) ?? [];
  const weekStart = toISODate(startOfWeek(new Date()));
  const weekEnd = toISODate(addDays(startOfWeek(new Date()), 6));
  const week = useLiveQuery(() => db.sessions.where('date').between(weekStart, weekEnd, true, true).filter(s => s.status === 'done').toArray(), [weekStart]) ?? [];
  const routineById = new Map(routines.map(r => [r.id, r]));

  const go = async (routineId?: string, calendarId?: string) => nav(`/sesion/${await startSession({ routineId, calendarId })}`);
  const weekVol = week.reduce((a, s) => a + (s.totalVolume ?? 0), 0);
  const weekTime = week.reduce((a, s) => a + (s.durationSec ?? 0), 0);

  return (
    <div className="space-y-5 px-4 pb-24" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}>
      <header>
        <p className="text-sm text-zinc-500 first-letter:uppercase">{fmtDateLong(today)}</p>
        <h1 className="text-2xl font-bold">Hoy</h1>
      </header>

      {active.map(s => (
        <Link key={s.id} to={`/sesion/${s.id}`} className="card flex items-center justify-between border-lime-400/40 p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-lime-400">En curso</p>
            <p className="font-semibold">{s.type}</p>
          </div>
          <span className="btn-primary">Continuar</span>
        </Link>
      ))}

      {planned.length > 0 && (
        <section className="space-y-2">
          <h2 className="label">Planificado para hoy</h2>
          {planned.map(p => {
            const r = p.routineId ? routineById.get(p.routineId) : undefined;
            return (
              <div key={p.id} className="card flex items-center gap-3 p-4">
                <span className="h-10 w-1.5 rounded-full" style={{ background: r?.color ?? '#71717a' }} />
                <div className="flex-1">
                  <p className="font-semibold">{r?.name ?? 'Rutina eliminada'}</p>
                  <p className="text-xs text-zinc-500">{r ? `${r.items.length} ejercicios` : ''}</p>
                </div>
                <button className="btn-primary" disabled={!r} onClick={() => go(r?.id, p.id)}>Empezar</button>
              </div>
            );
          })}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="label">Empezar entrenamiento</h2>
        <div className="grid grid-cols-2 gap-2">
          {routines.map(r => (
            <button key={r.id} onClick={() => go(r.id)} className="card min-h-20 p-3 text-left active:bg-zinc-800">
              <span className="mb-1 block h-1 w-8 rounded-full" style={{ background: r.color }} />
              <span className="block font-semibold">{r.name}</span>
              <span className="text-xs text-zinc-500">{r.items.length} ejercicios</span>
            </button>
          ))}
          <button onClick={() => go()} className="min-h-20 rounded-2xl border-2 border-dashed border-zinc-700 p-3 text-zinc-300 active:bg-zinc-900">
            + Sesión libre
          </button>
        </div>
      </section>

      <section className="card grid grid-cols-3 divide-x divide-zinc-800 p-4 text-center">
        <div><p className="text-2xl font-bold tabular-nums">{week.length}</p><p className="text-xs text-zinc-500">sesiones esta semana</p></div>
        <div><p className="text-2xl font-bold tabular-nums">{fmtVolume(weekVol)}</p><p className="text-xs text-zinc-500">volumen</p></div>
        <div><p className="text-2xl font-bold tabular-nums">{Math.floor(weekTime / 3600)}h {Math.floor((weekTime % 3600) / 60)}m</p><p className="text-xs text-zinc-500">tiempo</p></div>
      </section>
    </div>
  );
}
