import { getTranslations } from 'next-intl/server';
import { ArrowLeft, MapPin } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { demoListings } from './demo-data';
import { ListingCard } from './listing-card';

export async function SellerProfileView() {
  const t = await getTranslations('market');

  return (
    <main id="main" className="container storefront-page">
      <div className="detail-breadcrumb">
        <Link href="/demo" className="detail-back-link">
          <ArrowLeft size={16} className="icon-directional" aria-hidden />
          <span>{t('back')}</span>
        </Link>
        <span className="demo-inline-note">{t('demo')}</span>
      </div>

      <header className="storefront-header">
        <div className="storefront-identity">
          <span className="avatar storefront-avatar" aria-hidden>
            O
          </span>

          <div className="storefront-copy">
            <div className="storefront-eyebrow-row">
              <span className="storefront-handle">
                <bdi>@omar_padel</bdi>
              </span>
              <span className="condition">{t('individual')}</span>
            </div>

            <h1>{t('seller')}</h1>

            <div className="storefront-meta-row">
              <span className="storefront-meta-item">
                <MapPin size={15} aria-hidden />
                <span>{t('location')}</span>
              </span>
            </div>

            <p className="storefront-bio">{t('bio')}</p>
          </div>
        </div>
      </header>

      <section className="storefront-listings" aria-labelledby="demo-seller-listings-heading">
        <div className="section-heading">
          <div>
            <h2 id="demo-seller-listings-heading">{t('heading')}</h2>
          </div>
          <span className="result-count">
            {t('count', { count: demoListings.length })}
          </span>
        </div>

        <div className="listing-grid">
          {demoListings.map((listing) => (
            <ListingCard listing={listing} key={listing.id} />
          ))}
        </div>
      </section>
    </main>
  );
}
