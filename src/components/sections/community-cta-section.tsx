import { getTranslations } from 'next-intl/server';
import { ArrowUpRight, HeartHandshake } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export async function CommunityCtaSection() {
  const t = await getTranslations('market');

  return (
    <aside className="my-10 md:my-14">
      <div className="hero-billboard relative flex flex-col items-start justify-between gap-5 overflow-hidden rounded-[12px] border border-white/10 dark:border-border p-6 sm:p-8 text-white md:flex-row md:items-center">
        <div className="flex items-start gap-4 sm:items-center">
          <span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-[8px] border border-emerald-400/25 bg-emerald-500/15 text-[#17c981]"
            aria-hidden="true"
          >
            <HeartHandshake size={20} />
          </span>
          <div>
            <h2 className="font-display text-[19px] sm:text-[21px] font-extrabold tracking-[-0.02em] text-white">
              {t('tipTitle')}
            </h2>
            <p className="mt-1 text-[13.5px] sm:text-[14.5px] leading-[1.55] text-zinc-300">
              {t('tip')}
            </p>
          </div>
        </div>

        <Button
          asChild
          className="bg-white text-[#0f0f10] hover:bg-zinc-200 text-[13.5px]"
        >
          <Link href="/about">
            <span>{t('learn')}</span>
            <ArrowUpRight
              size={16}
              className="rtl:-scale-x-100"
              aria-hidden="true"
            />
          </Link>
        </Button>
      </div>
    </aside>
  );
}
