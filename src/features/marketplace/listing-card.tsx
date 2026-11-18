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
          <span className="condition">{t(listing.condition)}</span>
          <span>{t('sale')}</span>
        </div>

        <h3>
          <Link href={`/demo/equipment/${listing.id}`}>
            <bdi>{listing.name}</bdi>
          </Link>
        </h3>

        <p className="price">
          {t('price', { amount: formatAmount(listing.price, locale) })}
        </p>

        <p className="location">
          <MapPin size={15} aria-hidden />
          {t('location')}
        </p>

        <Link href="/demo/sellers/omar_padel" className="seller-link">
          <span className="avatar small" aria-hidden>
            O
          </span>
          {t('seller')}
        </Link>
      </div>
    </article>
  );
}
