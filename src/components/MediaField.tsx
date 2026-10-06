import { useState } from 'react';
import { db, uid, type Media } from '../db';
import MediaViewer from './MediaViewer';
import { mediaFromUrl } from '../lib/utils';

const MAX_MB = 50;

/** Lista editable de vídeos/GIF: pegar enlace (YouTube, Vimeo, .mp4, .gif) o subir archivo. */
export default function MediaField({ media, onChange }: { media: Media[]; onChange: (m: Media[]) => void }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [open, setOpen] = useState<number | null>(null);

  function addUrl() {
    const u = url.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) { setError('El enlace debe empezar por http:// o https://'); return; }
    if (media.some(m => m.url === u)) { setError('Ese vídeo ya está añadido.'); return; }
    onChange([...media, mediaFromUrl(u)]);
    setUrl(''); setError('');
  }
  async function addFile(file?: File) {
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) { setError(`El archivo supera ${MAX_MB} MB. Usa un enlace de YouTube/Vimeo.`); return; }
    const blobId = uid();
    await db.media.add({ id: blobId, blob: file, mime: file.type, name: file.name });
    onChange([...media, { kind: 'blob', blobId, name: file.name }]);
    setError('');
  }
  function remove(i: number) {
    const m = media[i];
    if (m.kind === 'blob' && m.blobId) db.media.delete(m.blobId);
    onChange(media.filter((_, j) => j !== i));
    setOpen(null);
  }

  return (
    <div className="space-y-2">
      {media.map((m, i) => (
        <div key={(m.url ?? m.blobId ?? '') + i} className="overflow-hidden rounded-xl border border-zinc-700">
          <div className="flex items-center gap-2 p-2 text-xs">
            <button type="button" className="btn-ghost min-h-9 px-3" onClick={() => setOpen(open === i ? null : i)} aria-label="Ver vídeo">
              {open === i ? '▼' : '▶'}
            </button>
            <span className="min-w-0 flex-1 truncate text-zinc-300">{m.kind === 'blob' ? `📁 ${m.name}` : m.url}</span>
            <button type="button" className="btn-danger min-h-9 px-3 text-xs" onClick={() => remove(i)}>Quitar</button>
          </div>
          {open === i && <MediaViewer media={m} />}
        </div>
      ))}
      <div className="flex gap-2">
        <input className="input" inputMode="url" placeholder="Pega un enlace de vídeo (YouTube, Vimeo…)" value={url}
          onChange={e => { setUrl(e.target.value); setError(''); }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addUrl(); } }} />
        <button type="button" className="btn-ghost" onClick={addUrl}>Añadir</button>
      </div>
      <label className="btn-ghost w-full cursor-pointer text-sm">
        Subir vídeo o GIF del móvil
        <input type="file" accept="video/*,image/*" className="hidden" onChange={e => { addFile(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
      {error && <p className="text-xs text-rose-300">{error}</p>}
    </div>
  );
}
