import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authConfig } from '@/server/supabase/config';
import { serverClient } from '@/server/supabase/server';
import { localeValue } from './types';
import {
  classifySessionAmr,
  hasRecoveryAmr,
  parseCallbackCode,
  parseCallbackTokenParams,
} from './validation';

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

export type RecoverySessionCheck =
  | { status: 'unavailable' }
  | { status: 'missing' }
  | { status: 'mfa_required'; client: SupabaseClient; factorId: string }
  | { status: 'ready'; client: SupabaseClient };

async function inspectRecoverySession(client: SupabaseClient): Promise<RecoverySessionCheck> {
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user?.email_confirmed_at) {
    return { status: 'missing' };
  }

  const { data: aalData, error: aalError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError || !aalData || !hasRecoveryAmr(aalData.currentAuthenticationMethods)) {
    return { status: 'missing' };
  }

  // Only isolated recovery sessions (never approved initial signup sessions) may reset passwords.
  const active = await client.rpc('is_my_account_session_active');
  if (active.error) return { status: 'unavailable' };
  if (active.data === true) return { status: 'missing' };

  const verifiedTotpFromUser = (userData.user.factors ?? []).find(
    (factor) => factor.factor_type === 'totp' && factor.status === 'verified',
  );
  const needsMfa =
    (aalData.nextLevel === 'aal2' || Boolean(verifiedTotpFromUser)) &&
    aalData.currentLevel !== 'aal2';

  if (needsMfa) {
    let factorId = verifiedTotpFromUser?.id ?? null;
    if (!factorId) {
      const factors = await client.auth.mfa.listFactors();
      const verifiedTotp = factors.error
        ? null
        : factors.data.totp.find((factor) => factor.status === 'verified') ?? factors.data.totp[0];
      factorId = verifiedTotp?.id ?? null;
    }
    if (!factorId) return { status: 'missing' };
    return { status: 'mfa_required', client, factorId };
  }

  return { status: 'ready', client };
}

async function revokeRestrictedSessionIfPresent(client: SupabaseClient): Promise<void> {
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) return;

  const { data: aalData, error: aalError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError || !aalData) {
    await client.auth.signOut({ scope: 'local' });
    return;
  }

  const amrClass = classifySessionAmr(aalData.currentAuthenticationMethods);
  if (amrClass === 'primary') return;

  if (amrClass === 'otp_signup_candidate') {
    const active = await client.rpc('is_my_account_session_active');
    if (!active.error && active.data === true) return;
  }

  await client.auth.signOut({ scope: 'local' });
}

export async function getRecoverySessionState(): Promise<RecoverySessionCheck> {
  const config = authConfig();
  if (!config) return { status: 'unavailable' };

  const client = await serverClient();
  if (!client) return { status: 'unavailable' };

  return inspectRecoverySession(client);
}

export async function handleRecoveryVerification(
  request: NextRequest,
  rawLocale: string,
): Promise<NextResponse> {
  const locale = localeValue(rawLocale);
  const config = authConfig();
  const origin = config?.origin ?? request.nextUrl.origin;

  let verified = false;

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
        const state = await inspectRecoverySession(client);
        if (state.status === 'ready' || state.status === 'mfa_required') {
          verified = true;
        } else {
          await client.auth.signOut({ scope: 'local' });
        }
      } else {
        // An invalid/expired/reused recovery link must invalidate any existing
        // unfinished recovery session instead of leaving it active in the browser.
        await revokeRestrictedSessionIfPresent(client);
      }
    }
  }

  // Fixed destination only: never trust next, redirect_to, or request Host.
  const destination = verified
    ? `/${locale}/auth/reset-password`
    : `/${locale}/auth/reset-password?error=invalid`;
  const response = NextResponse.redirect(new URL(destination, origin));
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
