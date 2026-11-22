/* eslint-disable @next/next/no-img-element -- Authorization-checked photos bypass the shared optimizer. */
import { getLocale, getTranslations } from 'next-intl/server';
import { MapPin } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { formatAmount } from '@/lib/format';
import type { PublicListing } from './public-data';

export async function PublicCard({ listing }: { listing: PublicListing }) {
  const t = await getTranslations('market');
  const e = await getTranslations('listingEditor');
  const a = await getTranslations('account');
  const locale = await getLocale();

  const sellerInitial =
    listing.seller.display_name.trim().charAt(0).toUpperCase() || '@';

  return (
    <article className="listing-card">
      <Link
        href={`/equipment/${listing.id}`}
        prefetch={false}
        className="listing-visual public-photo"
      >
        <img
          src={`/api/media/${listing.media_ids[0]}?listing=${listing.id}&variant=card`}
          alt={listing.title}
          width={640}
          height={480}
          loading="lazy"
        />
      </Link>

      <div className="listing-content">
        <div className="card-topline">
          <div className="card-tags">
            <span className={`condition is-${listing.condition}`}>
              {e(listing.condition)}
            </span>
            <span className="card-meta-tag">{t(listing.category)}</span>
            {listing.category === 'shoes' ? (
              <span className="card-meta-tag is-spec">
                {t('euSizeShort', { size: listing.shoe_size_eu })}
              </span>
            ) : listing.category === 'rackets' && listing.racket_weight_grams ? (
              <span className="card-meta-tag is-spec">
                {t('weightGramsShort', { weight: listing.racket_weight_grams })}
              </span>
            ) : null}
          </div>
          <span className="card-offer-tag">{e(listing.offer_type)}</span>
        </div>

        <h3>
          <Link href={`/equipment/${listing.id}`} prefetch={false}>
            <bdi>{listing.title}</bdi>
          </Link>
        </h3>

        <div className="card-price-row">
          <p className="price">
            {listing.price_egp === null
              ? e('swap')
              : t('price', { amount: formatAmount(listing.price_egp, locale) })}
          </p>
          {listing.is_negotiable && listing.price_egp !== null ? (
            <span className="card-negotiable-tag">{t('negotiable')}</span>
          ) : null}
        </div>

        <div className="card-footer">
          <p className="location">
            <MapPin size={14} aria-hidden />
            <span>{a(`governorates.${listing.governorate_slug}`)}</span>
          </p>

          <Link
            href={`/@${listing.seller.username}`}
            prefetch={false}
            className="seller-link"
          >
            <span className="avatar small" aria-hidden>
              {sellerInitial}
            </span>
            <span className="seller-name">
              <bdi>{listing.seller.display_name}</bdi>
            </span>
          </Link>
        </div>
      </div>
    </article>
  );
}
