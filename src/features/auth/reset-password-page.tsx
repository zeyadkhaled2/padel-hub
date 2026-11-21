import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { RecoveryMfaForm, ResetPasswordForm } from './reset-password-form';
import { getRecoverySessionState } from './server';

export async function ResetPasswordPage({
  invalidLink = false,
}: {
  invalidLink?: boolean;
}) {
  const t = await getTranslations('account');
  const recovery = await getRecoverySessionState();

  return (
    <main id="main" className="container account-page auth-page">
      <h1>{t('resetPassword')}</h1>
      <p className="account-intro">{t('resetPasswordIntro')}</p>

      {recovery.status === 'unavailable' ? (
        <p role="status" className="form-notice">
          {t('unavailable')}
        </p>
      ) : recovery.status === 'ready' ? (
        <ResetPasswordForm />
      ) : recovery.status === 'mfa_required' ? (
        <RecoveryMfaForm />
      ) : (
        <>
          <p role="alert" className="form-notice">
            {t(invalidLink ? 'recoveryLinkInvalid' : 'recoverySessionMissing')}
          </p>
          <p className="account-switch">
            <Link href="/auth/forgot-password">{t('requestNewReset')}</Link>
          </p>
          <p className="account-switch">
            <Link href="/auth/signin">{t('backToSignIn')}</Link>
          </p>
        </>
      )}
    </main>
  );
}
