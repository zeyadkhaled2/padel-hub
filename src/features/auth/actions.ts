'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { serverClient } from '@/server/supabase/server';
import { authConfig } from '@/server/supabase/config';
import { localeValue, type FormState } from './types';

export async function authenticate(locale: string, mode: 'signin' | 'signup', _previous: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get('email') ?? '').trim();
  const password = form.get('password');
  const parsed = z.object({ email: z.email().max(254), password: z.string().min(mode === 'signup' ? 8 : 1).max(128) }).safeParse({ email, password });
  if (!parsed.success) return { email, errors: Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[0]), issue.path[0] === 'email' ? 'emailInvalid' : 'passwordInvalid'])) };
  const client = await serverClient();
  const config = authConfig();
  if (!client || !config) return { email, message: 'unavailable' };
  if (mode === 'signup') {
    // Fail closed when a local/hosted Auth server has confirmation disabled.
    try {
      const settings = await fetch(`${config.url}/auth/v1/settings`, { headers: { apikey: config.key }, cache: 'no-store' });
      if (!settings.ok || (await settings.json()).mailer_autoconfirm !== false) return { email, message: 'unavailable' };
    } catch { return { email, message: 'unavailable' }; }
    const { error } = await client.auth.signUp({ ...parsed.data, options: { emailRedirectTo: `${config.origin}/${localeValue(locale)}/auth/callback` } });
    if (error) return { email, message: error.status === 429 ? 'rateLimited' : 'signupFailed' };
    return { email, message: 'checkEmail' };
  }
  const { error } = await client.auth.signInWithPassword(parsed.data);
  if (error) return { email, message: error.code === 'email_not_confirmed' ? 'confirmFirst' : error.status === 429 ? 'rateLimited' : 'signinFailed' };
  const { data } = await client.auth.getUser();
  if (!data.user?.email_confirmed_at) {
    await client.auth.signOut({ scope: 'local' });
    return { email, message: 'confirmFirst' };
  }
  redirect(`/${localeValue(locale)}/account`);
}

export async function signOut(locale: string) {
  const client = await serverClient();
  if (client) await client.auth.signOut({ scope: 'local' });
  redirect(`/${localeValue(locale)}/auth/signin`);
}
