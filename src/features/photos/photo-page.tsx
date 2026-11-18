import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { verifiedClient } from '@/server/supabase/server';
import { PhotoForm } from '@/features/photos/photo-form';
import { createPhotoDraft } from '@/features/photos/actions';
import { Link } from '@/i18n/navigation';


export default async function Page({ params, searchParams }: { params: Promise<{locale: string}>; searchParams: Promise<{listing?: string; error?: string}> }) {
  const { locale } = await params;
  const query = await searchParams;
  const client = await verifiedClient();
  if (!client) redirect(`/${locale}/auth/signin`);
  const t = await getTranslations('photos');
  const editor = await getTranslations('listingEditor');
  const { data: drafts, error } = await client.rpc('get_my_photo_drafts');
  const items = (drafts ?? []) as { id: string; category: string; title: string | null; version: number }[];
  const selected = items.find(item => item.id === query.listing) ?? items[0];
  const result = selected ? await client.rpc('get_my_listing', { p_listing_id: selected.id }) : null;
  return <main id="main" className="container account-page">
    <Link href="/account">{t('back')}</Link><h1>{t('title')}</h1><p className="account-intro">{t('intro')}</p>
    {(error || result?.error || query.error) && <p role="alert" className="form-notice">{t('unavailable')}</p>}
    <form action={createPhotoDraft.bind(null, locale)} className="account-form">
      <label htmlFor="category">{t('category')}</label><select id="category" name="category"><option value="rackets">{t('rackets')}</option><option value="balls">{t('balls')}</option><option value="shoes">{t('shoes')}</option><option value="bags">{t('bags')}</option></select>
      <button className="button secondary">{t('create')}</button>
    </form>
    {items.length > 0 && <form className="account-form" method="get"><label htmlFor="listing">{t('draft')}</label><select id="listing" name="listing" defaultValue={selected?.id}>{items.map((item,index) => <option key={item.id} value={item.id}>{item.title || `${t(item.category)} · ${index+1}`}</option>)}</select><button className="button secondary">{t('open')}</button></form>}
    {selected && <p><Link className="button primary" href={`/account/listings/${selected.id}`}>{editor('heading')}</Link></p>}
    {result?.data && <PhotoForm key={selected!.id} listing={result.data} />}
  </main>;
}

