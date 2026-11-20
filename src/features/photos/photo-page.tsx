import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { localeValue } from '@/features/auth/types';
import { fetchOwnerListing, fetchOwnerPhotoDrafts } from '@/features/listings/server';
import { createPhotoDraft } from '@/features/photos/actions';
import { PhotoForm } from '@/features/photos/photo-form';
import { Link } from '@/i18n/navigation';
import { EQUIPMENT_CATEGORIES } from '@/lib/domain/equipment';
import { verifiedClient } from '@/server/supabase/server';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ listing?: string; error?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const client = await verifiedClient();
  if (!client) redirect(`/${localeValue(locale)}/auth/signin`);

  const t = await getTranslations('photos');
  const editor = await getTranslations('listingEditor');
  const { items, error } = await fetchOwnerPhotoDrafts(client);
  const selected = items.find((item) => item.id === query.listing) ?? items[0];
  const listingResult = selected ? await fetchOwnerListing(client, selected.id) : null;

  return (
    <main id="main" className="container account-page">
      <Link href="/account">{t('back')}</Link>
      <h1>{t('title')}</h1>
      <p className="account-intro">{t('intro')}</p>
      {(error || listingResult?.error || query.error) && (
        <p role="alert" className="form-notice">
          {t('unavailable')}
        </p>
      )}
      <form action={createPhotoDraft.bind(null, locale)} className="account-form">
        <label htmlFor="category">{t('category')}</label>
        <select id="category" name="category">
          {EQUIPMENT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {t(category)}
            </option>
          ))}
        </select>
        <button className="button secondary">{t('create')}</button>
      </form>
      {items.length > 0 && (
        <form className="account-form" method="get">
          <label htmlFor="listing">{t('draft')}</label>
          <select id="listing" name="listing" defaultValue={selected?.id}>
            {items.map((item, index) => (
              <option key={item.id} value={item.id}>
                {item.title || `${t(item.category)} · ${index + 1}`}
              </option>
            ))}
          </select>
          <button className="button secondary">{t('open')}</button>
        </form>
      )}
      {selected && (
        <p>
          <Link className="button primary" href={`/account/listings/${selected.id}`}>
            {editor('heading')}
          </Link>
        </p>
      )}
      {listingResult?.listing && <PhotoForm key={selected!.id} listing={listingResult.listing} />}
    </main>
  );
}
