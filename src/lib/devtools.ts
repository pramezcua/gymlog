import * as dbm from '../db';
import * as sync from './sync';
import type { Remote, RemoteRow } from './sync';

/** Backend en memoria que imita la tabla `records` (LWW + server_ts) para probar el motor de sync. */
function memoryRemote(store: Map<string, RemoteRow>, clock: { n: number }): Remote {
  return {
    async pull(since, limit) {
      return [...store.values()].filter(r => !since || r.server_ts! > since)
        .sort((a, b) => a.server_ts!.localeCompare(b.server_ts!)).slice(0, limit).map(r => structuredClone(r));
    },
    async push(rows) {
      const keys = rows.map(r => `${r.tbl}:${r.id}`);
      if (new Set(keys).size !== keys.length) throw new Error('fila duplicada en el mismo upsert');
      for (const r of rows) {
        const k = `${r.tbl}:${r.id}`;
        const old = store.get(k);
        if (old && r.updated_at < old.updated_at) continue; // mismo trigger LWW que en SQL
        store.set(k, { ...structuredClone(r), server_ts: new Date(Date.UTC(2030, 0, 1) + ++clock.n).toISOString() });
      }
    },
  };
}

export function install() {
  const store = new Map<string, RemoteRow>();
  const clock = { n: 0 };
  Object.assign(window, { __gymlog: { dbm, sync, store, memoryRemote: () => memoryRemote(store, clock) } });
}
