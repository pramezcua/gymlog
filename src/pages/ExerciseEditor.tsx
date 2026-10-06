import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { db, uid, MUSCLES, type Exercise, type ExerciseMode, type Muscle } from '../db';
import PageHeader from '../components/PageHeader';
import MediaViewer from '../components/MediaViewer';
import { mediaFromUrl, modeOf } from '../lib/utils';

const MAX_MB = 50;

export default function ExerciseEditor() {
  const { id = 'nuevo' } = useParams();
  const nav = useNavigate();
  const isNew = id === 'nuevo';
  const [ex, setEx] = useState<Exercise | null>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (isNew) setEx({ id: uid(), name: '', muscle: 'pecho', media: [], updatedAt: Date.now() });
    else db.exercises.get(id).then(x => setEx(x ?? null));
  }, [id, isNew]);

  if (!ex) return <div className="p-6 text-zinc-500">Cargando…</div>;
  const patch = (p: Partial<Exercise>) => setEx(cur => cur && { ...cur, ...p });

  function addUrl() {
    if (!/^https?:\/\//i.test(url.trim())) { setError('Introduce un enlace que empiece por http:// o https://'); return; }
    patch({ media: [...ex!.media, mediaFromUrl(url)] });
    setUrl(''); setError('');
  }
  async function addFile(file?: File) {
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) { setError(`El archivo supera ${MAX_MB} MB. Usa un enlace de YouTube/Vimeo.`); return; }
    const blobId = uid();
    await db.media.add({ id: blobId, blob: file, mime: file.type, name: file.name });
    setEx(cur => cur && { ...cur, media: [...cur.media, { kind: 'blob', blobId, name: file.name }] });
    setError('');
  }
  async function removeMedia(i: number) {
    const m = ex!.media[i];
    if (m.kind === 'blob' && m.blobId) await db.media.delete(m.blobId);
    patch({ media: ex!.media.filter((_, j) => j !== i) });
  }
  async function save() {
    if (!ex!.name.trim()) { setError('El nombre es obligatorio.'); return; }
    await db.exercises.put({ ...ex!, name: ex!.name.trim(), updatedAt: Date.now() });
    nav(-1);
  }
  async function remove() {
    const used = await db.sets.where('exerciseId').equals(ex!.id).count();
    if (used) { setError(`No se puede eliminar: tiene ${used} series registradas en tus entrenamientos.`); setConfirmDelete(false); return; }
    for (const m of ex!.media) if (m.blobId) await db.media.delete(m.blobId);
    await db.exercises.delete(ex!.id);
    nav('/ejercicios');
  }

  return (
    <div className="pb-24">
      <PageHeader back title={isNew ? 'Nuevo ejercicio' : 'Editar ejercicio'} action={<button className="btn-primary" onClick={save}>Guardar</button>} />
      <div className="space-y-4 p-4">
        <div>
          <label className="label" htmlFor="ename">Nombre</label>
          <input id="ename" className="input" value={ex.name} onChange={e => patch({ name: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="emuscle">Grupo muscular principal</label>
          <select id="emuscle" className="input capitalize" value={ex.muscle} onChange={e => patch({ muscle: e.target.value as Muscle })}>
            {MUSCLES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <span className="label">Tipo de registro</span>
          <div className="flex rounded-xl bg-zinc-800 p-1 text-sm" role="radiogroup" aria-label="Tipo de registro">
            {([['reps', 'Peso y repeticiones'], ['time', 'Tiempo y distancia']] as [ExerciseMode, string][]).map(([m, txt]) => (
              <button key={m} type="button" role="radio" aria-checked={modeOf(ex) === m} onClick={() => patch({ mode: m })}
                className={`flex-1 rounded-lg py-2 ${modeOf(ex) === m ? 'bg-zinc-950 text-lime-400' : 'text-zinc-400'}`}>{txt}</button>
            ))}
          </div>
          <p className="mt-1 text-xs text-zinc-500">Usa «Tiempo y distancia» para bicicleta, cinta, elíptica, remo…</p>
        </div>
        <div>
          <label className="label" htmlFor="enotes">Notas e instrucciones técnicas</label>
          <textarea id="enotes" className="input min-h-28 py-2" value={ex.notes ?? ''} onChange={e => patch({ notes: e.target.value || undefined })}
            placeholder="Puntos clave de la técnica, ajustes de la máquina, errores a evitar…" />
        </div>

        <section className="space-y-2">
          <h2 className="label">Multimedia</h2>
          {ex.media.map((m, i) => (
            <div key={i} className="card overflow-hidden">
              <MediaViewer media={m} />
              <div className="flex items-center justify-between gap-2 p-2 text-xs text-zinc-400">
                <span className="truncate">{m.kind === 'blob' ? `Archivo local · ${m.name}` : m.url}</span>
                <button className="btn-danger min-h-9 text-xs" onClick={() => removeMedia(i)}>Quitar</button>
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <input className="input" inputMode="url" placeholder="Enlace de YouTube, Vimeo, .mp4 o .gif" value={url}
              onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && addUrl()} />
            <button className="btn-ghost" onClick={addUrl}>Añadir</button>
          </div>
          <label className="btn-ghost w-full cursor-pointer">
            Subir vídeo o GIF desde el dispositivo
            <input type="file" accept="video/*,image/*" className="hidden" onChange={e => addFile(e.target.files?.[0])} />
          </label>
          <p className="text-xs text-zinc-500">Los archivos subidos se guardan solo en este dispositivo y no se incluyen en la copia JSON. Para tenerlos en varios dispositivos, usa enlaces.</p>
        </section>

        {error && <p className="rounded-xl bg-rose-500/15 p-3 text-sm text-rose-300">{error}</p>}

        {!isNew && (confirmDelete ? (
          <div className="card space-y-2 p-3">
            <p>¿Eliminar este ejercicio?</p>
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => setConfirmDelete(false)}>Cancelar</button>
              <button className="btn-danger flex-1" onClick={remove}>Eliminar</button>
            </div>
          </div>
        ) : <button className="btn-danger w-full" onClick={() => setConfirmDelete(true)}>Eliminar ejercicio</button>)}
      </div>
    </div>
  );
}
