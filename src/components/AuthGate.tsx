import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Dexie from 'dexie';
import type { User } from '@supabase/supabase-js';
import { db, GymDB, LOCAL_DB_NAME, SYNC_TABLES, switchDatabase } from '../db';
import { appUrl, authErrorEs, cloudEnabled, supabase, supabaseRemote } from '../lib/supabase';
import { clearSyncState, getSyncStatus, hasPendingChanges, startSync, stopSync, syncNow } from '../lib/sync';
import { seedIfEmpty } from '../lib/seed';

type Account = { userId: string; email: string; signOut: (force?: boolean) => Promise<'ok' | 'pending'> } | null;
const AccountContext = createContext<Account>(null);
/** Cuenta actual (null en modo local sin Supabase). */
export const useAccount = () => useContext(AccountContext);

/** ¿Se ha abierto la app desde un enlace de correo? Se lee al cargar, antes de limpiar la URL. */
const landing = (() => {
  const q = new URLSearchParams(location.search);
  const h = new URLSearchParams(location.hash.replace(/^#\/?/, ''));
  return {
    fromEmail: q.has('code') || q.has('flow') || h.has('error_description'),
    flow: q.get('flow'), // 'signup' | 'recovery'
    error: q.get('error_description') ?? h.get('error_description'),
  };
})();

function landingNotice(): Notice | null {
  if (!landing.fromEmail) return null;
  if (landing.error) {
    return { ok: false, text: /expired|invalid/i.test(landing.error)
      ? 'El enlace del correo ha caducado o ya se había usado. Inicia sesión; si aún no puedes, pide otro correo.'
      : `No se pudo completar el enlace del correo: ${landing.error}` };
  }
  if (landing.flow === 'recovery') {
    return { ok: false, text: 'Para cambiar la contraseña, abre el enlace del correo en el mismo navegador en el que lo pediste. Si no, vuelve a pedirlo desde aquí.' };
  }
  return { ok: true, text: '¡Email confirmado! Ya puedes iniciar sesión con tu email y contraseña. Si tienes la app instalada en el móvil, ábrela e inicia sesión allí.' };
}

type Notice = { ok: boolean; text: string };

type Phase =
  | { kind: 'loading'; text?: string }
  | { kind: 'signedOut' }
  | { kind: 'recovery' }
  | { kind: 'ready'; user: User };

export default function AuthGate({ children }: { children: (key: string) => ReactNode }) {
  const [phase, setPhase] = useState<Phase>(cloudEnabled ? { kind: 'loading' } : { kind: 'signedOut' });
  const current = useRef<string | null>(null);

  useEffect(() => {
    if (!supabase) { seedIfEmpty().catch(console.error); return; }

    async function enter(user: User) {
      if (current.current === user.id) return;
      current.current = user.id;
      setPhase({ kind: 'loading', text: 'Sincronizando tus datos…' });
      switchDatabase(user.id);
      startSync(supabaseRemote(supabase!, user.id));
      // Primera sincronización (máx. 10 s; si no hay red se entra igualmente con los datos locales)
      const ok = await Promise.race([
        syncNow().then(() => true),
        new Promise<boolean>(r => setTimeout(() => r(false), 10_000)),
      ]);
      if (ok && getSyncStatus().phase === 'idle') {
        try {
          await claimLegacyData(user.id);
          await seedIfEmpty(); // solo con la nube ya descargada, para no duplicar ejercicios
        } catch (e) { console.error(e); }
      }
      setPhase({ kind: 'ready', user });
    }

    supabase.auth.getSession().then(({ data }) => {
      // Limpia la URL tras volver de un enlace de correo (supabase-js ya ha usado el código)
      if (landing.fromEmail) history.replaceState(null, '', appUrl() + (landing.error ? '' : location.hash));
      if (data.session) enter(data.session.user);
      else setPhase(p => (p.kind === 'recovery' ? p : { kind: 'signedOut' }));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') { setPhase({ kind: 'recovery' }); return; }
      if (event === 'SIGNED_IN' && session) setTimeout(() => enter(session.user), 0);
      if (event === 'SIGNED_OUT') { current.current = null; setPhase({ kind: 'signedOut' }); }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!cloudEnabled) return <AccountContext.Provider value={null}>{children('local')}</AccountContext.Provider>;
  if (phase.kind === 'loading') return <Splash text={phase.text} />;
  if (phase.kind === 'recovery') return <RecoveryScreen onDone={() => setPhase({ kind: 'loading' })} />;
  if (phase.kind === 'signedOut') return <LoginScreen initialNotice={landingNotice()} />;

  const account: Account = {
    userId: phase.user.id,
    email: phase.user.email ?? '',
    async signOut(force = false) {
      await syncNow();
      if (!force && (await hasPendingChanges())) return 'pending';
      await stopSync();
      const name = db.name;
      switchDatabase(null);
      // Borra la copia local de este usuario (sus datos siguen en la nube): importante en dispositivos compartidos
      await Dexie.delete(name).catch(() => {});
      clearSyncState(name);
      current.current = null;
      await supabase!.auth.signOut();
      return 'ok';
    },
  };
  return <AccountContext.Provider value={account}>{children(phase.user.id)}</AccountContext.Provider>;
}

/**
 * Si este dispositivo tenía datos de antes de usar cuentas (base "gymlog") y la cuenta está vacía,
 * los traspasa una única vez a la cuenta para no perder lo ya registrado.
 */
async function claimLegacyData(userId: string) {
  const CLAIM = 'gymlog.legacyClaimedBy';
  if (localStorage.getItem(CLAIM)) return;
  if (await db.exercises.count()) return; // la cuenta ya tiene datos
  if (!(await Dexie.exists(LOCAL_DB_NAME))) return;
  const legacy = new GymDB(LOCAL_DB_NAME);
  try {
    await legacy.open();
    if (!(await legacy.exercises.count())) return;
    await db.transaction('rw', [...SYNC_TABLES.map(t => db.table(t)), db.media], async () => {
      for (const t of SYNC_TABLES) await db.table(t).bulkPut(await legacy.table(t).toArray());
      await db.media.bulkPut(await legacy.media.toArray());
    });
    localStorage.setItem(CLAIM, userId);
  } finally {
    legacy.close();
  }
}

function Splash({ text }: { text?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-zinc-950 text-zinc-400">
      <div className="text-center">
        <Logo />
        <p className="mt-4 text-sm">{text ?? 'Cargando…'}</p>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 512 512" className="mx-auto h-16 w-16" aria-hidden>
      <rect width="512" height="512" rx="112" fill="#18181b" />
      <g fill="#a3e635"><rect x="96" y="176" width="48" height="160" rx="16" /><rect x="368" y="176" width="48" height="160" rx="16" /><rect x="56" y="216" width="40" height="80" rx="12" /><rect x="416" y="216" width="40" height="80" rx="12" /><rect x="144" y="236" width="224" height="40" rx="8" /></g>
    </svg>
  );
}

function LoginScreen({ initialNotice }: { initialNotice: Notice | null }) {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Notice | null>(initialNotice);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      if (mode === 'login') {
        const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else if (mode === 'signup') {
        const { data, error } = await supabase!.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${appUrl()}?flow=signup` } });
        if (error) throw error;
        if (!data.session) {
          setMsg({ ok: true, text: `Te hemos enviado un correo a ${email.trim()}. Pulsa el enlace para confirmar la cuenta (mira también en spam) y después inicia sesión aquí.` });
          setMode('login');
        }
      } else {
        const { error } = await supabase!.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${appUrl()}?flow=recovery` });
        if (error) throw error;
        setMsg({ ok: true, text: 'Si el email tiene cuenta, recibirás un enlace para elegir una contraseña nueva. Ábrelo en este mismo navegador.' });
      }
    } catch (err) {
      setMsg({ ok: false, text: authErrorEs(err instanceof Error ? err.message : String(err)) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10 text-zinc-100">
      <Logo />
      <h1 className="mt-4 text-center text-2xl font-bold">GymLog</h1>
      <p className="mb-6 text-center text-sm text-zinc-400">Tu bitácora de entrenamiento, sincronizada en todos tus dispositivos.</p>

      {mode !== 'forgot' && (
        <div className="mb-4 flex rounded-xl bg-zinc-800 p-1 text-sm">
          {(['login', 'signup'] as const).map(m => (
            <button key={m} type="button" onClick={() => { setMode(m); setMsg(null); }}
              className={`flex-1 rounded-lg py-2 ${mode === m ? 'bg-zinc-950 text-lime-400' : 'text-zinc-400'}`}>
              {m === 'login' ? 'Entrar' : 'Crear cuenta'}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" required autoComplete="email" inputMode="email" className="input"
            value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        {mode !== 'forgot' && (
          <div>
            <label className="label" htmlFor="password">Contraseña</label>
            <div className="relative">
              <input id="password" type={show ? 'text' : 'password'} required minLength={6}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} className="input pr-20"
                value={password} onChange={e => setPassword(e.target.value)} />
              <button type="button" onClick={() => setShow(v => !v)} className="absolute inset-y-0 right-2 text-xs text-zinc-400">
                {show ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </div>
        )}
        <button type="submit" disabled={busy} className="btn-primary min-h-12 w-full">
          {busy ? '…' : mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Crear cuenta' : 'Enviar enlace'}
        </button>
      </form>

      {msg && <p className={`mt-4 rounded-xl p-3 text-sm ${msg.ok ? 'bg-lime-400/10 text-lime-300' : 'bg-rose-500/15 text-rose-300'}`}>{msg.text}</p>}

      <button type="button" className="mt-4 text-sm text-zinc-400 underline"
        onClick={() => { setMode(mode === 'forgot' ? 'login' : 'forgot'); setMsg(null); }}>
        {mode === 'forgot' ? 'Volver a iniciar sesión' : '¿Has olvidado la contraseña?'}
      </button>
    </div>
  );
}

function RecoveryScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    const { data, error } = await supabase!.auth.updateUser({ password });
    setBusy(false);
    if (error) { setError(authErrorEs(error.message)); return; }
    if (data.user) { onDone(); location.reload(); }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 text-zinc-100">
      <Logo />
      <h1 className="mt-4 mb-6 text-center text-xl font-bold">Elige una contraseña nueva</h1>
      <form onSubmit={submit} className="space-y-3">
        <input type="password" required minLength={6} autoComplete="new-password" className="input" placeholder="Contraseña nueva"
          value={password} onChange={e => setPassword(e.target.value)} />
        <button type="submit" disabled={busy} className="btn-primary min-h-12 w-full">{busy ? '…' : 'Guardar contraseña'}</button>
      </form>
      {error && <p className="mt-4 rounded-xl bg-rose-500/15 p-3 text-sm text-rose-300">{error}</p>}
    </div>
  );
}
