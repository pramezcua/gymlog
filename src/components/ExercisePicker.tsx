import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid, MUSCLES, type ID, type Muscle } from '../db';
import Sheet from './Sheet';

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

/** Buscador de ejercicios: sugiere los ya guardados que empiezan por lo escrito y permite crear uno nuevo. */
export default function ExercisePicker({ open, onClose, onPick }: {
  open: boolean; onClose: () => void; onPick: (id: ID) => void;
}) {
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<Muscle>('pecho');
  const all = useLiveQuery(() => db.exercises.orderBy('name').toArray(), []) ?? [];
  const query = norm(q);
  const list = query ? all.filter(e => norm(e.name).startsWith(query)) : all;
  const exists = all.some(e => norm(e.name) === query);

  async function createNew() {
    const id = uid();
    await db.exercises.add({ id, name: q.trim(), muscle, media: [], updatedAt: Date.now() });
    pick(id);
  }
  function pick(id: ID) { onPick(id); setQ(''); onClose(); }

  return (
    <Sheet open={open} onClose={onClose} title="Añadir ejercicio">
      <input className="input" placeholder="Escribe el nombre del ejercicio…" value={q} autoFocus
        autoComplete="off" autoCapitalize="sentences" onChange={e => setQ(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && list.length === 1) pick(list[0].id); }} />

      <p className="mt-3 mb-1 text-xs text-zinc-500">
        {query ? (list.length ? `${list.length} ejercicio${list.length > 1 ? 's' : ''} guardado${list.length > 1 ? 's' : ''} que empieza${list.length > 1 ? 'n' : ''} por «${q.trim()}»` : 'Ningún ejercicio guardado empieza así') : 'Tus ejercicios guardados'}
      </p>
      <ul className="divide-y divide-zinc-800">
        {list.map(e => (
          <li key={e.id}>
            <button onClick={() => pick(e.id)} className="flex min-h-12 w-full items-center justify-between gap-2 py-2 text-left">
              <span>
                <b className="text-lime-400">{e.name.slice(0, q.trim().length)}</b>{e.name.slice(q.trim().length)}
              </span>
              <span className="shrink-0 text-xs capitalize text-zinc-500">{e.muscle}</span>
            </button>
          </li>
        ))}
      </ul>

      {query && !exists && (
        <div className="mt-3 flex gap-2 border-t border-zinc-800 pt-3">
          <button onClick={createNew} className={`${list.length ? 'btn-ghost' : 'btn-primary'} min-w-0 flex-1 truncate`}>+ Crear «{q.trim()}»</button>
          <select aria-label="Grupo muscular del nuevo ejercicio" className="input w-auto capitalize"
            value={muscle} onChange={e => setMuscle(e.target.value as Muscle)}>
            {MUSCLES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      )}
      {query && !exists && muscle === 'cardio' && (
        <p className="mt-1 text-xs text-zinc-500">Los ejercicios de cardio se registran por tiempo y distancia.</p>
      )}

    </Sheet>
  );
}
