import { useState } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Session } from '../db';
import PageHeader from '../components/PageHeader';
import Sheet from '../components/Sheet';
import { deleteSession, fmtDateLong, fmtTime, fmtVolume, rpeTone } from '../lib/utils';

export default function History() {
  const sessions = useLiveQuery(() => db.sessions.orderBy('date').reverse().toArray(), []) ?? [];
  const routines = useLiveQuery(() => db.routines.toArray(), []) ?? [];
  // Nº de series hechas por sesión, para detectar las que no se usaron
  const doneBySession = useLiveQuery(async () => {
    const m = new Map<string, number>();
    await db.sets.each(s => { if (s.done) m.set(s.sessionId, (m.get(s.sessionId) ?? 0) + 1); });
    return m;
  }, []);
  const [toDelete, setToDelete] = useState<Session[] | null>(null);
  const [busy, setBusy] = useState(false);
  const color = (rid?: string) => routines.find(r => r.id === rid)?.color ?? '#71717a';
  const isEmpty = (s: Session) => doneBySession !== undefined && !doneBySession.get(s.id);
  const empty = sessions.filter(isEmpty);

  async function confirmDelete() {
    if (!toDelete) return;
    setBusy(true);
    for (const s of toDelete) await deleteSession(s.id);
    setBusy(false);
    setToDelete(null);
  }

  return (
    <div className="pb-24">
      <PageHeader title="Historial" action={<Link to="/progreso" className="btn-ghost text-sm">Progreso</Link>} />
      <div className="space-y-2 p-4">
        {sessions.length === 0 && <p className="card p-6 text-center text-zinc-400">Todavía no hay sesiones registradas.</p>}

        {empty.length > 1 && (
          <button onClick={() => setToDelete(empty)} className="btn-ghost w-full text-sm text-amber-300">
            Borrar las {empty.length} sesiones sin series hechas
          </button>
        )}

        {sessions.map(s => (
          <div key={s.id} className="card flex items-stretch overflow-hidden" style={{ borderLeft: `4px solid ${color(s.routineId)}` }}>
            <Link to={`/sesion/${s.id}`} className="flex min-w-0 flex-1 items-center gap-3 p-4 active:bg-zinc-800">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-zinc-500 first-letter:uppercase">{fmtDateLong(s.date)}</p>
                <p className="truncate font-semibold">{s.type}</p>
                {s.status === 'done' ? (
                  <p className="text-sm text-zinc-400">{fmtTime(s.durationSec ?? 0)} · {fmtVolume(s.totalVolume ?? 0)}</p>
                ) : (
                  <p className="text-sm text-lime-400">En curso</p>
                )}
                {isEmpty(s) && <p className="mt-0.5 text-xs text-amber-300">Sin series hechas</p>}
              </div>
              {s.status === 'done' && !isEmpty(s) && (
                <div className="text-center">
                  <p className="text-[10px] uppercase text-zinc-500">RPE</p>
                  <p className="flex items-center gap-1 text-lg font-bold tabular-nums">
                    <i className={`h-2 w-2 rounded-full ${rpeTone(s.avgRpe)}`} />{s.avgRpe ?? '—'}
                  </p>
                </div>
              )}
            </Link>
            <button onClick={() => setToDelete([s])} aria-label={`Borrar sesión ${s.type} del ${fmtDateLong(s.date)}`}
              className="w-14 shrink-0 border-l border-zinc-800 text-zinc-500 active:bg-rose-500/20 active:text-rose-300">
              <svg viewBox="0 0 24 24" className="mx-auto h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <Sheet open={toDelete != null} onClose={() => setToDelete(null)}
        title={toDelete && toDelete.length > 1 ? `Borrar ${toDelete.length} sesiones` : 'Borrar sesión'}>
        {toDelete && (
          <div className="space-y-3">
            {toDelete.length === 1 ? (
              <p>
                ¿Borrar <b>{toDelete[0].type}</b> del {fmtDateLong(toDelete[0].date)}
                {doneBySession?.get(toDelete[0].id) ? ` y sus ${doneBySession.get(toDelete[0].id)} series` : ''}?
              </p>
            ) : (
              <p>Se borrarán todas las sesiones en las que no marcaste ninguna serie como hecha.</p>
            )}
            <p className="text-sm text-zinc-400">{toDelete.length > 1 ? 'Desaparecerán' : 'Desaparecerá'} del historial, del calendario y de tus otros dispositivos. No se puede deshacer. La rutina (plantilla) no se borra.</p>
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => setToDelete(null)}>Cancelar</button>
              <button className="btn-danger flex-1" disabled={busy} onClick={confirmDelete}>{busy ? 'Borrando…' : 'Borrar'}</button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
