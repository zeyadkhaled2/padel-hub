import { NextRequest, NextResponse } from 'next/server';
import { serverClient } from '@/server/supabase/server';
import { authConfig } from '@/server/supabase/config';
import { localeValue } from '@/features/auth/types';

export async function GET(request: NextRequest, { params }: { params: Promise<{ locale: string }> }) {
  const locale = localeValue((await params).locale);
  const config = authConfig();
  const code = request.nextUrl.searchParams.get('code');
  let success = false;
  if (config && code && code.length < 2048) {
    const client = await serverClient();
    if (client) {
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!error) {
        const { data } = await client.auth.getUser();
        success = !!data.user?.email_confirmed_at;
        if (!success) await client.auth.signOut({ scope: 'local' });
      }
    }
  }
  // Fixed destination: never trust next, redirect_to, or request Host for navigation.
  const response = NextResponse.redirect(new URL(`/${locale}/${success ? 'account' : 'auth/signin?error=confirmation'}`, config?.origin ?? request.nextUrl.origin));
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
