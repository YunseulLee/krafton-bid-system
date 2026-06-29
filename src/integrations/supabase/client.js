import { getSupabaseConfig } from './config.js';

export async function createSupabaseBrowserClient(env = import.meta.env || {}) {
  const config = getSupabaseConfig(env);
  if (!config.configured) return { client: null, config };

  const { createClient } = await import('@supabase/supabase-js');
  return {
    client: createClient(config.url, config.anonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    }),
    config,
  };
}
