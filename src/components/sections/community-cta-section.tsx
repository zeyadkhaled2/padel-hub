import { getTranslations } from 'next-intl/server';
import { ArrowUpRight, HeartHandshake } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export async function CommunityCtaSection() {
  const t = await getTranslations('market');

  return (
    <aside className="my-12 md:my-16">
      <Card className="relative flex flex-col items-start justify-between gap-5 overflow-hidden rounded-[20px] p-6 sm:p-8 md:flex-row md:items-center">
        <div className="flex items-start gap-4 sm:items-center">
          <span
            className="grid h-12 w-12 shrink-0 place-items-center rounded-[13px] bg-gold-soft text-foreground dark:text-court-gold"
            aria-hidden="true"
          >
            <HeartHandshake size={22} />
          </span>
          <div>
            <h2 className="font-display text-[20px] sm:text-[22px] font-extrabold tracking-[-0.02em] text-foreground">
              {t('tipTitle')}
            </h2>
            <p className="mt-1 text-[14px] sm:text-[15px] leading-[1.58] text-muted-foreground">
              {t('tip')}
            </p>
          </div>
        </div>

        <Button asChild className="text-[13.5px]">
          <Link href="/about">
            <span>{t('learn')}</span>
            <ArrowUpRight
              size={16}
              className="rtl:-scale-x-100"
              aria-hidden="true"
            />
          </Link>
        </Button>
      </Card>
    </aside>
  );
}
