import { useEffect, useRef, useState } from 'react';

/**
 * Campo numérico con botones grandes −/+ para uso con una mano.
 * Mantiene el valor localmente para que los toques rápidos no se pierdan mientras se guarda en la base de datos.
 */
export default function Stepper({ value, step, onChange, label, min = 0 }: {
  value: number; step: number; onChange: (v: number) => void; label: string; min?: number;
}) {
  const [cur, setCur] = useState(value);
  const [text, setText] = useState(String(value));
  const lastLocal = useRef(0);

  // Sincroniza con cambios externos (otro dispositivo, otra pantalla). Mientras el usuario está tocando,
  // se ignoran los ecos de sus propios guardados (pueden llegar desordenados y deshacer un toque).
  useEffect(() => {
    if (Date.now() - lastLocal.current < 1000) return;
    setCur(value);
    setText(String(value));
  }, [value]);

  const set = (v: number) => {
    const n = Math.max(min, Math.round(v * 100) / 100);
    lastLocal.current = Date.now();
    setCur(n);
    setText(String(n));
    onChange(n);
  };

  return (
    <div className="flex h-12 items-stretch overflow-hidden rounded-xl bg-zinc-800">
      <button type="button" className="w-9 shrink-0 text-xl text-zinc-400 active:bg-zinc-700" aria-label={`Restar ${label}`}
        onClick={() => set(cur - step)}>−</button>
      <input type="number" inputMode="decimal" aria-label={label} value={text}
        onFocus={e => e.target.select()}
        onChange={e => setText(e.target.value)}
        onBlur={() => { const v = parseFloat(text.replace(',', '.')); if (Number.isFinite(v)) set(v); else setText(String(cur)); }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="w-full min-w-0 bg-transparent text-center text-lg font-semibold tabular-nums outline-none" />
      <button type="button" className="w-9 shrink-0 text-xl text-zinc-400 active:bg-zinc-700" aria-label={`Sumar ${label}`}
        onClick={() => set(cur + step)}>+</button>
    </div>
  );
}
