'use client';

import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { continueWithGoogle } from './actions';

export function GoogleAuthButton() {
  const t = useTranslations('account');
  const locale = useLocale();
  const [state, action, pending] = useActionState(continueWithGoogle.bind(null, locale), {});

  return (
    <div className="auth-oauth-block">
      <form action={action} className="auth-oauth-form">
        <button
          type="submit"
          className="button secondary auth-google-button"
          disabled={pending}
        >
          <svg
            aria-hidden="true"
            focusable="false"
            width="18"
            height="18"
            viewBox="0 0 18 18"
          >
            <path
              fill="#4285F4"
              d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
            />
            <path
              fill="#34A853"
              d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z"
            />
            <path
              fill="#FBBC05"
              d="M3.96 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3-2.33z"
            />
            <path
              fill="#EA4335"
              d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A8.64 8.64 0 0 0 9 0 9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58z"
            />
          </svg>
          <span>{t(pending ? 'continuingWithGoogle' : 'continueWithGoogle')}</span>
        </button>
      </form>
      <div aria-live="polite" aria-atomic="true">
        {state.message && (
          <p className="form-notice" role="alert">
            {t(state.message)}
          </p>
        )}
      </div>
      <div className="auth-divider" role="separator">
        <span>{t('orEmail')}</span>
      </div>
    </div>
  );
}
