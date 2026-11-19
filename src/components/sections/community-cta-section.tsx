import { getTranslations } from 'next-intl/server';
import { ArrowUpRight, HeartHandshake } from 'lucide-react';
import { Link } from '@/i18n/navigation';

export async function CommunityCtaSection() {
  const t = await getTranslations('market');

  return (
    <aside className="relative my-12 md:my-16 flex flex-col items-start justify-between gap-5 overflow-hidden rounded-[20px] border border-line bg-surface p-6 sm:p-8 text-ink md:flex-row md:items-center">
      <div className="flex items-start gap-4 sm:items-center">
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-[13px] bg-gold-soft text-ink dark:text-hero"
          aria-hidden="true"
        >
          <HeartHandshake size={22} />
        </span>
        <div>
          <h2 className="font-display text-[20px] sm:text-[22px] font-extrabold tracking-[-0.02em] text-ink">
            {t('tipTitle')}
          </h2>
          <p className="mt-1 text-[14px] sm:text-[15px] leading-[1.58] text-muted">
            {t('tip')}
          </p>
        </div>
      </div>

      <Link
        href="/about"
        className="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-[11px] bg-action px-5 py-2.5 text-[13.5px] font-bold text-action-ink transition-colors duration-200 hover:bg-action-hover"
      >
        <span>{t('learn')}</span>
        <ArrowUpRight
          size={16}
          className="rtl:-scale-x-100"
          aria-hidden="true"
        />
      </Link>
    </aside>
  );
}
