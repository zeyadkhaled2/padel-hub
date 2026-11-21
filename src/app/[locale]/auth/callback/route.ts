import { NextRequest, NextResponse } from 'next/server';
import { serviceClient } from '@/server/supabase/clients';
import { serverClient } from '@/server/supabase/server';
import { authConfig } from '@/server/supabase/config';
import { handleRecoveryVerification } from '@/features/auth/server';
import { localeValue } from '@/features/auth/types';
import {
  classifySessionAmr,
  extractJwtSessionId,
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
      let accessToken: string | null = null;
      if (tokenParams && tokenParams.type === 'signup') {
        const { data, error } = await client.auth.verifyOtp({
          type: 'signup',
          token_hash: tokenParams.tokenHash,
        });
        exchanged = !error;
        accessToken = data.session?.access_token ?? null;
      } else if (!tokenParams && code) {
        const { data, error } = await client.auth.exchangeCodeForSession(code);
        exchanged = !error;
        accessToken = data.session?.access_token ?? null;
      }

      if (exchanged) {
        const { data: userData, error: userError } = await client.auth.getUser();
        const user = !userError ? userData.user : null;

        if (user?.email_confirmed_at) {
          const { data: aalData, error: aalError } =
            await client.auth.mfa.getAuthenticatorAssuranceLevel();
          const amrClass =
            !aalError && aalData
              ? classifySessionAmr(aalData.currentAuthenticationMethods)
              : 'restricted';

          if (amrClass === 'primary') {
            success = true;
          } else if (amrClass === 'otp_signup_candidate') {
            // Only approve a genuine first-time email-confirmation OTP session
            // (never a replayed PKCE recovery code or previously recovered account).
            const sessionId = extractJwtSessionId(accessToken);
            const adminClient = serviceClient();
            if (sessionId && adminClient) {
              const approved = await adminClient.rpc('approve_signup_confirmation_session', {
                p_session_id: sessionId,
                p_user_id: user.id,
              });
              success = !approved.error && approved.data === true;
            }
          }
        }

        if (!success) {
          await client.auth.signOut({ scope: 'local' });
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
