import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { BrandLogo } from './brand-logo';
import { Preferences } from './preferences';

export async function SiteHeader() {
  const t = await getTranslations('shell');

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link className="brand-link" href="/" aria-label={t('brandName')}>
          <BrandLogo decorative />
        </Link>

        <nav className="site-nav" aria-label={t('navigation')}>
          <Link href="/">{t('explore')}</Link>
          <Link href="/about">{t('how')}</Link>
          <Link href="/account" prefetch={false}>
            {t('account')}
          </Link>
        </nav>

        <div className="header-actions">
          <Link
            href="/account/listings"
            prefetch={false}
            className="button secondary header-sell-link"
          >
            {t('sell')}
          </Link>
          <Suspense>
            <Preferences />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
