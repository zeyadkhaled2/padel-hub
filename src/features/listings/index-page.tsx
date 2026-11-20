import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { AnalyticsSummary } from '@/features/analytics/summary';
import { localeValue } from '@/features/auth/types';
import { Link } from '@/i18n/navigation';
import { EQUIPMENT_CATEGORIES } from '@/lib/domain/equipment';
import { verifiedClient } from '@/server/supabase/server';
import { createListing } from './actions';
import { fetchOwnerListings } from './server';

export default async function ListingIndex({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const client = await verifiedClient();
  if (!client) redirect(`/${localeValue(locale)}/auth/signin`);

  const t = await getTranslations('listingEditor');
  const photos = await getTranslations('photos');
  const { items, error } = await fetchOwnerListings(client);

  return (
    <main id="main" className="container account-page">
      <Link href="/account">{t('account')}</Link>
      <h1>{t('myListings')}</h1>
      <AnalyticsSummary />
      <form action={createListing.bind(null, locale)} className="account-form">
        <label htmlFor="category">{photos('category')}</label>
        <select id="category" name="category">
          {EQUIPMENT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {photos(category)}
            </option>
          ))}
        </select>
        <button className="button primary">{t('create')}</button>
      </form>
      {error ? (
        <p role="alert">{t('unavailable')}</p>
      ) : (
        <ul>
          {items.map((item, index) => (
            <li key={item.id}>
              <Link href={`/account/listings/${item.id}`}>
                {item.title || `${photos(item.category)} · ${index + 1}`}
              </Link>{' '}
              — {t(item.status)}
            </li>
          ))}
        </ul>
      )}
      {!error && items.length === 0 && <p>{t('empty')}</p>}
    </main>
  );
}
