import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid, MUSCLES, type ID, type Muscle } from '../db';
import Sheet from './Sheet';

/** Buscador de ejercicios con alta rápida si no existe. */
export default function ExercisePicker({ open, onClose, onPick }: {
  open: boolean; onClose: () => void; onPick: (id: ID) => void;
}) {
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<Muscle | ''>('');
  const all = useLiveQuery(() => db.exercises.orderBy('name').toArray(), []) ?? [];
  const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const list = all.filter(e => (!muscle || e.muscle === muscle) && norm(e.name).includes(norm(q)));

  async function createNew() {
    const id = uid();
    await db.exercises.add({ id, name: q.trim(), muscle: muscle || 'otro', media: [], updatedAt: Date.now() });
    pick(id);
  }
  function pick(id: ID) { onPick(id); setQ(''); onClose(); }

  return (
    <Sheet open={open} onClose={onClose} title="Añadir ejercicio">
      <input className="input" placeholder="Buscar…" value={q} onChange={e => setQ(e.target.value)} autoFocus />
      <div className="no-scrollbar -mx-4 my-3 flex gap-2 overflow-x-auto px-4">
        {(['', ...MUSCLES] as const).map(m => (
          <button key={m || 'all'} onClick={() => setMuscle(m)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm capitalize ${muscle === m ? 'bg-lime-400 text-zinc-950' : 'bg-zinc-800 text-zinc-300'}`}>
            {m || 'Todos'}
          </button>
        ))}
      </div>
      <ul className="divide-y divide-zinc-800">
        {list.map(e => (
          <li key={e.id}>
            <button onClick={() => pick(e.id)} className="flex min-h-12 w-full items-center justify-between py-2 text-left">
              <span>{e.name}</span><span className="text-xs capitalize text-zinc-500">{e.muscle}</span>
            </button>
          </li>
        ))}
      </ul>
      {q.trim() && !all.some(e => norm(e.name) === norm(q.trim())) && (
        <button onClick={createNew} className="btn-ghost mt-3 w-full">+ Crear «{q.trim()}»</button>
      )}
    </Sheet>
  );
}
