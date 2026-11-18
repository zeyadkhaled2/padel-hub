import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import type { NextRequest } from 'next/server';
import { refreshSession } from './server/supabase/proxy';

const internationalize = createMiddleware(routing);
export default function proxy(request: NextRequest) {
  if (/^\/(en|ar)\/(auth|account|admin)(\/|$)/.test(request.nextUrl.pathname)) {
    return refreshSession(request, () => internationalize(request));
  }
  return internationalize(request);
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
