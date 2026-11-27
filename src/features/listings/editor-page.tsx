import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { AlertTriangle, ArrowLeft, ExternalLink, ImagePlus } from 'lucide-react';
import { localeValue } from '@/features/auth/types';
import { MutationNotice } from '@/features/profile/mutation-notice';
import { fetchMyAccountDeletionRequest, fetchMyProfileBundle } from '@/features/profile/server';
import { Link } from '@/i18n/navigation';
import { isListingEditable } from '@/lib/domain/equipment';
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

  const [t, photos, admin, listingResult, profileBundle, deletion] = await Promise.all([
    getTranslations('listingEditor'),
    getTranslations('photos'),
    getTranslations('admin'),
    fetchOwnerListing(client, id),
    fetchMyProfileBundle(client),
    fetchMyAccountDeletionRequest(client),
  ]);

  if (listingResult.error) {
    return (
      <main id="main" className="container seller-page">
        <div role="alert" className="seller-feedback-banner is-error">
          <AlertTriangle size={16} aria-hidden />
          <span>{t('unavailable')}</span>
        </div>
      </main>
    );
  }
  const listing = listingResult.listing;
  if (!listing) notFound();

  const readOnly = deletion.error || deletion.request?.status === 'pending';

  const decisionResult =
    listing.status === 'rejected' ? await fetchOwnerListingDecision(client, id) : null;

  const editable = !readOnly && isListingEditable(listing.status);
  const canViewPublic =
    ['active', 'reserved', 'sold', 'traded'].includes(listing.status) &&
    Boolean(
      profileBundle.profile?.is_public &&
        profileBundle.profile?.public_contact_consent &&
        profileBundle.profile?.account_status === 'active',
    );

  return (
    <main id="main" className="container seller-page editor-page">
      <div className="detail-breadcrumb seller-top-bar">
        <Link href="/account/listings" className="detail-back-link">
          <ArrowLeft size={16} className="icon-directional" aria-hidden />
          <span>{t('myListings')}</span>
        </Link>
        <div className="seller-top-links">
          {editable && (
            <Link
              href={`/account/photos?listing=${listing.id}`}
              className="button secondary seller-compact-btn"
            >
              <ImagePlus size={15} aria-hidden />
              <span>{photos('title')}</span>
            </Link>
          )}
          {canViewPublic && (
            <Link
              href={`/equipment/${listing.id}`}
              prefetch={false}
              className="button secondary seller-compact-btn"
            >
              <ExternalLink size={15} aria-hidden />
              <span>{t('dashboardViewPublic')}</span>
            </Link>
          )}
        </div>
      </div>

      <div className="editor-page-header">
        <div className="card-tags">
          <span className="card-meta-tag">{photos(listing.category)}</span>
          {listing.condition && (
            <span className={`condition is-${listing.condition}`}>{t(listing.condition)}</span>
          )}
        </div>
        <h1>{t('heading')}</h1>
        <p className="seller-hero-subtitle">{t('intro')}</p>
      </div>

      {decisionResult?.error && (
        <div role="alert" className="seller-feedback-banner is-error">
          <AlertTriangle size={16} aria-hidden />
          <span>{admin('unavailable')}</span>
        </div>
      )}

      {decisionResult?.decision && (
        <section className="editor-rejection-banner" aria-labelledby="rejection-heading">
          <div className="editor-rejection-head">
            <span className="editor-rejection-icon" aria-hidden>
              <AlertTriangle size={18} />
            </span>
            <div>
              <h2 id="rejection-heading">{admin('rejection')}</h2>
              <p className="editor-rejection-sub">{t('rejectionActionHint')}</p>
            </div>
          </div>
          <p className="user-copy editor-rejection-reason">{decisionResult.decision.reason}</p>
        </section>
      )}

      {readOnly && <MutationNotice error={deletion.error} />}
      <fieldset disabled={readOnly} className="listing-fields" aria-label={t('heading')}>
        <ListingForm initial={listing} profile={profileBundle.profile} readOnly={readOnly} />
      </fieldset>
    </main>
  );
}
