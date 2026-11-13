import { getTranslations, getLocale } from 'next-intl/server';
import { MapPin } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { EquipmentArt } from './equipment-art';
import type { DemoListing } from './demo-data';

export async function ListingCard({ listing }: { listing: DemoListing }) {
  const t = await getTranslations('market');
  const locale = await getLocale();
  return <article className="listing-card">
    <EquipmentArt listing={listing} label={t('illustration')} />
    <div className="listing-content"><div className="card-topline"><span className="condition">{t(listing.condition)}</span><span>{t('sale')}</span></div>
      <h3><Link href={`/equipment/${listing.id}`}><bdi>{listing.name}</bdi></Link></h3>
      <p className="price">{t('price', { amount: new Intl.NumberFormat(locale).format(listing.price) })}</p>
      <p className="location"><MapPin size={15} aria-hidden />{t('location')}</p>
      <Link href="/sellers/omar_padel" className="seller-link"><span className="avatar small" aria-hidden>O</span>{t('seller')}</Link>
    </div>
  </article>;
}
