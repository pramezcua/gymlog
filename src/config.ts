/**
 * Conexión con Supabase (cuentas + sincronización).
 * Si se dejan vacíos, la app funciona en modo local (datos solo en este dispositivo, sin cuentas).
 * La clave "publishable"/"anon" es pública por diseño: la seguridad la da Row Level Security
 * (ver supabase/schema.sql). NUNCA pongas aquí la clave secreta / service_role.
 */
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';
