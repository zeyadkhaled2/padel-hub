/* eslint-disable @next/next/no-img-element -- Authorization-checked photos bypass the shared optimizer. */
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { formatAmount } from '@/lib/format';
import type { PublicListing } from './public-data';

export async function PublicCard({ listing }: { listing: PublicListing }) {
  const t = await getTranslations('market');
  const e = await getTranslations('listingEditor');
  const a = await getTranslations('account');
  const locale = await getLocale();
  return <article className="listing-card">
    <Link href={`/equipment/${listing.id}`} prefetch={false} className="listing-visual public-photo"><img src={`/api/media/${listing.media_ids[0]}?listing=${listing.id}&variant=card`} alt={listing.title} width={640} height={480} loading="lazy" /></Link>
    <div className="listing-content"><div className="card-topline"><span className="condition">{e(listing.condition)}</span><span>{e(listing.offer_type)}</span></div>
      <h3><Link href={`/equipment/${listing.id}`} prefetch={false}><bdi>{listing.title}</bdi></Link></h3>
      <p className="price">{listing.price_egp === null ? e('swap') : t('price', { amount: formatAmount(listing.price_egp, locale) })}</p>
      <p>{a(`governorates.${listing.governorate_slug}`)}</p><p><bdi>{listing.seller.display_name}</bdi></p>
    </div></article>;
}
