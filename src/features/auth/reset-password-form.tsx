'use client';

import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  cancelRecovery,
  updateRecoveredPassword,
  verifyRecoveryMfa,
} from './actions';
import { AuthNotice, AuthSpinner } from './auth-notice';

export function RecoveryMfaForm() {
  const t = useTranslations('account');
  const locale = useLocale();
  const [state, action, pending] = useActionState(verifyRecoveryMfa.bind(null, locale), {});

  return (
    <>
      <form action={action} className="account-form">
        <p className="field-hint">{t('recoveryMfaIntro')}</p>
        <label htmlFor="recovery-mfa-code">{t('mfaCode')}</label>
        <input
          id="recovery-mfa-code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          dir="ltr"
        />
        <div aria-live="polite" aria-atomic="true">
          {state.message && (
            <AuthNotice message={state.message} role="alert">
              {t(state.message)}
            </AuthNotice>
          )}
        </div>
        <button className="button primary" disabled={pending} aria-busy={pending}>
          {pending && <AuthSpinner />}
          <span>{t(pending ? 'verifyingCode' : 'verifyMfaContinue')}</span>
        </button>
      </form>
      <form action={cancelRecovery.bind(null, locale)} className="auth-cancel-form">
        <button type="submit" className="button secondary">
          {t('cancelReset')}
        </button>
      </form>
    </>
  );
}

export function ResetPasswordForm() {
  const t = useTranslations('account');
  const locale = useLocale();
  const [state, action, pending] = useActionState(
    updateRecoveredPassword.bind(null, locale),
    {},
  );

  return (
    <>
      <form action={action} className="account-form">
        <label htmlFor="new-password">{t('newPassword')}</label>
        <input
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          aria-invalid={!!state.errors?.password}
          aria-describedby="new-password-hint"
        />
        <p id="new-password-hint" className="field-hint">
          {t(state.errors?.password ?? 'passwordHint')}
        </p>

        <label htmlFor="confirm-password">{t('confirmPassword')}</label>
        <input
          id="confirm-password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          aria-invalid={!!state.errors?.confirmPassword}
          aria-describedby={state.errors?.confirmPassword ? 'confirm-password-error' : undefined}
        />
        {state.errors?.confirmPassword && (
          <p id="confirm-password-error" className="field-error">
            {t(state.errors.confirmPassword)}
          </p>
        )}

        <div aria-live="polite" aria-atomic="true">
          {state.message && (
            <AuthNotice message={state.message} role="alert">
              {t(state.message)}
            </AuthNotice>
          )}
        </div>

        <button className="button primary" disabled={pending} aria-busy={pending}>
          {pending && <AuthSpinner />}
          <span>{t(pending ? 'updatingPassword' : 'updatePassword')}</span>
        </button>
      </form>
      <form action={cancelRecovery.bind(null, locale)} className="auth-cancel-form">
        <button type="submit" className="button secondary">
          {t('cancelReset')}
        </button>
      </form>
    </>
  );
}
