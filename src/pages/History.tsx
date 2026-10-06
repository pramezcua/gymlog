import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import PageHeader from '../components/PageHeader';
import { fmtDateLong, fmtTime, fmtVolume, rpeTone } from '../lib/utils';

export default function History() {
  const sessions = useLiveQuery(() => db.sessions.orderBy('date').reverse().toArray(), []) ?? [];
  const routines = useLiveQuery(() => db.routines.toArray(), []) ?? [];
  const color = (rid?: string) => routines.find(r => r.id === rid)?.color ?? '#71717a';

  return (
    <div className="pb-24">
      <PageHeader title="Historial" action={<Link to="/progreso" className="btn-ghost text-sm">Progreso</Link>} />
      <div className="space-y-2 p-4">
        {sessions.length === 0 && <p className="card p-6 text-center text-zinc-400">Todavía no hay sesiones registradas.</p>}
        {sessions.map(s => (
          <Link key={s.id} to={`/sesion/${s.id}`} className="card flex items-center gap-3 p-4 active:bg-zinc-800"
            style={{ borderLeft: `4px solid ${color(s.routineId)}` }}>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-zinc-500 first-letter:uppercase">{fmtDateLong(s.date)}</p>
              <p className="truncate font-semibold">{s.type}</p>
              {s.status === 'done' ? (
                <p className="text-sm text-zinc-400">{fmtTime(s.durationSec ?? 0)} · {fmtVolume(s.totalVolume ?? 0)}</p>
              ) : (
                <p className="text-sm text-lime-400">En curso</p>
              )}
            </div>
            {s.status === 'done' && (
              <div className="text-center">
                <p className="text-[10px] uppercase text-zinc-500">RPE</p>
                <p className="flex items-center gap-1 text-lg font-bold tabular-nums">
                  <i className={`h-2 w-2 rounded-full ${rpeTone(s.avgRpe)}`} />{s.avgRpe ?? '—'}
                </p>
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
