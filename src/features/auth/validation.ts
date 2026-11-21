import { z } from 'zod';
import type {
  AuthBannerNotice,
  AuthFieldErrors,
  AuthMessage,
  AuthMode,
  ResetPasswordFieldErrors,
  ResetPasswordMessage,
} from './types';

export type ParsedAuthCredentials =
  | { ok: true; data: { email: string; password: string } }
  | { ok: false; email: string; errors: AuthFieldErrors };

export type ParsedForgotPasswordInput =
  | { ok: true; email: string }
  | { ok: false; email: string; errors: { email: 'emailInvalid' } };

export type ParsedResetPasswordInput =
  | { ok: true; password: string }
  | { ok: false; errors: ResetPasswordFieldErrors };

export type CallbackTokenParams = {
  tokenHash: string;
  type: 'signup' | 'email' | 'recovery';
};

const MAX_AUTH_PARAM_LENGTH = 2048;

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

export function parseForgotPasswordEmail(form: FormData): ParsedForgotPasswordInput {
  const email = String(form.get('email') ?? '').trim();
  const parsed = z.email().max(254).safeParse(email);
  if (!parsed.success) {
    return { ok: false, email, errors: { email: 'emailInvalid' } };
  }
  return { ok: true, email: parsed.data };
}

export function parseResetPasswordInput(form: FormData): ParsedResetPasswordInput {
  const password = form.get('password');
  const confirmPassword = form.get('confirmPassword');
  const errors: ResetPasswordFieldErrors = {};

  const parsedPassword = z.string().min(8).max(128).safeParse(password);
  if (!parsedPassword.success) {
    errors.password = 'passwordInvalid';
  }
  if (typeof confirmPassword !== 'string' || confirmPassword !== password) {
    errors.confirmPassword = 'passwordMismatch';
  }

  if (errors.password || errors.confirmPassword || !parsedPassword.success) {
    return { ok: false, errors };
  }

  return { ok: true, password: parsedPassword.data };
}

export function mapAuthSignUpError(error: { status?: number }): AuthMessage {
  return error.status === 429 ? 'rateLimited' : 'signupFailed';
}

export function mapAuthSignInError(error: { code?: string; status?: number }): AuthMessage {
  if (error.code === 'email_not_confirmed') return 'confirmFirst';
  if (error.status === 429) return 'rateLimited';
  return 'signinFailed';
}

export function mapResetPasswordError(error: {
  code?: string;
  status?: number;
}): ResetPasswordMessage {
  if (error.status === 429) return 'rateLimited';
  if (error.code === 'insufficient_aal') return 'mfaRequiredForReset';
  if (error.code === 'same_password') return 'passwordSame';
  if (error.code === 'weak_password') return 'passwordWeak';
  return 'resetFailed';
}

export function parseAuthBannerNotice(params: {
  error?: string;
  reset?: string;
}): AuthBannerNotice | null {
  if (params.error) {
    if (params.error === 'oauth_cancelled') {
      return { kind: 'alert', message: 'oauthCancelled' };
    }
    if (params.error === 'oauth') {
      return { kind: 'alert', message: 'oauthFailed' };
    }
    return { kind: 'alert', message: 'callbackFailed' };
  }
  if (params.reset === '1') {
    return { kind: 'status', message: 'passwordUpdated' };
  }
  return null;
}

export function mapOAuthCallbackErrorParam(errorParam: string | null): 'oauth_cancelled' | 'oauth' {
  return errorParam === 'access_denied' ? 'oauth_cancelled' : 'oauth';
}

export function parseCallbackCode(searchParams: URLSearchParams): string | null {
  const code = searchParams.get('code')?.trim() ?? '';
  if (!code || code.length >= MAX_AUTH_PARAM_LENGTH) return null;
  return code;
}

export function parseCallbackTokenParams(
  searchParams: URLSearchParams,
): CallbackTokenParams | null {
  const tokenHash = searchParams.get('token_hash')?.trim() ?? '';
  const type = searchParams.get('type')?.trim() ?? '';
  if (!tokenHash || tokenHash.length >= MAX_AUTH_PARAM_LENGTH) return null;
  if (type !== 'signup' && type !== 'email' && type !== 'recovery') return null;
  return { tokenHash, type };
}

export function hasRecoveryAmr(
  methods: ReadonlyArray<string | { method?: string; timestamp?: number }> | null | undefined,
): boolean {
  if (!methods || methods.length === 0) return false;
  return methods.some((entry) => {
    const method = typeof entry === 'string' ? entry : entry?.method;
    return method === 'otp' || method === 'recovery';
  });
}

export function isTrustedOAuthRedirectUrl(
  rawUrl: string | null | undefined,
  expectedSupabaseOrigin: string,
): boolean {
  if (!rawUrl) return false;
  try {
    const parsed = new URL(rawUrl);
    const expected = new URL(expectedSupabaseOrigin);
    if (parsed.origin !== expected.origin) return false;
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    return parsed.pathname.startsWith('/auth/v1/authorize');
  } catch {
    return false;
  }
}
