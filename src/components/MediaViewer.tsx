import { useEffect, useState } from 'react';
import { db, type Media } from '../db';
import { vimeoId, youtubeId } from '../lib/utils';

/** Reproduce un enlace de YouTube/Vimeo, una URL directa (mp4/gif) o un archivo guardado en el dispositivo. */
export default function MediaViewer({ media }: { media: Media }) {
  const [blobUrl, setBlobUrl] = useState<string>();
  const [isGifBlob, setIsGifBlob] = useState(false);

  useEffect(() => {
    if (media.kind !== 'blob' || !media.blobId) return;
    let url = '';
    db.media.get(media.blobId).then(m => {
      if (!m) return;
      url = URL.createObjectURL(m.blob);
      setIsGifBlob(m.mime === 'image/gif' || m.mime.startsWith('image/'));
      setBlobUrl(url);
    });
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [media.kind, media.blobId]);

  const frame = 'aspect-video w-full bg-black';
  const yt = media.kind === 'youtube' ? youtubeId(media.url) : undefined;
  if (yt) return <iframe className={frame} src={`https://www.youtube-nocookie.com/embed/${yt}?rel=0`} title="Vídeo" allow="fullscreen; picture-in-picture" allowFullScreen />;
  const vm = media.kind === 'vimeo' ? vimeoId(media.url) : undefined;
  if (vm) return <iframe className={frame} src={`https://player.vimeo.com/video/${vm}`} title="Vídeo" allow="fullscreen; picture-in-picture" allowFullScreen />;

  if (media.kind === 'blob') {
    if (!blobUrl) return <div className={`${frame} grid place-items-center text-sm text-zinc-500`}>Archivo no disponible en este dispositivo</div>;
    return isGifBlob
      ? <img src={blobUrl} alt={media.name ?? 'Demostración'} className="w-full bg-black object-contain" />
      : <video src={blobUrl} className={frame} controls loop muted playsInline />;
  }
  if (!media.url) return null;
  if (/\.(gif|png|jpe?g|webp)(\?|$)/i.test(media.url)) return <img src={media.url} alt="Demostración" className="w-full bg-black object-contain" />;
  if (/\.(mp4|webm|mov)(\?|$)/i.test(media.url)) return <video src={media.url} className={frame} controls loop muted playsInline />;
  return (
    <a href={media.url} target="_blank" rel="noreferrer" className="block p-3 text-sm text-lime-400 underline break-all">{media.url}</a>
  );
}
