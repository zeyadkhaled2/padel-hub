import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Brand } from './brand';

export async function SiteFooter() {
  const t = await getTranslations('shell');

  return (
    <footer className="mt-8 border-t border-border bg-card">
      <div className="container flex flex-col gap-8 py-10 md:flex-row md:items-start md:justify-between md:py-12">
        <div className="max-w-[440px]">
          <Brand compact />
          <p className="mt-3 text-[13.5px] leading-[1.65] text-muted-foreground">
            {t('footerTagline')}
          </p>
        </div>

        <div className="flex flex-col gap-2 text-start md:items-end md:text-end">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <Link
              href="/"
              className="inline-flex min-h-[40px] items-center text-[13.5px] font-semibold text-foreground transition-colors hover:text-brand"
            >
              {t('explore')}
            </Link>
            <Link
              href="/about"
              className="inline-flex min-h-[40px] items-center text-[13.5px] font-semibold text-foreground transition-colors hover:text-brand"
            >
              {t('how')}
            </Link>
          </div>
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            {t('demo')}
          </p>
          <span className="text-[13px] font-semibold text-foreground">
            {t('made')}
          </span>
        </div>
      </div>
    </footer>
  );
}
