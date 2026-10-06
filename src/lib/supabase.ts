import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';
import type { Remote, RemoteRow } from './sync';

export const cloudEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase: SupabaseClient | null = cloudEnabled
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'gymlog-auth' },
    })
  : null;

/** URL a la que vuelven los enlaces de correo (confirmación, recuperar contraseña). */
export const appUrl = () => `${location.origin}${location.pathname}`;

/** Implementación del backend de sincronización sobre la tabla `records`. */
export function supabaseRemote(client: SupabaseClient, userId: string): Remote {
  return {
    async pull(since, limit) {
      let q = client.from('records').select('tbl,id,data,updated_at,deleted,server_ts')
        .order('server_ts', { ascending: true }).limit(limit);
      if (since) q = q.gt('server_ts', since);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as RemoteRow[];
    },
    async push(rows) {
      if (!rows.length) return;
      const { error } = await client.from('records')
        .upsert(rows.map(r => ({ user_id: userId, tbl: r.tbl, id: r.id, data: r.data, updated_at: r.updated_at, deleted: r.deleted })),
          { onConflict: 'user_id,tbl,id' });
      if (error) throw new Error(error.message);
    },
  };
}

/** Traduce los errores de Supabase Auth más habituales. */
export function authErrorEs(msg: string) {
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Email o contraseña incorrectos.';
  if (m.includes('email not confirmed')) return 'Aún no has confirmado tu email. Revisa tu bandeja de entrada (y el spam).';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Ese email ya tiene cuenta. Inicia sesión.';
  if (m.includes('password should be at least') || m.includes('weak')) return 'La contraseña es demasiado débil (mínimo 6 caracteres; mejor 8+ con números).';
  if (m.includes('rate limit') || m.includes('too many')) return 'Demasiados intentos. Espera unos minutos.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Sin conexión con el servidor. Comprueba tu internet.';
  if (m.includes('invalid email') || m.includes('unable to validate email')) return 'El email no es válido.';
  return msg;
}
