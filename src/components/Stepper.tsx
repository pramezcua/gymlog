import { useEffect, useState } from 'react';

/** Campo numérico con botones grandes −/+ para uso con una mano. */
export default function Stepper({ value, step, onChange, label, min = 0 }: {
  value: number; step: number; onChange: (v: number) => void; label: string; min?: number;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const set = (v: number) => onChange(Math.max(min, Math.round(v * 100) / 100));

  return (
    <div className="flex h-12 items-stretch overflow-hidden rounded-xl bg-zinc-800">
      <button type="button" className="w-9 shrink-0 text-xl text-zinc-400 active:bg-zinc-700" aria-label={`Restar ${label}`}
        onClick={() => set(value - step)}>−</button>
      <input type="number" inputMode="decimal" aria-label={label} value={text}
        onFocus={e => e.target.select()}
        onChange={e => setText(e.target.value)}
        onBlur={() => { const v = parseFloat(text.replace(',', '.')); if (Number.isFinite(v)) set(v); else setText(String(value)); }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="w-full min-w-0 bg-transparent text-center text-lg font-semibold tabular-nums outline-none" />
      <button type="button" className="w-9 shrink-0 text-xl text-zinc-400 active:bg-zinc-700" aria-label={`Sumar ${label}`}
        onClick={() => set(value + step)}>+</button>
    </div>
  );
}
