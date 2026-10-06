import { db, uid, type ID, type Media, type WorkSet } from '../db';

export const REST_OPTIONS = [45, 60, 90, 120, 150, 180, 240, 300];
export const RPE_OPTIONS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];

/** Segundos → m:ss (o h:mm:ss). */
export function fmtTime(totalSec: number) {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Fecha local en formato YYYY-MM-DD (no UTC). */
export function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const todayISO = () => toISODate(new Date());
export function parseISODate(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
/** Lunes de la semana de d. */
export function startOfWeek(d: Date) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return addDays(r, -((r.getDay() + 6) % 7));
}
export function fmtDateLong(s: string) {
  return parseISODate(s).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Volumen = Σ reps × peso de series efectivas completadas (sin calentamiento). */
export function volumeOf(sets: WorkSet[]) {
  return sets.filter(s => s.done && s.kind !== 'warmup').reduce((a, s) => a + s.reps * s.weight, 0);
}
export function avgRpeOf(sets: WorkSet[]) {
  const r = sets.filter(s => s.done && s.kind !== 'warmup' && s.rpe != null).map(s => s.rpe!);
  return r.length ? Math.round((r.reduce((a, b) => a + b, 0) / r.length) * 10) / 10 : undefined;
}
export function fmtVolume(kg: number) {
  return kg >= 1000 ? `${(kg / 1000).toFixed(1)} t` : `${Math.round(kg)} kg`;
}
/** 1RM estimado (Epley). Solo orientativo; poco fiable por encima de ~12 reps. */
export function e1rm(weight: number, reps: number) {
  return reps <= 1 ? weight : weight * (1 + reps / 30);
}
/** Color de intensidad por RPE medio (siempre acompañado de la cifra). */
export function rpeTone(rpe?: number) {
  if (rpe == null) return 'bg-zinc-500';
  if (rpe <= 7) return 'bg-emerald-400';
  if (rpe <= 8.5) return 'bg-amber-400';
  return 'bg-rose-500';
}

export function mediaFromUrl(raw: string): Media {
  const url = raw.trim();
  if (/youtu\.?be/.test(url)) return { kind: 'youtube', url };
  if (/vimeo\.com/.test(url)) return { kind: 'vimeo', url };
  return { kind: 'url', url };
}
export const youtubeId = (url = '') => url.match(/(?:youtu\.be\/|[?&]v=|shorts\/|embed\/)([\w-]{11})/)?.[1];
export const vimeoId = (url = '') => url.match(/vimeo\.com\/(?:video\/)?(\d+)/)?.[1];

/** Crea una sesión. Si se pasa una rutina, copia sus ejercicios y series objetivo (snapshot). */
export async function startSession(opts: { routineId?: ID; date?: string; calendarId?: ID } = {}) {
  const date = opts.date ?? todayISO();
  const routine = opts.routineId ? await db.routines.get(opts.routineId) : undefined;
  const sessionId = uid();
  const t = Date.now();

  await db.transaction('rw', [db.sessions, db.sessionExercises, db.sets, db.calendar], async () => {
    await db.sessions.add({
      id: sessionId, date, routineId: routine?.id, type: routine?.name ?? 'Sesión libre',
      startedAt: t, defaultRestSec: routine?.defaultRestSec ?? 120, status: 'active', updatedAt: t,
    });
    for (const [order, it] of (routine?.items ?? []).entries()) {
      const seId = uid();
      await db.sessionExercises.add({
        id: seId, sessionId, exerciseId: it.exerciseId, order, restSec: it.restSec, notes: it.notes,
      });
      // Peso inicial = última carga usada en ese ejercicio
      const last = await lastWorkSet(it.exerciseId);
      await db.sets.bulkAdd(Array.from({ length: it.targetSets }, (_, idx) => ({
        id: uid(), sessionId, sessionExerciseId: seId, exerciseId: it.exerciseId, idx,
        kind: 'work' as const, reps: it.repsMax, weight: last?.weight ?? 0, unit: last?.unit ?? 'kg',
        rpe: it.targetRpe, rir: it.targetRpe != null ? Math.max(0, Math.round(10 - it.targetRpe)) : undefined,
        done: false,
      })));
    }
    const planned = opts.calendarId
      ? await db.calendar.get(opts.calendarId)
      : await db.calendar.where('date').equals(date)
          .filter(c => c.status === 'planned' && !c.sessionId && (!routine || c.routineId === routine.id)).first();
    if (planned) await db.calendar.update(planned.id, { sessionId, updatedAt: t });
  });
  return sessionId;
}

export async function lastWorkSet(exerciseId: ID, excludeSessionId?: ID) {
  const all = await db.sets.where('exerciseId').equals(exerciseId)
    .filter(s => s.done && s.kind !== 'warmup' && s.sessionId !== excludeSessionId).toArray();
  return all.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))[0];
}

export async function addExerciseToSession(sessionId: ID, exerciseId: ID) {
  const count = await db.sessionExercises.where('sessionId').equals(sessionId).count();
  const seId = uid();
  const last = await lastWorkSet(exerciseId, sessionId);
  await db.sessionExercises.add({ id: seId, sessionId, exerciseId, order: count });
  await db.sets.add({
    id: uid(), sessionId, sessionExerciseId: seId, exerciseId, idx: 0, kind: 'work',
    reps: last?.reps ?? 10, weight: last?.weight ?? 0, unit: last?.unit ?? 'kg', done: false,
  });
}

/** Cierra la sesión, calcula agregados y marca el día en el calendario. */
export async function finishSession(sessionId: ID) {
  const session = await db.sessions.get(sessionId);
  if (!session) return;
  const sets = await db.sets.where('sessionId').equals(sessionId).toArray();
  const t = Date.now();
  await db.transaction('rw', [db.sessions, db.calendar], async () => {
    await db.sessions.update(sessionId, {
      status: 'done', endedAt: t, durationSec: Math.round((t - session.startedAt) / 1000),
      totalVolume: volumeOf(sets), avgRpe: avgRpeOf(sets), updatedAt: t,
    });
    const entry = await db.calendar.where('sessionId').equals(sessionId).first();
    if (entry) await db.calendar.update(entry.id, { status: 'done', date: session.date, updatedAt: t });
    else await db.calendar.add({ id: uid(), date: session.date, routineId: session.routineId, sessionId, status: 'done', updatedAt: t });
  });
}

export async function deleteSession(sessionId: ID) {
  await db.transaction('rw', [db.sessions, db.sessionExercises, db.sets, db.calendar], async () => {
    await db.sets.where('sessionId').equals(sessionId).delete();
    await db.sessionExercises.where('sessionId').equals(sessionId).delete();
    await db.calendar.where('sessionId').equals(sessionId).delete();
    await db.sessions.delete(sessionId);
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
