import { getTranslations } from 'next-intl/server';
import { MessageCircle, QrCode, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export async function FeaturesSection() {
  const t = await getTranslations('marketing.features');

  const items = [
    {
      key: 'card1',
      icon: ShieldCheck,
      badge: t('card1Badge'),
      title: t('card1Title'),
      body: t('card1Body'),
    },
    {
      key: 'card2',
      icon: MessageCircle,
      badge: t('card2Badge'),
      title: t('card2Title'),
      body: t('card2Body'),
    },
    {
      key: 'card3',
      icon: QrCode,
      badge: t('card3Badge'),
      title: t('card3Title'),
      body: t('card3Body'),
    },
  ] as const;

  return (
    <section
      id="why-padelhub"
      className="my-10 border-t border-border pt-10 md:my-14 md:pt-14"
      aria-labelledby="features-heading"
    >
      <div className="grid grid-cols-1 items-start gap-7 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.24fr)] lg:gap-12">
        <div className="lg:sticky lg:top-24">
          <h2
            id="features-heading"
            className="font-display text-[clamp(1.45rem,2.6vw,2rem)] font-extrabold leading-[1.14] tracking-[-0.025em] text-foreground"
          >
            {t('title')}
          </h2>
          <p className="mt-2.5 max-w-[420px] text-[14.5px] sm:text-[15px] leading-[1.6] text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>

        <div className="divide-y divide-border border-y border-border">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <article
                key={item.key}
                className="flex items-start gap-4 py-5 sm:gap-5 sm:py-6"
              >
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-[8px] border border-border bg-muted text-brand"
                  aria-hidden="true"
                >
                  <Icon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-display text-[17px] sm:text-[18px] font-bold text-foreground">
                      {item.title}
                    </h3>
                    <Badge variant="secondary">{item.badge}</Badge>
                  </div>
                  <p className="mt-1.5 text-[14px] sm:text-[14.5px] leading-[1.6] text-muted-foreground">
                    {item.body}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
