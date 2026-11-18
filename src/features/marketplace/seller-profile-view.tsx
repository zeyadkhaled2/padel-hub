import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { demoListings } from './demo-data';
import { ListingCard } from './listing-card';

export async function SellerProfileView() {
  const t = await getTranslations('market');

  return (
    <main id="main" className="container detail-page">
      <Link href="/" className="text-link">
        {t('back')}
      </Link>

      <section className="profile-banner">
        <span className="avatar">O</span>
        <div>
          <h1>{t('seller')}</h1>
          <div className="detail-meta-row">
            <bdi>@omar_padel</bdi>
            <span className="condition">{t('individual')}</span>
            <span className="demo-inline-note">{t('demo')}</span>
          </div>
          <p>{t('bio')}</p>
          <p>{t('location')}</p>
        </div>
      </section>

      <section className="market-section">
        <h2>{t('heading')}</h2>
        <div className="grid grid-cols-1 min-[360px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3.5 md:gap-4">
          {demoListings.map((listing) => (
            <ListingCard listing={listing} key={listing.id} />
          ))}
        </div>
      </section>
    </main>
  );
}
