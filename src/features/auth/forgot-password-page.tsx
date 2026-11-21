import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { authConfig } from '@/server/supabase/config';
import { verifiedClient } from '@/server/supabase/server';
import { ForgotPasswordForm } from './forgot-password-form';
import { localeValue } from './types';

export async function ForgotPasswordPage({ locale }: { locale: string }) {
  const t = await getTranslations('account');
  if (await verifiedClient()) redirect(`/${localeValue(locale)}/account`);

  return (
    <main id="main" className="container account-page auth-page">
      <h1>{t('forgotPassword')}</h1>
      <p className="account-intro">{t('forgotPasswordIntro')}</p>
      {authConfig() ? (
        <ForgotPasswordForm />
      ) : (
        <p role="status" className="form-notice">
          {t('unavailable')}
        </p>
      )}
    </main>
  );
}
