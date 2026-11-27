import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { BrandLogo } from '@/components/layout/brand-logo';
import { authConfig } from '@/server/supabase/config';
import { verifiedClient } from '@/server/supabase/server';
import { AuthForm } from './auth-form';
import { readAuthProviderSettings } from './server';
import { localeValue, type AuthBannerNotice } from './types';

export async function AuthPage({
  locale,
  mode,
  bannerNotice = null,
}: {
  locale: string;
  mode: 'signin' | 'signup';
  bannerNotice?: AuthBannerNotice | null;
}) {
  const t = await getTranslations('account');
  if (await verifiedClient()) redirect(`/${localeValue(locale)}/account`);
  const config = authConfig();
  const providerSettings = config
    ? await readAuthProviderSettings(config.url, config.key)
    : null;
  const googleEnabled = providerSettings?.googleEnabled === true;
  return (
    <main id="main" className="container account-page auth-page">
      <div className="auth-brand-badge" aria-hidden="true">
        <BrandLogo variant="icon" decorative />
      </div>
      <h1>{t(mode)}</h1>
      <p className="account-intro">{t('authIntro')}</p>
      {config ? (
        <AuthForm
          mode={mode}
          bannerNotice={bannerNotice}
          googleEnabled={googleEnabled}
        />
      ) : (
        <p role="status" className="form-notice">
          {t('unavailable')}
        </p>
      )}
    </main>
  );
}
