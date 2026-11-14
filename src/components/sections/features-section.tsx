import { getTranslations } from 'next-intl/server';
import { ShieldCheck, MessageCircle, QrCode } from 'lucide-react';
import { SectionHeader } from '@/components/ui/section-header';

export async function FeaturesSection() {
  const t = await getTranslations('marketing.features');

  const cards = [
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
      className="features-section"
      aria-labelledby="features-heading"
    >
      <SectionHeader
        id="features-heading"
        eyebrow={t('eyebrow')}
        title={t('title')}
        subtitle={t('subtitle')}
      />

      <div className="features-grid">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article key={card.key} className="feature-card">
              <div className="feature-card-top">
                <span className="feature-icon" aria-hidden>
                  <Icon size={20} />
                </span>
                <span className="condition">{card.badge}</span>
              </div>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
