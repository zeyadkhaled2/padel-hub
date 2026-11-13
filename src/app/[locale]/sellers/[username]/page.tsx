import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { demoListings } from '@/features/marketplace/demo-data';
import { ListingCard } from '@/features/marketplace/listing-card';

export default async function SellerPage({ params }: { params: Promise<{ username: string }> }) {
  if ((await params).username !== 'omar_padel') notFound();
  const t = await getTranslations('market');
  return <main id="main" className="container detail-page"><Link href="/" className="text-link">{t('back')}</Link><section className="profile-banner"><span className="avatar">O</span><div><p className="eyebrow">{t('individual')} · {t('demo')}</p><h1>{t('seller')}</h1><bdi>@omar_padel</bdi><p>{t('bio')}</p><p>{t('location')}</p></div></section><section className="market-section"><h2>{t('heading')}</h2><div className="listing-grid">{demoListings.map(listing => <ListingCard listing={listing} key={listing.id} />)}</div></section></main>;
}
