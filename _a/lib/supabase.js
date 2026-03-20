/**
 * ════════════════════════════════════════════════════════════════════════════
 * Archivo: lib/supabase.js
 * Descripcion: Configuracion y creacion de clientes de Supabase.
 *
 * Este modulo exporta dos formas de conectarse a Supabase:
 *
 *   1. `supabase` (cliente publico):
 *      - Usa la clave anonima (anon key) de Supabase.
 *      - Seguro para usar en el navegador (browser) y en Server Components.
 *      - Respeta las politicas de Row Level Security (RLS).
 *
 *   2. `createServiceClient()` (cliente administrativo):
 *      - Usa la clave de servicio (service role key).
 *      - SOLO debe usarse en el servidor (API routes, server actions).
 *      - Omite las politicas RLS, por lo que tiene acceso completo a la BD.
 *      - No mantiene sesion de autenticacion (autoRefreshToken y persistSession desactivados).
 *
 * Variables de entorno requeridas:
 *   - NEXT_PUBLIC_SUPABASE_URL: URL del proyecto Supabase
 *   - NEXT_PUBLIC_SUPABASE_ANON_KEY: Clave publica anonima
 *   - SUPABASE_SERVICE_ROLE_KEY: Clave de servicio (solo para createServiceClient)
 * ════════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

// ─── Variables de Entorno ───────────────────────────────────────────────────

/** URL base del proyecto Supabase (ej: https://xxxx.supabase.co) */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

/** Clave anonima publica para operaciones con RLS */
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Validacion temprana: si faltan las variables esenciales, lanzar error
// inmediatamente para evitar errores confusos mas adelante en la ejecucion
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan las variables de entorno de Supabase. Revisa tu archivo .env.local');
}

// ─── Cliente Publico (Anon Key) ─────────────────────────────────────────────

/**
 * Cliente de Supabase con clave anonima.
 * Puede usarse tanto en el navegador como en Server Components.
 * Todas las consultas estan sujetas a las politicas de RLS configuradas en Supabase.
 *
 * @type {import('@supabase/supabase-js').SupabaseClient}
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ─── Cliente Administrativo (Service Role Key) ──────────────────────────────

/**
 * Crea un cliente de Supabase con permisos de servicio (service role).
 * Este cliente tiene acceso completo a la base de datos, ignorando las
 * politicas de Row Level Security (RLS).
 *
 * IMPORTANTE: Solo debe usarse en contextos del servidor (API routes,
 * server actions, cron jobs). Nunca exponer la service role key al navegador.
 *
 * La sesion de autenticacion esta desactivada porque este cliente opera
 * como un servicio sin usuario, no necesita mantener tokens de sesion.
 *
 * @returns {import('@supabase/supabase-js').SupabaseClient} Cliente de Supabase con permisos administrativos
 * @throws {Error} Si la variable de entorno SUPABASE_SERVICE_ROLE_KEY no esta configurada
 */
export function createServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en las variables de entorno');
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,   // No renovar tokens automaticamente (no hay sesion de usuario)
      persistSession: false,     // No almacenar sesion en almacenamiento local
    },
  });
}
