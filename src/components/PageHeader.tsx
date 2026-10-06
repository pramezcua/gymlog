import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';

export default function PageHeader({ title, back, action }: { title: string; back?: boolean; action?: ReactNode }) {
  const nav = useNavigate();
  return (
    <header className="sticky z-20 flex min-h-14 items-center gap-2 border-b border-zinc-800 bg-zinc-950/95 px-4 backdrop-blur"
      style={{ top: 'env(safe-area-inset-top, 0px)' }}>
      {back && (
        <button onClick={() => nav(-1)} className="-ml-2 h-11 w-11 text-2xl text-zinc-400" aria-label="Volver">‹</button>
      )}
      <h1 className="flex-1 truncate text-lg font-bold">{title}</h1>
      {action}
    </header>
  );
}
