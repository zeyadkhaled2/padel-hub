'use server';

import { redirect } from 'next/navigation';
import { authConfig } from '@/server/supabase/config';
import { serverClient } from '@/server/supabase/server';
import {
  clearRecoveryCookie,
  getRecoverySessionState,
  readAuthProviderSettings,
} from './server';
import {
  localeValue,
  type AuthMode,
  type ForgotPasswordState,
  type FormState,
  type GoogleAuthState,
  type RecoveryMfaState,
  type ResetPasswordState,
} from './types';
import {
  isTrustedOAuthRedirectUrl,
  mapAuthSignInError,
  mapAuthSignUpError,
  mapResetPasswordError,
  parseAuthCredentials,
  parseForgotPasswordEmail,
  parseResetPasswordInput,
} from './validation';

const TOTP_CODE_RE = /^\d{6}$/;

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
    const settings = await readAuthProviderSettings(config.url, config.key);
    if (!settings?.emailConfirmationEnforced) return { email, message: 'unavailable' };

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

  await clearRecoveryCookie(config.origin);
  redirect(`/${localeValue(locale)}/account`);
}

export async function continueWithGoogle(locale: string): Promise<GoogleAuthState> {
  const client = await serverClient();
  const config = authConfig();
  if (!client || !config) return { message: 'unavailable' };

  const settings = await readAuthProviderSettings(config.url, config.key);
  if (!settings) return { message: 'unavailable' };
  if (!settings.googleEnabled) return { message: 'googleUnavailable' };

  await clearRecoveryCookie(config.origin);
  const safeLocale = localeValue(locale);
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${config.origin}/${safeLocale}/auth/callback`,
      // Minimal Google identity scopes only — never Gmail, Drive, or Calendar.
      scopes: 'openid email profile',
      queryParams: { prompt: 'select_account' },
    },
  });

  if (error || !data?.url || !isTrustedOAuthRedirectUrl(data.url, config.url)) {
    return { message: 'oauthFailed' };
  }

  redirect(data.url);
}

export async function requestPasswordReset(
  locale: string,
  _previous: ForgotPasswordState,
  form: FormData,
): Promise<ForgotPasswordState> {
  const parsed = parseForgotPasswordEmail(form);
  if (!parsed.ok) {
    return { email: parsed.email, errors: parsed.errors };
  }

  const client = await serverClient();
  const config = authConfig();
  if (!client || !config) return { email: parsed.email, message: 'unavailable' };

  const safeLocale = localeValue(locale);
  const { error } = await client.auth.resetPasswordForEmail(parsed.email, {
    redirectTo: `${config.origin}/${safeLocale}/auth/recovery`,
  });

  if (error?.status === 429) {
    return { email: parsed.email, message: 'rateLimited' };
  }

  // Always return the same generic confirmation to prevent account enumeration.
  return { email: parsed.email, message: 'resetEmailSent' };
}

export async function verifyRecoveryMfa(
  locale: string,
  _previous: RecoveryMfaState,
  form: FormData,
): Promise<RecoveryMfaState> {
  const recovery = await getRecoverySessionState();
  if (recovery.status === 'unavailable') return { message: 'unavailable' };
  if (recovery.status === 'missing') return { message: 'recoverySessionMissing' };
  if (recovery.status === 'ready') {
    redirect(`/${localeValue(locale)}/auth/reset-password`);
  }

  const code = String(form.get('code') ?? '').trim();
  if (!TOTP_CODE_RE.test(code)) {
    return { message: 'mfaCodeInvalid' };
  }

  const verified = await recovery.client.auth.mfa.challengeAndVerify({
    factorId: recovery.factorId,
    code,
  });
  if (verified.error) {
    return { message: 'mfaCodeInvalid' };
  }

  redirect(`/${localeValue(locale)}/auth/reset-password`);
}

export async function updateRecoveredPassword(
  locale: string,
  _previous: ResetPasswordState,
  form: FormData,
): Promise<ResetPasswordState> {
  const parsed = parseResetPasswordInput(form);
  if (!parsed.ok) {
    return { errors: parsed.errors };
  }

  const recovery = await getRecoverySessionState();
  if (recovery.status === 'unavailable') return { message: 'unavailable' };
  if (recovery.status === 'missing') return { message: 'recoverySessionMissing' };
  if (recovery.status === 'mfa_required') return { message: 'mfaRequiredForReset' };

  const { error } = await recovery.client.auth.updateUser({
    password: parsed.password,
  });
  if (error) {
    return { message: mapResetPasswordError(error) };
  }

  const config = authConfig();
  await clearRecoveryCookie(config?.origin);
  await recovery.client.auth.signOut({ scope: 'global' });
  redirect(`/${localeValue(locale)}/auth/signin?reset=1`);
}

export async function cancelRecovery(locale: string) {
  const config = authConfig();
  const client = await serverClient();
  await clearRecoveryCookie(config?.origin);
  if (client) await client.auth.signOut({ scope: 'local' });
  redirect(`/${localeValue(locale)}/auth/signin`);
}

export async function signOut(locale: string) {
  const config = authConfig();
  const client = await serverClient();
  await clearRecoveryCookie(config?.origin);
  if (client) await client.auth.signOut({ scope: 'local' });
  redirect(`/${localeValue(locale)}/auth/signin`);
}
