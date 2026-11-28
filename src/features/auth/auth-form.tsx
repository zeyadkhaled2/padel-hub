'use client';

import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { authenticate } from './actions';
import { AuthNotice, AuthSpinner } from './auth-notice';
import { GoogleAuthButton } from './google-auth-button';
import type { AuthBannerNotice } from './types';

export function AuthForm({
  mode,
  bannerNotice = null,
  googleEnabled = false,
}: {
  mode: 'signin' | 'signup';
  bannerNotice?: AuthBannerNotice | null;
  googleEnabled?: boolean;
}) {
  const t = useTranslations('account');
  const locale = useLocale();
  const [state, action, pending] = useActionState(authenticate.bind(null, locale, mode), {});
  const pendingKey = mode === 'signin' ? 'signingIn' : 'creatingAccount';
  const showBanner = Boolean(bannerNotice && !state.message && !state.errors);
  return (
    <>
      {showBanner && bannerNotice && (
        <AuthNotice message={bannerNotice.message} role={bannerNotice.kind}>
          {t(bannerNotice.message)}
        </AuthNotice>
      )}
      {googleEnabled && <GoogleAuthButton />}
      <form action={action} className="account-form">
        <label htmlFor="email">{t('email')}</label>
        <input
          id="email"
          name="email"
          type="email"
          dir="ltr"
          autoComplete="email"
          required
          maxLength={254}
          defaultValue={state.email}
          aria-invalid={!!state.errors?.email}
          aria-describedby={state.errors?.email ? 'email-error' : undefined}
        />
        {state.errors?.email && (
          <p id="email-error" className="field-error">
            {t(state.errors.email)}
          </p>
        )}
        <label htmlFor="password">{t('password')}</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          required
          minLength={mode === 'signup' ? 8 : 1}
          maxLength={128}
          aria-invalid={!!state.errors?.password}
          aria-describedby="password-hint"
        />
        <p id="password-hint" className="field-hint">
          {t(state.errors?.password ?? 'passwordHint')}
        </p>
        {mode === 'signin' && (
          <p className="auth-inline-link">
            <Link href="/auth/forgot-password">{t('forgotPasswordLink')}</Link>
          </p>
        )}
        <div aria-live="polite" aria-atomic="true">
          {state.message && (
            <AuthNotice message={state.message}>{t(state.message)}</AuthNotice>
          )}
        </div>
        <button className="button primary" disabled={pending} aria-busy={pending}>
          {pending && <AuthSpinner />}
          <span>{t(pending ? pendingKey : mode)}</span>
        </button>
        {mode === 'signup' && (
          <p className="field-hint auth-legal-hint">
            {t('legalAgreementPrefix')}{' '}
            <Link href="/terms">{t('termsLink')}</Link> ·{' '}
            <Link href="/privacy">{t('privacyLink')}</Link>
          </p>
        )}
      </form>
      <p className="account-switch">
        <Link href={`/auth/${mode === 'signin' ? 'signup' : 'signin'}`}>
          {t(mode === 'signin' ? 'newAccount' : 'haveAccount')}
        </Link>
      </p>
    </>
  );
}
