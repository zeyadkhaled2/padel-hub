import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Cairo, Outfit, Plus_Jakarta_Sans } from 'next/font/google';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import '../globals.css';

const displayFont = Outfit({
  subsets: ['latin'],
  variable: '--font-display-latin',
  display: 'swap',
});

const bodyFont = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-body-latin',
  display: 'swap',
});

const arabicFont = Cairo({
  subsets: ['arabic', 'latin'],
  variable: '--font-arabic',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'PadelHub — Find your next game',
  description:
    'PadelHub local design preview. Demo equipment, not live inventory.',
  robots: { index: false, follow: false },
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const t = await getTranslations('shell');

  return (
    <html
      lang={locale}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      className={`${displayFont.variable} ${bodyFont.variable} ${arabicFont.variable}`}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col">
        <NextIntlClientProvider>
          <ThemeProvider>
            <a className="skip-link" href="#main">
              {t('skip')}
            </a>
            <SiteHeader />
            <div className="flex-1">{children}</div>
            <SiteFooter />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
