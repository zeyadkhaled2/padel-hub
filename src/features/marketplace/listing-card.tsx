import { getTranslations, getLocale } from 'next-intl/server';
import { MapPin } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { formatAmount } from '@/lib/format';
import { EquipmentArt } from './equipment-art';
import type { DemoListing } from './demo-data';

interface ListingCardProps {
  listing: DemoListing;
}

export async function ListingCard({ listing }: ListingCardProps) {
  const t = await getTranslations('market');
  const locale = await getLocale();

  return (
    <article className="listing-card">
      <div className="listing-visual">
        <EquipmentArt listing={listing} label={t('illustration')} />
      </div>

      <div className="listing-content">
        <div className="card-topline">
          <div className="card-tags">
            <span className={`condition is-${listing.condition.toLowerCase()}`}>
              {t(listing.condition)}
            </span>
            <span className="card-meta-tag">{t(listing.category)}</span>
          </div>
          <span className="card-offer-tag">{t('sale')}</span>
        </div>

        <h3>
          <Link href={`/demo/equipment/${listing.id}`}>
            <bdi>{listing.name}</bdi>
          </Link>
        </h3>

        <div className="card-price-row">
          <p className="price">
            {t('price', { amount: formatAmount(listing.price, locale) })}
          </p>
        </div>

        <div className="card-footer">
          <p className="location">
            <MapPin size={14} aria-hidden />
            <span>{t('location')}</span>
          </p>

          <Link href="/demo/sellers/omar_padel" className="seller-link">
            <span className="avatar small" aria-hidden>
              O
            </span>
            <span className="seller-name">{t('seller')}</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
