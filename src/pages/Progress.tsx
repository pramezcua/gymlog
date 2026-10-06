import { useMemo, useState, type PointerEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import PageHeader from '../components/PageHeader';
import { e1rm, modeOf, parseISODate } from '../lib/utils';

type Point = { date: string; best: number; top: string; volume: number };

export default function Progress() {
  const exercises = useLiveQuery(() => db.exercises.orderBy('name').toArray(), []) ?? [];
  const usedIds = useLiveQuery(async () => new Set((await db.sets.filter(s => s.done).toArray()).map(s => s.exerciseId)), []);
  const withData = exercises.filter(e => usedIds?.has(e.id));
  const [exId, setExId] = useState('');
  const selected = exId || withData[0]?.id || '';
  const timeMode = modeOf(exercises.find(e => e.id === selected)) === 'time';

  const points = useLiveQuery(async (): Promise<Point[]> => {
    if (!selected) return [];
    const time = modeOf(await db.exercises.get(selected)) === 'time';
    const sets = await db.sets.where('exerciseId').equals(selected)
      .filter(s => s.done && s.kind !== 'warmup' && (time ? (s.durationSec ?? 0) > 0 : s.weight > 0)).toArray();
    const sessions = await db.sessions.bulkGet([...new Set(sets.map(s => s.sessionId))]);
    const dateOf = new Map(sessions.filter(Boolean).map(s => [s!.id, s!.date]));
    const bySession = new Map<string, Point>();
    for (const s of sets) {
      const date = dateOf.get(s.sessionId);
      if (!date) continue;
      const p = bySession.get(s.sessionId) ?? { date, best: 0, top: '', volume: 0 };
      if (time) {
        // best = minutos totales de la sesión; volume = km totales
        p.best += (s.durationSec ?? 0) / 60;
        p.volume += s.distanceKm ?? 0;
        p.top = `${Math.round(p.best)} min${p.volume ? ` · ${Math.round(p.volume * 10) / 10} km` : ''}`;
      } else {
        const est = e1rm(s.weight, s.reps);
        p.volume += s.weight * s.reps;
        if (est > p.best) { p.best = est; p.top = `${s.weight} ${s.unit} × ${s.reps}${s.rpe != null ? ` @${s.rpe}` : ''}`; }
      }
      bySession.set(s.sessionId, p);
    }
    return [...bySession.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [selected]) ?? [];

  return (
    <div className="pb-24">
      <PageHeader back title="Progreso" />
      <div className="space-y-4 p-4">
        {withData.length === 0 ? (
          <p className="card p-6 text-center text-zinc-400">Completa alguna serie con peso para ver tu progreso.</p>
        ) : (
          <>
            <select className="input" value={selected} onChange={e => setExId(e.target.value)} aria-label="Ejercicio">
              {withData.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <section className="card p-4">
              <h2 className="font-semibold">{timeMode ? 'Tiempo por sesión' : '1RM estimado (Epley)'}</h2>
              <p className="mb-3 text-xs text-zinc-500">{timeMode
                ? 'Minutos totales de cada sesión.'
                : 'Mejor serie de cada sesión. Orientativo: pierde fiabilidad por encima de ~12 repeticiones.'}</p>
              <LineChart points={points} unit={timeMode ? 'min' : 'kg'} />
            </section>
            <section className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-zinc-500">
                  <tr><th className="p-3">Fecha</th><th className="p-3">{timeMode ? 'Sesión' : 'Mejor serie'}</th><th className="p-3 text-right">{timeMode ? 'Min' : '1RM est.'}</th><th className="p-3 text-right">{timeMode ? 'Km' : 'Volumen'}</th></tr>
                </thead>
                <tbody className="divide-y divide-zinc-800 tabular-nums">
                  {[...points].reverse().map((p, i) => (
                    <tr key={i}>
                      <td className="p-3 text-zinc-400">{parseISODate(p.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: '2-digit' })}</td>
                      <td className="p-3">{p.top}</td>
                      <td className="p-3 text-right">{p.best.toFixed(1)}</td>
                      <td className="p-3 text-right text-zinc-400">{timeMode ? Math.round(p.volume * 10) / 10 : Math.round(p.volume)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

/** Línea simple en SVG con punto activo al tocar/pasar el ratón. */
function LineChart({ points, unit }: { points: Point[]; unit: string }) {
  const [active, setActive] = useState<number | null>(null);
  const W = 340, H = 180, P = { l: 36, r: 12, t: 12, b: 24 };

  const geo = useMemo(() => {
    if (!points.length) return null;
    const vals = points.map(p => p.best);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = Math.max(2.5, (hi - lo) * 0.15);
    lo = Math.max(0, Math.floor((lo - pad) / 5) * 5); hi = Math.ceil((hi + pad) / 5) * 5;
    const x = (i: number) => points.length === 1 ? (P.l + W - P.r) / 2 : P.l + (i / (points.length - 1)) * (W - P.l - P.r);
    const y = (v: number) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
    const ticks = [lo, (lo + hi) / 2, hi];
    return { x, y, ticks };
  }, [points]);

  if (!geo) return <p className="text-sm text-zinc-500">Sin datos todavía.</p>;
  const { x, y, ticks } = geo;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.best).toFixed(1)}`).join(' ');
  const a = active != null ? points[active] : points[points.length - 1];
  const ai = active ?? points.length - 1;
  const fmtD = (s: string) => parseISODate(s).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

  function onMove(e: PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    points.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i; });
    setActive(best);
  }

  return (
    <div>
      <p className="mb-1 text-sm">
        <span className="text-2xl font-bold tabular-nums">{a.best.toFixed(1)}</span>
        <span className="text-zinc-400"> {unit} · {fmtD(a.date)} · {a.top}</span>
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full touch-none select-none" role="img"
        aria-label={`1RM estimado en ${points.length} sesiones`} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setActive(null)}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="#27272a" strokeWidth={1} />
            <text x={P.l - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#71717a">{Math.round(t)}</text>
          </g>
        ))}
        <text x={points.length === 1 ? x(0) : P.l} y={H - 6} fontSize="10" fill="#71717a" textAnchor={points.length === 1 ? 'middle' : 'start'}>{fmtD(points[0].date)}</text>
        {points.length > 1 && <text x={W - P.r} y={H - 6} fontSize="10" fill="#71717a" textAnchor="end">{fmtD(points[points.length - 1].date)}</text>}
        <line x1={x(ai)} x2={x(ai)} y1={P.t} y2={H - P.b} stroke="#52525b" strokeWidth={1} strokeDasharray="3 3" />
        <path d={path} fill="none" stroke="#a3e635" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.best)} r={i === ai ? 5 : 3} fill="#a3e635" stroke="#18181b" strokeWidth={2} />
        ))}
      </svg>
    </div>
  );
}
