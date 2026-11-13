import { notFound } from 'next/navigation';
import { getTranslations, getLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { demoListings } from '@/features/marketplace/demo-data';
import { EquipmentArt } from '@/features/marketplace/equipment-art';

export default async function EquipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listing = demoListings.find(item => item.id === id);
  if (!listing) notFound();
  const t = await getTranslations('market');
  const locale = await getLocale();
  return <main id="main" className="container detail-page"><Link href="/" className="text-link">{t('back')}</Link><div className="detail-grid"><figure><EquipmentArt listing={listing} label={t('illustration')} /><figcaption>{t('illustration')}</figcaption></figure><section><p className="eyebrow">{t('demo')}</p><span className="condition">{t(listing.condition)} · {t('sale')}</span><h1><bdi>{listing.name}</bdi></h1><p>{t('location')}</p><p className="price">{t('price', { amount: new Intl.NumberFormat(locale).format(listing.price) })}</p><div className="disclosure"><h2>{t('disclosure')}</h2><p>{t(listing.condition === 'new' ? 'newDisclosure' : 'usedDisclosure')}</p></div><Link href="/sellers/omar_padel" className="seller-link"><span className="avatar">O</span><span>{t('seller')}<small>{t('profile')}</small></span></Link><p className="notice">{t('contact')}</p></section></div></main>;
}
