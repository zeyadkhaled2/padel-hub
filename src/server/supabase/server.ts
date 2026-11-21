import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { classifySessionAmr } from '@/features/auth/validation';
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

export async function verifiedUserClient() {
  const client = await serverClient();
  if (!client) return null;

  // Verify the live token signature and confirmed-email status with Supabase Auth first.
  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.email_confirmed_at) return null;

  // Enforce server-side recovery-session isolation independent of any client cookie or TTL.
  const { data: aalData, error: aalError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError || !aalData) return null;

  const amrClass = classifySessionAmr(aalData.currentAuthenticationMethods);
  if (amrClass === 'primary') {
    return { client, user: data.user };
  }

  if (amrClass === 'otp_signup_candidate') {
    const active = await client.rpc('is_my_account_session_active');
    if (!active.error && active.data === true) {
      return { client, user: data.user };
    }
  }

  return null;
}

export async function verifiedClient() {
  const verified = await verifiedUserClient();
  return verified ? verified.client : null;
}
