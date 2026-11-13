import type { Metadata } from 'next';
import { Suspense } from 'react';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { Link } from '@/i18n/navigation';
import { ThemeProvider } from '@/components/theme-provider';
import { Preferences } from '@/components/preferences';
import { Brand } from '@/components/brand';
import '../globals.css';

export const metadata: Metadata = { title: 'PadelHub — Find your next game', description: 'PadelHub local design preview. Demo equipment, not live inventory.', robots: { index: false, follow: false } };
export function generateStaticParams() { return routing.locales.map(locale => ({ locale })); }

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations('shell');
  return <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} suppressHydrationWarning>
    <body><NextIntlClientProvider><ThemeProvider>
      <a className="skip-link" href="#main">{t('skip')}</a>
      <header className="site-header"><div className="container header-inner">
        <Link className="brand-link" href="/" aria-label="PadelHub"><Brand /></Link>
        <nav aria-label={t('navigation')}><Link href="/">{t('explore')}</Link><Link href="/about">{t('how')}</Link></nav>
        <Suspense><Preferences /></Suspense>
      </div></header>
      {children}
      <footer className="container site-footer"><Brand /><p>{t('demo')}</p><span>{t('made')}</span></footer>
    </ThemeProvider></NextIntlClientProvider></body>
  </html>;
}
