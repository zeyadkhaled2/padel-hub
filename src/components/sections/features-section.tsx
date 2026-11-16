import { getTranslations } from 'next-intl/server';
import { ShieldCheck, MessageCircle, QrCode } from 'lucide-react';

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
      className="features-section"
      aria-labelledby="features-heading"
    >
      <div className="features-split">
        <div className="features-lead">
          <h2 id="features-heading">{t('title')}</h2>
          <p className="features-lead-copy">{t('subtitle')}</p>
        </div>

        <div className="features-list">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.key} className="feature-row">
                <span className="feature-icon" aria-hidden>
                  <Icon size={20} />
                </span>
                <div className="feature-row-body">
                  <div className="feature-row-head">
                    <h3>{item.title}</h3>
                    <span className="condition">{item.badge}</span>
                  </div>
                  <p>{item.body}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
