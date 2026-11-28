import { getTranslations } from 'next-intl/server';
import { BrandLogo } from '@/components/layout/brand-logo';
import { Link } from '@/i18n/navigation';
import { AuthNotice } from './auth-notice';
import { RecoveryMfaForm, ResetPasswordForm } from './reset-password-form';
import { getRecoverySessionState } from './server';

export async function ResetPasswordPage({
  invalidLink = false,
}: {
  invalidLink?: boolean;
}) {
  const t = await getTranslations('account');
  const recovery = await getRecoverySessionState();
  const missingMessage = invalidLink ? 'recoveryLinkInvalid' : 'recoverySessionMissing';

  return (
    <main id="main" className="container account-page auth-page">
      <div className="auth-brand-badge" aria-hidden="true">
        <BrandLogo variant="icon" decorative />
      </div>
      <h1>{t('resetPassword')}</h1>
      <p className="account-intro">{t('resetPasswordIntro')}</p>

      {recovery.status === 'unavailable' ? (
        <AuthNotice message="unavailable" role="status">
          {t('unavailable')}
        </AuthNotice>
      ) : recovery.status === 'ready' ? (
        <ResetPasswordForm />
      ) : recovery.status === 'mfa_required' ? (
        <RecoveryMfaForm />
      ) : (
        <>
          <AuthNotice message={missingMessage} role="alert">
            {t(missingMessage)}
          </AuthNotice>
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
