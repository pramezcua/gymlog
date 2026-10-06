import type { ReactNode } from 'react';

/** Panel inferior modal (bottom sheet). */
export default function Sheet({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60" onClick={onClose}>
      <div className="mx-auto flex max-h-[85dvh] w-full max-w-xl flex-col rounded-t-3xl border-t border-zinc-800 bg-zinc-900"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <h2 className="text-base font-bold first-letter:uppercase">{title}</h2>
          <button onClick={onClose} className="h-11 w-11 text-xl text-zinc-400" aria-label="Cerrar">✕</button>
        </div>
        <div className="overflow-y-auto px-4 pb-4">{children}</div>
      </div>
    </div>
  );
}
