import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { serverClient, RECOVERY_UID_COOKIE } from '@/server/supabase/server';
import { authConfig } from '@/server/supabase/config';
import { handleRecoveryVerification } from '@/features/auth/server';
import { localeValue } from '@/features/auth/types';
import {
  mapOAuthCallbackErrorParam,
  parseCallbackCode,
  parseCallbackTokenParams,
} from '@/features/auth/validation';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
) {
  const locale = localeValue((await params).locale);
  const config = authConfig();
  const origin = config?.origin ?? request.nextUrl.origin;

  // Handle OAuth provider error or cancellation without reflecting untrusted descriptions.
  const oauthError = request.nextUrl.searchParams.get('error');
  if (oauthError) {
    const mapped = mapOAuthCallbackErrorParam(oauthError);
    const response = NextResponse.redirect(
      new URL(`/${locale}/auth/signin?error=${mapped}`, origin),
    );
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  }

  // Delegate recovery token_hash links cleanly to the recovery handler.
  const tokenParams = parseCallbackTokenParams(request.nextUrl.searchParams);
  if (tokenParams?.type === 'recovery') {
    return handleRecoveryVerification(request, locale);
  }

  const code = parseCallbackCode(request.nextUrl.searchParams);
  let success = false;

  if (config) {
    const client = await serverClient();
    if (client) {
      let exchanged = false;
      if (tokenParams) {
        const { error } = await client.auth.verifyOtp({
          type: tokenParams.type,
          token_hash: tokenParams.tokenHash,
        });
        exchanged = !error;
      } else if (code) {
        const { error } = await client.auth.exchangeCodeForSession(code);
        exchanged = !error;
      }

      if (exchanged) {
        const { data } = await client.auth.getUser();
        success = !!data.user?.email_confirmed_at;
        if (!success) {
          await client.auth.signOut({ scope: 'local' });
        } else {
          const store = await cookies();
          store.set(RECOVERY_UID_COOKIE, '', {
            httpOnly: true,
            sameSite: 'lax',
            secure: config.origin.startsWith('https:'),
            path: '/',
            maxAge: 0,
          });
        }
      }
    }
  }

  // Fixed destination: never trust next, redirect_to, or request Host for navigation.
  const response = NextResponse.redirect(
    new URL(`/${locale}/${success ? 'account' : 'auth/signin?error=confirmation'}`, origin),
  );
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
