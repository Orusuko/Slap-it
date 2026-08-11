export interface SupabaseCredentials {
  url: string;
  anonKey: string;
}

/**
 * Lee las credenciales del proyecto Supabase usadas únicamente como
 * transporte en tiempo real (sin tablas, sin datos persistidos). Devuelve
 * `null` cuando faltan, para que la app muestre una pantalla de
 * configuración en vez de fallar en silencio.
 */
export function readSupabaseCredentials(): SupabaseCredentials | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}
