import { z } from 'zod';
import type { AuthFieldErrors, AuthMessage, AuthMode } from './types';

export type ParsedAuthCredentials =
  | { ok: true; data: { email: string; password: string } }
  | { ok: false; email: string; errors: AuthFieldErrors };

export function parseAuthCredentials(mode: AuthMode, form: FormData): ParsedAuthCredentials {
  const email = String(form.get('email') ?? '').trim();
  const password = form.get('password');
  const schema = z.object({
    email: z.email().max(254),
    password: z
      .string()
      .min(mode === 'signup' ? 8 : 1)
      .max(128),
  });

  const parsed = schema.safeParse({ email, password });
  if (!parsed.success) {
    const errors: AuthFieldErrors = {};
    for (const issue of parsed.error.issues) {
      if (issue.path[0] === 'email') errors.email = 'emailInvalid';
      if (issue.path[0] === 'password') errors.password = 'passwordInvalid';
    }
    return { ok: false, email, errors };
  }

  return { ok: true, data: parsed.data };
}

export function mapAuthSignUpError(error: { status?: number }): AuthMessage {
  return error.status === 429 ? 'rateLimited' : 'signupFailed';
}

export function mapAuthSignInError(error: { code?: string; status?: number }): AuthMessage {
  if (error.code === 'email_not_confirmed') return 'confirmFirst';
  if (error.status === 429) return 'rateLimited';
  return 'signinFailed';
}
