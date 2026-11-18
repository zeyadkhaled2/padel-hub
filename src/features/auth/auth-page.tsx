import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { authConfig } from '@/server/supabase/config';
import { verifiedClient } from '@/server/supabase/server';
import { AuthForm } from './auth-form';
import { localeValue } from './types';

export async function AuthPage({ locale, mode, callbackError }: { locale: string; mode: 'signin' | 'signup'; callbackError?: boolean }) {
  const t = await getTranslations('account');
  if (await verifiedClient()) redirect(`/${localeValue(locale)}/account`);
  return <main id="main" className="container account-page auth-page">
    <h1>{t(mode)}</h1><p className="account-intro">{t('authIntro')}</p>
    {authConfig() ? <AuthForm mode={mode} callbackError={callbackError} /> : <p role="status" className="form-notice">{t('unavailable')}</p>}
  </main>;
}
