import { getTranslations } from 'next-intl/server';
import { MapPin, CheckCircle2 } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { demoListings } from '@/features/marketplace/demo-data';
import { EquipmentArt } from '@/features/marketplace/equipment-art';

export async function HeroSection() {
  const t = await getTranslations('market');

  return (
    <section className="hero">
      <div className="hero-copy">
        <div className="hero-badge">
          <MapPin size={14} aria-hidden />
          <span>{t('badge')}</span>
        </div>

        <h1>{t('title')}</h1>

        <p className="hero-intro">{t('intro')}</p>

        <div className="hero-actions">
          <a href="#equipment-heading" className="button primary">
            {t('heroBrowseCta')}
          </a>
          <Link
            href="/account/listings"
            prefetch={false}
            className="button secondary"
          >
            {t('heroSellCta')}
          </Link>
        </div>

        <ul className="hero-highlights" aria-label={t('badge')}>
          <li>
            <CheckCircle2 size={15} aria-hidden />
            <span>{t('heroHighlight1')}</span>
          </li>
          <li>
            <CheckCircle2 size={15} aria-hidden />
            <span>{t('heroHighlight2')}</span>
          </li>
          <li>
            <CheckCircle2 size={15} aria-hidden />
            <span>{t('heroHighlight3')}</span>
          </li>
        </ul>
      </div>

      <figure className="hero-equipment">
        <EquipmentArt
          listing={demoListings[0]}
          label={t('illustration')}
          hero
        />
        <figcaption>{t('courtCaption')}</figcaption>
      </figure>
    </section>
  );
}
