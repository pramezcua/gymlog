import Dexie, { type Table } from 'dexie';

export type ID = string;
export const uid = () => crypto.randomUUID();

export const MUSCLES = [
  'pecho', 'espalda', 'hombro', 'bíceps', 'tríceps', 'antebrazo',
  'cuádriceps', 'isquios', 'glúteo', 'gemelo', 'core', 'cardio', 'otro',
] as const;
export type Muscle = (typeof MUSCLES)[number];

export interface Media {
  kind: 'youtube' | 'vimeo' | 'url' | 'blob';
  url?: string;
  blobId?: ID;
  name?: string;
}

/** Catálogo de ejercicios. */
export interface Exercise {
  id: ID;
  name: string;
  muscle: Muscle;
  media: Media[];
  notes?: string;
  /** Cómo se registra: peso × repeticiones o tiempo (+ distancia). Si falta, cardio = tiempo. */
  mode?: ExerciseMode;
  updatedAt: number;
}

export type ExerciseMode = 'reps' | 'time';

/** Ejercicio dentro de una plantilla (embebido en Routine). */
export interface RoutineItem {
  exerciseId: ID;
  targetSets: number;
  repsMin: number;
  repsMax: number;
  targetRpe?: number;
  restSec?: number;
  notes?: string;
  /** Duración objetivo por serie/bloque en ejercicios por tiempo (min). */
  targetMin?: number;
}

/** Plantilla de rutina: Empuje, Jalón, Pierna… */
export interface Routine {
  id: ID;
  name: string;
  type: string;
  color: string;
  defaultRestSec: number;
  items: RoutineItem[];
  updatedAt: number;
}

export interface Session {
  id: ID;
  date: string; // YYYY-MM-DD
  routineId?: ID;
  type: string;
  startedAt: number;
  endedAt?: number;
  durationSec?: number;
  /** Descanso GLOBAL de la sesión (s). */
  defaultRestSec: number;
  status: 'active' | 'done';
  notes?: string;
  totalVolume?: number;
  avgRpe?: number;
  updatedAt: number;
}

/** Copia del ejercicio dentro de una sesión (editable sin tocar la plantilla). */
export interface SessionExercise {
  id: ID;
  sessionId: ID;
  exerciseId: ID;
  order: number;
  /** Descanso ESPECÍFICO entre series; sobrescribe el global. */
  restSec?: number;
  notes?: string;
  /** Objetivo copiado de la rutina, p. ej. "3 × 10–12" o "1 × 30 min". */
  target?: string;
  updatedAt?: number;
}

export interface WorkSet {
  id: ID;
  sessionId: ID;
  sessionExerciseId: ID;
  exerciseId: ID;
  idx: number;
  kind: 'warmup' | 'work';
  reps: number;
  weight: number;
  unit: 'kg' | 'lb';
  rpe?: number;
  rir?: number;
  /** Ejercicios por tiempo: duración (s) y distancia (km). */
  durationSec?: number;
  distanceKm?: number;
  /** Descanso real medido desde la serie anterior completada (s). */
  restTakenSec?: number;
  done: boolean;
  completedAt?: number;
  updatedAt?: number;
}

/** Planificación en el calendario. */
export interface CalendarEntry {
  id: ID;
  date: string;
  routineId?: ID;
  sessionId?: ID;
  status: 'planned' | 'done' | 'skipped';
  updatedAt: number;
}

export interface MediaBlob {
  id: ID;
  blob: Blob;
  mime: string;
  name: string;
}

/** Tablas que se sincronizan con la nube (los Blobs de `media` se quedan en el dispositivo). */
export const SYNC_TABLES = ['exercises', 'routines', 'sessions', 'sessionExercises', 'sets', 'calendar'] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

export class GymDB extends Dexie {
  exercises!: Table<Exercise, ID>;
  routines!: Table<Routine, ID>;
  sessions!: Table<Session, ID>;
  sessionExercises!: Table<SessionExercise, ID>;
  sets!: Table<WorkSet, ID>;
  calendar!: Table<CalendarEntry, ID>;
  media!: Table<MediaBlob, ID>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      exercises: 'id, name, muscle',
      routines: 'id, name',
      sessions: 'id, date, routineId, status',
      sessionExercises: 'id, sessionId, exerciseId',
      sets: 'id, sessionId, sessionExerciseId, exerciseId, completedAt',
      calendar: 'id, date, routineId, sessionId, status',
      media: 'id',
    });
    // v2: índice updatedAt para detectar cambios pendientes de sincronizar
    this.version(2).stores({
      exercises: 'id, name, muscle, updatedAt',
      routines: 'id, name, updatedAt',
      sessions: 'id, date, routineId, status, updatedAt',
      sessionExercises: 'id, sessionId, exerciseId, updatedAt',
      sets: 'id, sessionId, sessionExerciseId, exerciseId, completedAt, updatedAt',
      calendar: 'id, date, routineId, sessionId, status, updatedAt',
      media: 'id',
    });
  }
}

/** Nombre de la base local sin cuenta (modo solo-dispositivo). */
export const LOCAL_DB_NAME = 'gymlog';

/**
 * Base de datos activa. Es un `let` exportado: al iniciar sesión se sustituye por la base
 * del usuario y todos los módulos ven la nueva instancia (enlace vivo de ES modules).
 */
export let db = createDb(LOCAL_DB_NAME);

type ChangeListener = () => void;
let onLocalChange: ChangeListener | null = null;
export function setLocalChangeListener(fn: ChangeListener | null) { onLocalChange = fn; }

/** Transacciones que aplican datos llegados de la nube: no se re-marcan ni generan borrados. */
const REMOTE = Symbol('remote');
export function markRemote(tx: unknown) { (tx as Record<symbol, boolean>)[REMOTE] = true; }
const isRemote = (tx: unknown) => !!(tx as Record<symbol, boolean> | undefined)?.[REMOTE];

const tombKey = (dbName: string) => `gymlog.tombstones.${dbName}`;
export type Tombstone = { tbl: SyncTable; id: ID; at: number };
export function readTombstones(dbName = db.name): Tombstone[] {
  try { return JSON.parse(localStorage.getItem(tombKey(dbName)) ?? '[]'); } catch { return []; }
}
export function writeTombstones(list: Tombstone[], dbName = db.name) {
  try { localStorage.setItem(tombKey(dbName), JSON.stringify(list)); } catch { /* sin storage */ }
}

function createDb(name: string) {
  const d = new GymDB(name);
  for (const t of SYNC_TABLES) {
    const table = d.table(t);
    // Cada alta/cambio local se sella con updatedAt: así el motor de sync sabe qué subir.
    table.hook('creating', (_pk, obj, tx) => {
      if (isRemote(tx)) return;
      (obj as { updatedAt?: number }).updatedAt = Date.now();
      onLocalChange?.();
    });
    table.hook('updating', (mods, _pk, _obj, tx) => {
      if (isRemote(tx)) return;
      onLocalChange?.();
      return { ...mods, updatedAt: Date.now() };
    });
    // Los borrados se recuerdan como "lápidas" para propagarlos a otros dispositivos.
    table.hook('deleting', (pk, _obj, tx) => {
      if (isRemote(tx)) return;
      writeTombstones([...readTombstones(name), { tbl: t, id: pk as ID, at: Date.now() }], name);
      onLocalChange?.();
    });
  }
  return d;
}

/** Cambia a la base de datos local de un usuario (o a la anónima si no hay usuario). */
export function switchDatabase(userId: string | null) {
  const name = userId ? `gymlog-${userId}` : LOCAL_DB_NAME;
  if (db.name === name) return db;
  db.close();
  db = createDb(name);
  return db;
}

const BACKUP_TABLES = ['exercises', 'routines', 'sessions', 'sessionExercises', 'sets', 'calendar'] as const;

/** Copia de seguridad JSON. Los vídeos subidos (Blobs) no se incluyen por tamaño; los enlaces sí. */
export async function exportJSON(): Promise<Blob> {
  const data: Record<string, unknown[]> = {};
  for (const t of BACKUP_TABLES) data[t] = await db.table(t).toArray();
  const payload = { app: 'gymlog', version: 1, exportedAt: new Date().toISOString(), data };
  return new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' });
}

export async function importJSON(file: File, mode: 'merge' | 'replace') {
  const parsed = JSON.parse(await file.text());
  if (parsed?.app !== 'gymlog' || typeof parsed.data !== 'object') {
    throw new Error('El archivo no es una copia de seguridad de GymLog.');
  }
  await db.transaction('rw', BACKUP_TABLES.map(t => db.table(t)), async () => {
    for (const t of BACKUP_TABLES) {
      const rows = parsed.data[t];
      if (!Array.isArray(rows)) continue;
      if (mode === 'replace') await db.table(t).clear();
      await db.table(t).bulkPut(rows);
    }
  });
}
