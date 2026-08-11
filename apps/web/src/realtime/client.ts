import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseCredentials } from "./env";

let cached: SupabaseClient | null = null;

/**
 * Cliente Supabase memorizado por pestaña, usado solo para Realtime
 * (Broadcast + Presence). No se leen ni escriben tablas.
 */
export function getSupabaseClient(): SupabaseClient {
  if (cached) return cached;
  const credentials = readSupabaseCredentials();
  if (!credentials) {
    throw new Error(
      "Falta configurar Supabase. Crea apps/web/.env con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.",
    );
  }
  cached = createClient(credentials.url, credentials.anonKey, {
    realtime: { params: { eventsPerSecond: 10 } },
  });
  return cached;
}
