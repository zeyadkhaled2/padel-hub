'use client';

import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { requestPasswordReset } from './actions';

export function ForgotPasswordForm() {
  const t = useTranslations('account');
  const locale = useLocale();
  const [state, action, pending] = useActionState(
    requestPasswordReset.bind(null, locale),
    {},
  );

  return (
    <>
      <form action={action} className="account-form">
        <label htmlFor="reset-email">{t('email')}</label>
        <input
          id="reset-email"
          name="email"
          type="email"
          dir="ltr"
          autoComplete="email"
          required
          maxLength={254}
          defaultValue={state.email}
          aria-invalid={!!state.errors?.email}
          aria-describedby={state.errors?.email ? 'reset-email-error' : undefined}
        />
        {state.errors?.email && (
          <p id="reset-email-error" className="field-error">
            {t(state.errors.email)}
          </p>
        )}
        <div aria-live="polite" aria-atomic="true">
          {state.message && (
            <p className="form-notice" role="status">
              {t(state.message)}
            </p>
          )}
        </div>
        <button className="button primary" disabled={pending}>
          {t(pending ? 'sendingReset' : 'sendResetLink')}
        </button>
      </form>
      <p className="account-switch">
        <Link href="/auth/signin">{t('backToSignIn')}</Link>
      </p>
    </>
  );
}
