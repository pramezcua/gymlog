import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router';
import { db } from '../db';
import PageHeader from '../components/PageHeader';
import { startSession } from '../lib/utils';

export default function Routines() {
  const nav = useNavigate();
  const routines = useLiveQuery(() => db.routines.orderBy('name').toArray(), []) ?? [];
  const exCount = useLiveQuery(() => db.exercises.count(), []) ?? 0;

  return (
    <div className="pb-24">
      <PageHeader title="Rutinas" action={<Link to="/rutinas/nueva" className="btn-primary">+ Nueva</Link>} />
      <div className="space-y-3 p-4">
        {routines.map(r => (
          <div key={r.id} className="card overflow-hidden" style={{ borderLeft: `4px solid ${r.color}` }}>
            <Link to={`/rutinas/${r.id}`} className="block p-4 active:bg-zinc-800">
              <div className="flex items-baseline justify-between">
                <p className="text-lg font-semibold">{r.name}</p>
                <p className="text-xs text-zinc-500">{r.type}</p>
              </div>
              <p className="text-sm text-zinc-400">{r.items.length} ejercicios · {r.items.reduce((a, i) => a + i.targetSets, 0)} series</p>
            </Link>
            <div className="flex gap-2 border-t border-zinc-800 p-2">
              <Link to={`/rutinas/${r.id}`} className="btn-ghost flex-1 text-sm">Editar</Link>
              <button className="btn-primary flex-1 text-sm" onClick={async () => nav(`/sesion/${await startSession({ routineId: r.id })}`)}>Empezar</button>
            </div>
          </div>
        ))}
        {routines.length === 0 && <p className="text-center text-zinc-500">Aún no hay rutinas.</p>}

        <Link to="/ejercicios" className="card flex items-center justify-between p-4 active:bg-zinc-800">
          <div>
            <p className="font-semibold">Biblioteca de ejercicios</p>
            <p className="text-sm text-zinc-400">{exCount} ejercicios · vídeos y notas técnicas</p>
          </div>
          <span className="text-2xl text-zinc-500">›</span>
        </Link>
      </div>
    </div>
  );
}
