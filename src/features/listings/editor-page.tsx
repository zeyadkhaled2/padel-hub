import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { localeValue } from '@/features/auth/types';
import { uuidSchema } from '@/lib/validation/shared';
import { verifiedClient } from '@/server/supabase/server';
import { ListingForm } from './listing-form';
import { fetchOwnerListing, fetchOwnerListingDecision } from './server';

export default async function EditorPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();

  const client = await verifiedClient();
  if (!client) redirect(`/${localeValue(locale)}/auth/signin`);

  const t = await getTranslations('listingEditor');
  const { listing, error } = await fetchOwnerListing(client, id);
  if (error) {
    return (
      <main id="main" className="container account-page">
        <p role="alert">{t('unavailable')}</p>
      </main>
    );
  }
  if (!listing) notFound();

  const decisionResult =
    listing.status === 'rejected' ? await fetchOwnerListingDecision(client, id) : null;
  const admin = await getTranslations('admin');

  return (
    <main id="main" className="container account-page">
      <Link href="/account/listings">{t('myListings')}</Link>
      <h1>{t('heading')}</h1>
      <p className="account-intro">{t('intro')}</p>
      {decisionResult?.error && <p role="alert">{admin('unavailable')}</p>}
      {decisionResult?.decision && (
        <div className="form-notice">
          <h2>{admin('rejection')}</h2>
          <p className="user-copy">{decisionResult.decision.reason}</p>
        </div>
      )}
      <ListingForm initial={listing} />
    </main>
  );
}
