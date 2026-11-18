import { getTranslations } from 'next-intl/server';
import { MessageCircle, QrCode, ShieldCheck } from 'lucide-react';

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
      className="my-12 md:my-20"
      aria-labelledby="features-heading"
    >
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.22fr)] lg:gap-12">
        <div className="lg:sticky lg:top-24">
          <h2
            id="features-heading"
            className="font-display text-[clamp(1.55rem,2.8vw,2.15rem)] font-extrabold leading-[1.14] tracking-[-0.025em] text-ink"
          >
            {t('title')}
          </h2>
          <p className="mt-3 max-w-[440px] text-[15px] sm:text-[16px] leading-[1.6] text-muted">
            {t('subtitle')}
          </p>
        </div>

        <div className="divide-y divide-line border-y border-line">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <article
                key={item.key}
                className="flex items-start gap-4 py-6 sm:gap-5 sm:py-7"
              >
                <span
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-surface-soft text-accent"
                  aria-hidden="true"
                >
                  <Icon size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-display text-[18px] sm:text-[19.5px] font-bold text-ink">
                      {item.title}
                    </h3>
                    <span className="rounded-[7px] bg-surface-soft px-2.5 py-1 text-[11.5px] font-bold text-accent">
                      {item.badge}
                    </span>
                  </div>
                  <p className="mt-2 text-[14.5px] sm:text-[15px] leading-[1.6] text-muted">
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
