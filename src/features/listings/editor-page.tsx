import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { verifiedClient } from '@/server/supabase/server';
import { Link } from '@/i18n/navigation';
import { ListingForm } from './listing-form';

export default async function EditorPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const client = await verifiedClient();
  if (!client) redirect(`/${locale}/auth/signin`);
  const { data, error } = await client.rpc('get_my_listing', { p_listing_id: id });
  const t = await getTranslations('listingEditor');
  if (error) return <main id="main" className="container account-page"><p role="alert">{t('unavailable')}</p></main>;
  if (!data) notFound();
  return <main id="main" className="container account-page"><Link href="/account/listings">{t('myListings')}</Link><h1>{t('heading')}</h1><p className="account-intro">{t('intro')}</p><ListingForm initial={data} /></main>;
}
