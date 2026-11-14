import { getTranslations, getLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { formatAmount } from '@/lib/format';
import { EquipmentArt } from './equipment-art';
import type { DemoListing } from './demo-data';

interface EquipmentDetailViewProps {
  listing: DemoListing;
}

export async function EquipmentDetailView({
  listing,
}: EquipmentDetailViewProps) {
  const t = await getTranslations('market');
  const locale = await getLocale();

  const disclosureCopy =
    listing.condition === 'new' ? t('newDisclosure') : t('usedDisclosure');

  return (
    <main id="main" className="container detail-page">
      <Link href="/" className="text-link">
        {t('back')}
      </Link>

      <div className="detail-grid">
        <figure>
          <EquipmentArt listing={listing} label={t('illustration')} />
          <figcaption>{t('illustration')}</figcaption>
        </figure>

        <section>
          <p className="eyebrow">{t('demo')}</p>
          <span className="condition">
            {t(listing.condition)} · {t('sale')}
          </span>

          <h1>
            <bdi>{listing.name}</bdi>
          </h1>

          <p>{t('location')}</p>

          <p className="price">
            {t('price', { amount: formatAmount(listing.price, locale) })}
          </p>

          <div className="disclosure">
            <h2>{t('disclosure')}</h2>
            <p>{disclosureCopy}</p>
          </div>

          <Link href="/sellers/omar_padel" className="seller-link">
            <span className="avatar">O</span>
            <span>
              {t('seller')}
              <small>{t('profile')}</small>
            </span>
          </Link>

          <p className="notice">{t('contact')}</p>
        </section>
      </div>
    </main>
  );
}
