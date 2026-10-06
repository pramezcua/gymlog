import { useSyncExternalStore } from 'react';
import {
  db, markRemote, readTombstones, setLocalChangeListener, writeTombstones, SYNC_TABLES,
  type SyncTable,
} from '../db';

/** Fila tal como se guarda en la nube (tabla `records`). */
export interface RemoteRow {
  tbl: SyncTable;
  id: string;
  data: Record<string, unknown> | null;
  updated_at: number; // ms del cliente que hizo el cambio (last-write-wins)
  deleted: boolean;
  server_ts?: string; // marca del servidor, sirve de cursor para descargar cambios
}

/** Lo que el motor necesita del backend. Supabase lo implementa en supabaseRemote. */
export interface Remote {
  pull(since: string | null, limit: number): Promise<RemoteRow[]>;
  push(rows: RemoteRow[]): Promise<void>;
}

type SyncState = { lastPush: number; lastPull: string | null; lastSyncAt?: number };
const stateKey = () => `gymlog.sync.${db.name}`;
function loadState(): SyncState {
  try { return { lastPush: 0, lastPull: null, ...JSON.parse(localStorage.getItem(stateKey()) ?? '{}') }; }
  catch { return { lastPush: 0, lastPull: null }; }
}
function saveState(s: SyncState) {
  try { localStorage.setItem(stateKey(), JSON.stringify(s)); } catch { /* sin storage */ }
}

// ---------- Estado observable para la UI ----------
export type SyncStatus = { phase: 'off' | 'idle' | 'syncing' | 'error' | 'offline'; lastSyncAt?: number; error?: string; pending: boolean };
let status: SyncStatus = { phase: 'off', pending: false };
const listeners = new Set<() => void>();
function setStatus(p: Partial<SyncStatus>) {
  status = { ...status, ...p };
  listeners.forEach(l => l());
}
export const getSyncStatus = () => status;
export function useSyncStatus() {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => status);
}

// ---------- Motor ----------
const PAGE = 1000;
const CHUNK = 400;
const PULL_OVERLAP_MS = 10_000; // re-lee 10 s por si un commit llegó tarde (aplicar es idempotente)

let remote: Remote | null = null;
let running: Promise<void> | null = null;
let again = false;

/** Descarga cambios remotos, aplica last-write-wins y sube los cambios locales pendientes. */
export function syncNow(): Promise<void> {
  if (!remote) return Promise.resolve();
  if (running) { again = true; return running; }
  running = (async () => {
    do {
      again = false;
      await runOnce(remote!);
    } while (again);
  })().finally(() => { running = null; });
  return running;
}

async function runOnce(r: Remote) {
  if (!navigator.onLine) { setStatus({ phase: 'offline' }); return; }
  setStatus({ phase: 'syncing', error: undefined });
  try {
    const st = loadState();
    const pushStart = Date.now();

    // 1) PULL
    let cursor = st.lastPull ? new Date(new Date(st.lastPull).getTime() - PULL_OVERLAP_MS).toISOString() : null;
    for (;;) {
      const rows = await r.pull(cursor, PAGE);
      if (rows.length) await applyRemote(rows);
      if (rows.length) cursor = rows[rows.length - 1].server_ts ?? cursor;
      if (rows.length < PAGE) break;
    }
    if (cursor) st.lastPull = cursor;

    // 2) PUSH
    const rows: RemoteRow[] = [];
    const present = new Set<string>();
    for (const t of SYNC_TABLES) {
      const changed = await db.table(t).where('updatedAt').above(st.lastPush).toArray();
      for (const o of changed) {
        rows.push({ tbl: t, id: o.id, data: o, updated_at: o.updatedAt, deleted: false });
        present.add(`${t}:${o.id}`);
      }
    }
    const tombs = readTombstones();
    const latestTomb = new Map<string, (typeof tombs)[number]>();
    for (const tb of tombs) {
      const k = `${tb.tbl}:${tb.id}`;
      // si el registro se volvió a crear después, gana el registro vivo
      if (present.has(k) || await db.table(tb.tbl).get(tb.id)) continue;
      if ((latestTomb.get(k)?.at ?? 0) < tb.at) latestTomb.set(k, tb);
    }
    for (const tb of latestTomb.values()) rows.push({ tbl: tb.tbl, id: tb.id, data: null, updated_at: tb.at, deleted: true });

    for (let i = 0; i < rows.length; i += CHUNK) await r.push(rows.slice(i, i + CHUNK));

    // Limpia solo las lápidas enviadas (pueden haber llegado nuevas mientras tanto)
    const sentKeys = new Set(tombs.map(t => `${t.tbl}:${t.id}:${t.at}`));
    writeTombstones(readTombstones().filter(t => !sentKeys.has(`${t.tbl}:${t.id}:${t.at}`)));
    st.lastPush = pushStart;
    st.lastSyncAt = Date.now();
    saveState(st);
    setStatus({ phase: 'idle', lastSyncAt: st.lastSyncAt, pending: false });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    setStatus({ phase: navigator.onLine ? 'error' : 'offline', error: msg });
    console.warn('[sync]', msg);
  }
}

async function applyRemote(rows: RemoteRow[]) {
  const tables = [...new Set(rows.map(r => r.tbl))].filter(t => (SYNC_TABLES as readonly string[]).includes(t));
  // Borrados locales aún no subidos: no se deben "resucitar" con una versión remota anterior
  const pendingDeletes = new Map<string, number>();
  for (const t of readTombstones()) pendingDeletes.set(`${t.tbl}:${t.id}`, Math.max(t.at, pendingDeletes.get(`${t.tbl}:${t.id}`) ?? 0));
  await db.transaction('rw', tables.map(t => db.table(t)), async tx => {
    markRemote(tx);
    for (const r of rows) {
      if (!tables.includes(r.tbl)) continue;
      if ((pendingDeletes.get(`${r.tbl}:${r.id}`) ?? -1) >= r.updated_at) continue;
      const table = db.table(r.tbl);
      const local = await table.get(r.id) as { updatedAt?: number } | undefined;
      // last-write-wins: solo se aplica si el cambio remoto es más reciente que el local
      if (local && (local.updatedAt ?? 0) >= r.updated_at) continue;
      if (r.deleted) { if (local) await table.delete(r.id); }
      else if (r.data) await table.put({ ...r.data, updatedAt: r.updated_at });
    }
  });
}

// ---------- Arranque / parada ----------
let timer: ReturnType<typeof setTimeout> | undefined;
let interval: ReturnType<typeof setInterval> | undefined;
const schedule = (ms = 2500) => { clearTimeout(timer); timer = setTimeout(() => syncNow(), ms); };
const onOnline = () => schedule(300);
const onVisible = () => { if (document.visibilityState === 'visible') schedule(300); };

/** Activa la sincronización automática: tras cada cambio local, al volver la conexión, al abrir la app y cada minuto. */
export function startSync(r: Remote) {
  remote = r;
  setStatus({ phase: 'idle', pending: false, error: undefined, lastSyncAt: loadState().lastSyncAt });
  setLocalChangeListener(() => { setStatus({ pending: true }); schedule(); });
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  interval = setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 60_000);
}

export async function stopSync() {
  if (running) await running.catch(() => {});
  remote = null;
  clearTimeout(timer);
  clearInterval(interval);
  setLocalChangeListener(null);
  window.removeEventListener('online', onOnline);
  document.removeEventListener('visibilitychange', onVisible);
  setStatus({ phase: 'off', pending: false, error: undefined, lastSyncAt: undefined });
}

/** ¿Quedan cambios locales sin subir? */
export async function hasPendingChanges() {
  const st = loadState();
  if (readTombstones().length) return true;
  for (const t of SYNC_TABLES) if (await db.table(t).where('updatedAt').above(st.lastPush).count()) return true;
  return false;
}

export function clearSyncState(dbName: string) {
  try {
    localStorage.removeItem(`gymlog.sync.${dbName}`);
    localStorage.removeItem(`gymlog.tombstones.${dbName}`);
  } catch { /* sin storage */ }
}
