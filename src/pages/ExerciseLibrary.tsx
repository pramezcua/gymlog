import { useState } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, MUSCLES, type Muscle } from '../db';
import PageHeader from '../components/PageHeader';

export default function ExerciseLibrary() {
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<Muscle | ''>('');
  const all = useLiveQuery(() => db.exercises.orderBy('name').toArray(), []) ?? [];
  const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const list = all.filter(e => (!muscle || e.muscle === muscle) && norm(e.name).includes(norm(q)));

  return (
    <div className="pb-24">
      <PageHeader back title="Ejercicios" action={<Link to="/ejercicios/nuevo" className="btn-primary">+ Nuevo</Link>} />
      <div className="p-4">
        <input className="input" placeholder="Buscar ejercicio…" value={q} onChange={e => setQ(e.target.value)} />
        <div className="no-scrollbar -mx-4 my-3 flex gap-2 overflow-x-auto px-4">
          {(['', ...MUSCLES] as const).map(m => (
            <button key={m || 'all'} onClick={() => setMuscle(m)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm capitalize ${muscle === m ? 'bg-lime-400 text-zinc-950' : 'bg-zinc-800 text-zinc-300'}`}>{m || 'Todos'}</button>
          ))}
        </div>
        <ul className="card divide-y divide-zinc-800">
          {list.map(e => (
            <li key={e.id}>
              <Link to={`/ejercicios/${e.id}`} className="flex min-h-14 items-center justify-between px-4 py-2 active:bg-zinc-800">
                <div>
                  <p>{e.name}</p>
                  <p className="text-xs capitalize text-zinc-500">{e.muscle}{e.media.length ? ` · ▶ ${e.media.length}` : ''}</p>
                </div>
                <span className="text-zinc-600">›</span>
              </Link>
            </li>
          ))}
          {list.length === 0 && <li className="p-4 text-center text-zinc-500">Sin resultados</li>}
        </ul>
      </div>
    </div>
  );
}
