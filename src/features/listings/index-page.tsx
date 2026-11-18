import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { verifiedClient } from '@/server/supabase/server';
import { Link } from '@/i18n/navigation';
import { createListing } from './actions';
import type { Listing } from './types';

export default async function ListingIndex({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const client = await verifiedClient();
  if (!client) redirect(`/${locale}/auth/signin`);
  const t = await getTranslations('listingEditor');
  const photos = await getTranslations('photos');
  const { data, error } = await client.rpc('get_my_listings');
  return <main id="main" className="container account-page"><Link href="/account">{t('account')}</Link><h1>{t('myListings')}</h1>
    <form action={createListing.bind(null, locale)} className="account-form"><label htmlFor="category">{photos('category')}</label><select id="category" name="category"><option value="rackets">{photos('rackets')}</option><option value="balls">{photos('balls')}</option></select><button className="button primary">{t('create')}</button></form>
    {error ? <p role="alert">{t('unavailable')}</p> : <ul>{(data as Listing[] ?? []).map((item, index) => <li key={item.id}><Link href={`/account/listings/${item.id}`}>{item.title || `${photos(item.category)} · ${index + 1}`}</Link> — {t(item.status)}</li>)}</ul>}
    {!error && data?.length === 0 && <p>{t('empty')}</p>}
  </main>;
}
