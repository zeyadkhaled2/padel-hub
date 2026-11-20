'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { authConfig } from '@/server/supabase/config';
import { serverClient } from '@/server/supabase/server';
import { localeValue, type AuthMode, type FormState } from './types';
import { mapAuthSignInError, mapAuthSignUpError, parseAuthCredentials } from './validation';

const authSettingsSchema = z.object({
  mailer_autoconfirm: z.boolean(),
});

async function isEmailConfirmationEnforced(url: string, key: string): Promise<boolean> {
  // Fail closed when a local/hosted Auth server has confirmation disabled.
  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      cache: 'no-store',
    });
    if (!response.ok) return false;
    const settings = authSettingsSchema.safeParse(await response.json());
    return settings.success && settings.data.mailer_autoconfirm === false;
  } catch {
    return false;
  }
}

export async function authenticate(
  locale: string,
  mode: AuthMode,
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const credentials = parseAuthCredentials(mode, form);
  if (!credentials.ok) {
    return { email: credentials.email, errors: credentials.errors };
  }

  const client = await serverClient();
  const config = authConfig();
  const { email } = credentials.data;
  if (!client || !config) return { email, message: 'unavailable' };

  if (mode === 'signup') {
    const confirmationEnforced = await isEmailConfirmationEnforced(config.url, config.key);
    if (!confirmationEnforced) return { email, message: 'unavailable' };

    const { error } = await client.auth.signUp({
      ...credentials.data,
      options: { emailRedirectTo: `${config.origin}/${localeValue(locale)}/auth/callback` },
    });
    if (error) return { email, message: mapAuthSignUpError(error) };
    return { email, message: 'checkEmail' };
  }

  const { error } = await client.auth.signInWithPassword(credentials.data);
  if (error) return { email, message: mapAuthSignInError(error) };

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
