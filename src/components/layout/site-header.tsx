import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Brand } from '@/components/brand';
import { Preferences } from '@/components/preferences';

export async function SiteHeader() {
  const t = await getTranslations('shell');

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link className="brand-link" href="/" aria-label="PadelHub">
          <Brand />
        </Link>

        <nav aria-label={t('navigation')}>
          <Link href="/">{t('explore')}</Link>
          <Link href="/about">{t('how')}</Link>
        </nav>

        <Suspense>
          <Preferences />
        </Suspense>
      </div>
    </header>
  );
}
