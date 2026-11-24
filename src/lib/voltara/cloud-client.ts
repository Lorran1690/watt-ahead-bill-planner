import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// URL e chave PUBLICÁVEL do projeto exclusivo Voltara. Pode ser usada no navegador
// com as políticas de Row Level Security (RLS) instaladas no Supabase.
// Variáveis de ambiente substituem estes valores quando configuradas.
const url = import.meta.env.VITE_SUPABASE_URL?.trim() || "https://okbqictunqsiqmoygbjs.supabase.co";
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || "sb_publishable_3KLmnwy17viytpY9Ka3xkQ_7KXON0v9";

export const cloudConfigured = Boolean(url && key);
let client: SupabaseClient | null = null;

/**
 * Só usa uma chave PÚBLICA, protegida pelo RLS do banco.
 * NUNCA usar secret/service_role no cliente.
 * O módulo é seguro em SSR: cria client apenas no navegador.
 */
export function getCloudClient(): SupabaseClient | null {
  if (typeof window === "undefined" || !cloudConfigured) return null;
  if (!client) {
    client = createClient(url!, key!, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}
