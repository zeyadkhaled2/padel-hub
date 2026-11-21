import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

export async function accountMetadata(
  locale: string,
  key: 'signin' | 'signup' | 'forgotPassword' | 'resetPassword' | 'title',
): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'account' });
  return {
    title: `${t(key)} — PadelHub`,
    description: t('authIntro'),
    robots: { index: false, follow: false },
  };
}
