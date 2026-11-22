import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

export async function accountMetadata(
  locale: string,
  key: 'signin' | 'signup' | 'forgotPassword' | 'resetPassword' | 'title',
): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'account' });
  const tShell = await getTranslations({ locale, namespace: 'shell' });
  const title = `${t(key)} — ${tShell('brandName')}`;
  const description = t('authIntro');
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: tShell('brandName'),
      type: 'website',
      locale: locale === 'ar' ? 'ar_EG' : 'en_EG',
    },
    robots: { index: false, follow: false },
  };
}
