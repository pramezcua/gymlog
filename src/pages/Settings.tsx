import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, exportJSON, importJSON } from '../db';
import PageHeader from '../components/PageHeader';
import { downloadBlob, todayISO } from '../lib/utils';
import { useAccount } from '../components/AuthGate';
import { syncNow, useSyncStatus } from '../lib/sync';
import { cloudEnabled } from '../lib/supabase';

export default function Settings() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState('');
  const counts = useLiveQuery(async () => ({
    sessions: await db.sessions.count(), sets: await db.sets.count(),
    routines: await db.routines.count(), exercises: await db.exercises.count(),
  }), []);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
    navigator.storage?.estimate?.().then(e => setUsage(`${((e.usage ?? 0) / 1024 / 1024).toFixed(1)} MB usados`)).catch(() => {});
  }, []);

  async function doExport() {
    downloadBlob(await exportJSON(), `gymlog-backup-${todayISO()}.json`);
    setMsg({ ok: true, text: 'Copia descargada.' });
  }
  async function doImport(file?: File) {
    if (!file) return;
    try {
      await importJSON(file, mode);
      setMsg({ ok: true, text: `Copia importada (${mode === 'merge' ? 'combinada' : 'reemplazando los datos'}).` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'No se pudo leer el archivo.' });
    }
  }

  return (
    <div className="pb-24">
      <PageHeader title="Ajustes" />
      <div className="space-y-4 p-4">
        {cloudEnabled && <AccountSection />}

        <section className="card space-y-3 p-4">
          <h2 className="font-semibold">Copia de seguridad</h2>
          <p className="text-sm text-zinc-400">
            {cloudEnabled
              ? 'Tus datos se sincronizan con tu cuenta. Además puedes descargar una copia en JSON cuando quieras.'
              : 'Tus datos viven solo en este navegador. Exporta una copia con regularidad y guárdala en tu nube o correo.'}
          </p>
          <button className="btn-primary w-full" onClick={doExport}>Exportar JSON</button>
          <div className="flex rounded-xl bg-zinc-800 p-1 text-sm">
            {(['merge', 'replace'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)} className={`flex-1 rounded-lg py-2 ${mode === m ? 'bg-zinc-950 text-lime-400' : 'text-zinc-400'}`}>
                {m === 'merge' ? 'Combinar' : 'Reemplazar todo'}
              </button>
            ))}
          </div>
          <label className="btn-ghost w-full cursor-pointer">
            Importar JSON
            <input type="file" accept="application/json,.json" className="hidden" onChange={e => { doImport(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {msg && <p className={`rounded-xl p-3 text-sm ${msg.ok ? 'bg-lime-400/10 text-lime-300' : 'bg-rose-500/15 text-rose-300'}`}>{msg.text}</p>}
        </section>

        <section className="card space-y-1 p-4 text-sm text-zinc-400">
          <h2 className="mb-1 font-semibold text-zinc-100">Almacenamiento</h2>
          <p>{counts ? `${counts.sessions} sesiones · ${counts.sets} series · ${counts.routines} rutinas · ${counts.exercises} ejercicios` : '…'}</p>
          {usage && <p>{usage}</p>}
          <p>
            Almacenamiento persistente:{' '}
            {persisted == null ? 'no disponible' : persisted ? <span className="text-lime-400">activado</span> : <span className="text-amber-400">no concedido (instala la app en la pantalla de inicio para mejorarlo)</span>}
          </p>
        </section>

        <section className="card space-y-1 p-4 text-sm text-zinc-400">
          <h2 className="mb-1 font-semibold text-zinc-100">Instalar en el móvil</h2>
          <p><b className="text-zinc-200">iPhone (Safari):</b> Compartir → «Añadir a pantalla de inicio».</p>
          <p><b className="text-zinc-200">Android (Chrome):</b> menú ⋮ → «Instalar aplicación».</p>
          <p>Una vez instalada funciona sin conexión.</p>
        </section>
      </div>
    </div>
  );
}

function AccountSection() {
  const account = useAccount();
  const st = useSyncStatus();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!account) return null;

  const label = {
    off: 'Desactivada', idle: 'Sincronizado', syncing: 'Sincronizando…',
    error: 'Error al sincronizar', offline: 'Sin conexión: se sincronizará al volver la red',
  }[st.phase];
  const tone = st.phase === 'idle' ? 'bg-emerald-400' : st.phase === 'syncing' ? 'bg-sky-400' : st.phase === 'error' ? 'bg-rose-500' : 'bg-amber-400';

  async function out(force: boolean) {
    setBusy(true);
    const r = await account!.signOut(force);
    setBusy(false);
    if (r === 'pending') setConfirm(true);
  }

  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-semibold">Cuenta</h2>
      <p className="break-all text-sm text-zinc-300">{account.email}</p>
      <div className="flex items-center gap-2 text-sm text-zinc-400" role="status">
        <i className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone}`} />
        <span>
          {label}{st.pending && st.phase !== 'syncing' ? ' · cambios pendientes' : ''}
          {st.lastSyncAt ? ` · ${new Date(st.lastSyncAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : ''}
        </span>
      </div>
      {st.phase === 'error' && st.error && <p className="rounded-xl bg-rose-500/15 p-3 text-xs text-rose-300 break-words">{st.error}</p>}
      <div className="flex gap-2">
        <button className="btn-ghost flex-1" disabled={st.phase === 'syncing'} onClick={() => syncNow()}>Sincronizar ahora</button>
        <button className="btn-danger flex-1" disabled={busy} onClick={() => out(false)}>{busy ? '…' : 'Cerrar sesión'}</button>
      </div>
      {confirm && (
        <div className="space-y-2 rounded-xl border border-amber-400/40 p-3 text-sm">
          <p className="text-amber-300">Hay cambios que aún no se han subido (¿sin conexión?). Si cierras sesión ahora se perderán.</p>
          <div className="flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => setConfirm(false)}>Cancelar</button>
            <button className="btn-danger flex-1" onClick={() => out(true)}>Cerrar igualmente</button>
          </div>
        </div>
      )}
      <p className="text-xs text-zinc-500">Al cerrar sesión se borra la copia de este dispositivo; tus datos siguen en tu cuenta. Los vídeos subidos como archivo no se sincronizan (usa enlaces de YouTube/Vimeo).</p>
    </section>
  );
}
