import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authConfig } from '@/server/supabase/config';
import { RECOVERY_UID_COOKIE, serverClient } from '@/server/supabase/server';
import { localeValue } from './types';
import {
  hasRecoveryAmr,
  parseCallbackCode,
  parseCallbackTokenParams,
} from './validation';

const RECOVERY_COOKIE_MAX_AGE_SECONDS = 900;

const authProviderSettingsSchema = z.object({
  mailer_autoconfirm: z.boolean(),
  external: z
    .object({
      email: z.boolean().optional(),
      google: z.boolean().optional(),
    })
    .optional(),
});

export type AuthProviderSettings = {
  emailConfirmationEnforced: boolean;
  googleEnabled: boolean;
};

export async function readAuthProviderSettings(
  url: string,
  key: string,
): Promise<AuthProviderSettings | null> {
  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const parsed = authProviderSettingsSchema.safeParse(await response.json());
    if (!parsed.success) return null;
    return {
      emailConfirmationEnforced: parsed.data.mailer_autoconfirm === false,
      googleEnabled: parsed.data.external?.google === true,
    };
  } catch {
    return null;
  }
}

export function recoveryCookieOptions(origin: string) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: origin.startsWith('https:'),
    path: '/',
    maxAge: RECOVERY_COOKIE_MAX_AGE_SECONDS,
  };
}

export async function clearRecoveryCookie(origin?: string) {
  try {
    const store = await cookies();
    store.set(RECOVERY_UID_COOKIE, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: origin ? origin.startsWith('https:') : false,
      path: '/',
      maxAge: 0,
    });
  } catch {
    // Ignore when called from read-only Server Component render.
  }
}

export type RecoverySessionCheck =
  | { status: 'unavailable' }
  | { status: 'missing' }
  | { status: 'mfa_required'; client: SupabaseClient; factorId: string }
  | { status: 'ready'; client: SupabaseClient };

export async function getRecoverySessionState(): Promise<RecoverySessionCheck> {
  const config = authConfig();
  if (!config) return { status: 'unavailable' };

  const store = await cookies();
  const recoveryUid = store.get(RECOVERY_UID_COOKIE)?.value?.trim();
  if (!recoveryUid) return { status: 'missing' };

  const client = await serverClient();
  if (!client) return { status: 'unavailable' };

  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user?.email_confirmed_at || userData.user.id !== recoveryUid) {
    return { status: 'missing' };
  }

  const { data: aalData, error: aalError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError || !aalData || !hasRecoveryAmr(aalData.currentAuthenticationMethods)) {
    return { status: 'missing' };
  }

  if (aalData.nextLevel === 'aal2' && aalData.currentLevel !== 'aal2') {
    const factors = await client.auth.mfa.listFactors();
    const verifiedTotp = factors.error
      ? null
      : factors.data.totp.find((factor) => factor.status === 'verified') ?? factors.data.totp[0];
    if (!verifiedTotp) return { status: 'missing' };
    return { status: 'mfa_required', client, factorId: verifiedTotp.id };
  }

  return { status: 'ready', client };
}

export async function handleRecoveryVerification(
  request: NextRequest,
  rawLocale: string,
): Promise<NextResponse> {
  const locale = localeValue(rawLocale);
  const config = authConfig();
  const origin = config?.origin ?? request.nextUrl.origin;

  let verifiedUserId: string | null = null;

  if (config) {
    const tokenParams = parseCallbackTokenParams(request.nextUrl.searchParams);
    const code = parseCallbackCode(request.nextUrl.searchParams);
    const client = await serverClient();

    if (client) {
      let exchanged = false;
      if (tokenParams && tokenParams.type === 'recovery') {
        const { error } = await client.auth.verifyOtp({
          type: 'recovery',
          token_hash: tokenParams.tokenHash,
        });
        exchanged = !error;
      } else if (!tokenParams && code) {
        const { error } = await client.auth.exchangeCodeForSession(code);
        exchanged = !error;
      }

      if (exchanged) {
        const [{ data: userData }, { data: aalData }] = await Promise.all([
          client.auth.getUser(),
          client.auth.mfa.getAuthenticatorAssuranceLevel(),
        ]);
        if (
          userData.user?.email_confirmed_at &&
          hasRecoveryAmr(aalData?.currentAuthenticationMethods)
        ) {
          verifiedUserId = userData.user.id;
        } else {
          await client.auth.signOut({ scope: 'local' });
        }
      }
    }
  }

  // Fixed destination only: never trust next, redirect_to, or request Host.
  const store = await cookies();
  if (verifiedUserId && config) {
    store.set(RECOVERY_UID_COOKIE, verifiedUserId, recoveryCookieOptions(config.origin));
  } else {
    store.set(RECOVERY_UID_COOKIE, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: origin.startsWith('https:'),
      path: '/',
      maxAge: 0,
    });
  }

  const destination = verifiedUserId
    ? `/${locale}/auth/reset-password`
    : `/${locale}/auth/reset-password?error=invalid`;
  const response = NextResponse.redirect(new URL(destination, origin));
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
