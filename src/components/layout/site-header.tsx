import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Brand } from './brand';
import { HeaderNav } from './header-nav';
import { Preferences } from './preferences';

export async function SiteHeader() {
  const t = await getTranslations('shell');

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-[var(--header)] text-foreground backdrop-blur-md">
      <div className="container flex min-h-[60px] flex-wrap items-center justify-between gap-x-6 gap-y-1 py-2 md:min-h-[64px] md:flex-nowrap md:py-0">
        <Link
          className="inline-flex min-h-[44px] items-center transition-opacity hover:opacity-90"
          href="/"
          aria-label="PadelHub"
        >
          <Brand />
        </Link>

        <HeaderNav
          ariaLabel={t('navigation')}
          exploreLabel={t('explore')}
          howLabel={t('how')}
        />

        <Suspense>
          <Preferences />
        </Suspense>
      </div>
    </header>
  );
}
