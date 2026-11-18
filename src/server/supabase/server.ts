import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { authConfig } from './config';

export async function serverClient() {
  const config = authConfig();
  if (!config) return null;
  const store = await cookies();
  return createServerClient(config.url, config.key, {
    cookieOptions: { httpOnly: true, sameSite: 'lax', secure: config.origin.startsWith('https:') },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        try { values.forEach(({ name, value, options }) => store.set(name, value, options)); }
        catch { /* Server Component: proxy persists refreshed cookies. */ }
      },
    },
  });
}

export async function verifiedClient() {
  const client = await serverClient();
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  return !error && data.user?.email_confirmed_at ? client : null;
}
