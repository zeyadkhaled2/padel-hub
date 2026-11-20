import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { authConfig } from './config';

function createStatelessClient(url: string, key: string, timeoutMs: number): SupabaseClient {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) }),
    },
  });
}

export function anonClient(timeoutMs = 10_000): SupabaseClient | null {
  const config = authConfig();
  if (!config) return null;
  return createStatelessClient(config.url, config.key, timeoutMs);
}

export function serviceClient(timeoutMs = 10_000): SupabaseClient | null {
  const config = authConfig();
  const key = process.env.PADELHUB_SUPABASE_SERVICE_ROLE_KEY;
  if (!config || !key) return null;
  return createStatelessClient(config.url, key, timeoutMs);
}
