import { Suspense } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { PAGE_SIZE } from '@/lib/domain/equipment';
import { parsePageParam, uuidSchema } from '@/lib/validation/shared';
import { inventoryReturnHref, type InventoryParams } from './inventory';
import { decideListing, removeListing } from './actions';
import { MfaForm, ReviewForm } from './forms';
import { AdminOverviewDashboard, RecentActivitySection } from './overview-sections';
import {
  fetchAdminOverview,
  fetchListingReviewSnapshot,
  fetchPendingListings,
  requireAdminAccess,
} from './server';
import { AdminShell } from './shell';
import { AdminPhotoPreview } from './photo-preview';
import type { ReviewDecisionState } from './types';
import { getReviewListingDisplayRows } from './validation';

function AdminOverviewFallback({ label }: { label: string }) {
  return (
    <main id="main" className="container admin-loading" aria-busy="true">
      <p className="field-hint">{label}</p>
      <div className="admin-skeleton-grid" aria-hidden="true">
        <div className="admin-skeleton-card" />
        <div className="admin-skeleton-card" />
        <div className="admin-skeleton-card" />
        <div className="admin-skeleton-card" />
      </div>
    </main>
  );
}

async function AdminOverviewContent({
  client,
  current,
  done,
}: {
  client: SupabaseClient;
  current: number;
  done?: string;
}) {
  const t = await getTranslations('admin');
  const [overviewResult, pending] = await Promise.all([
    fetchAdminOverview(client),
    fetchPendingListings(client, current),
  ]);

  const overview = overviewResult.overview;
  const pendingCount = overview?.needs_attention.pending_listings ?? pending.page?.total;
  const openReportsCount = overview?.needs_attention.open_reports;

  return (
    <AdminShell
      active="overview"
      pendingCount={pendingCount}
      openReportsCount={openReportsCount}
    >
      <header className="admin-page-header">
        <div>
          <h1>{t('overview.title')}</h1>
          <p className="field-hint">{t('overview.subtitle')}</p>
        </div>
      </header>

      {['approve', 'reject'].includes(done ?? '') && (
        <p role="status" className="admin-status-banner">
          {t('saved')}
        </p>
      )}

      {overviewResult.error || !overview ? (
        <p role="alert" className="admin-alert">
          {t('overview.overviewUnavailable')}
        </p>
      ) : (
        <AdminOverviewDashboard overview={overview} />
      )}

      <section
        id="pending-queue"
        className="admin-section"
        aria-labelledby="admin-pending-heading"
      >
        <div className="admin-section-head">
          <div>
            <h2 id="admin-pending-heading">{t('queue')}</h2>
            {pending.page && (
              <p className="field-hint">{t('count', { count: pending.page.total })}</p>
            )}
          </div>
        </div>

        {pending.error || !pending.page ? (
          <p role="alert" className="admin-alert">
            {t('unavailable')}
          </p>
        ) : pending.page.total === 0 ? (
          <p className="admin-empty-state">{t('overview.pendingEmpty')}</p>
        ) : (
          <>
            <ul className="admin-queue">
              {pending.page.items.map((item) => (
                <li key={item.id}>
                  <Link href={`/admin/listings/${item.id}`} prefetch={false}>
                    <bdi>{item.title || t('overview.untitledListing')}</bdi>
                  </Link>
                  <span className="admin-queue-seller">
                    <bdi>{item.display_name}</bdi>
                  </span>
                </li>
              ))}
            </ul>
            {(current > 1 || current * PAGE_SIZE < pending.page.total) && (
              <nav className="admin-pagination" aria-label={t('pages')}>
                {current > 1 && (
                  <Link href={`/admin?page=${current - 1}#pending-queue`} className="admin-page-link">
                    {t('previous')}
                  </Link>
                )}
                {current * PAGE_SIZE < pending.page.total && (
                  <Link href={`/admin?page=${current + 1}#pending-queue`} className="admin-page-link">
                    {t('next')}
                  </Link>
                )}
              </nav>
            )}
          </>
        )}
      </section>

      {overview && <RecentActivitySection items={overview.recent_activity} />}
    </AdminShell>
  );
}

export async function AdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; done?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const gate = await requireAdminAccess(locale);
  const t = await getTranslations('admin');

  if (gate.status === 'unavailable') {
    return (
      <main id="main" className="container account-page">
        <p role="alert">{t('unavailable')}</p>
      </main>
    );
  }

  if (!gate.access.mfa_verified) {
    const factors = await gate.client.auth.mfa.listFactors();
    return (
      <main id="main" className="container account-page">
        <Link href="/account">{t('account')}</Link>
        <h1>{t('mfaTitle')}</h1>
        <p>{t('mfaHint')}</p>
        {factors.error ? (
          <p role="alert">{t('unavailable')}</p>
        ) : (
          <MfaForm factor={factors.data.totp[0]?.id} />
        )}
      </main>
    );
  }

  const parsedPage = parsePageParam(query.page);
  const current = parsedPage.ok ? parsedPage.page : 1;

  return (
    <Suspense fallback={<AdminOverviewFallback label={t('overview.loading')} />}>
      <AdminOverviewContent client={gate.client} current={current} done={query.done} />
    </Suspense>
  );
}

export async function AdminReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<InventoryParams>;
}) {
  const { locale, id } = await params;
  const returnTo = inventoryReturnHref((await searchParams).returnTo);
  const inventory = await getTranslations('admin.inventory');
  if (!uuidSchema.safeParse(id).success) notFound();

  const gate = await requireAdminAccess(locale, { requireMfa: true });
  const t = await getTranslations('admin');
  const e = await getTranslations('listingEditor');

  if (gate.status === 'unavailable') {
    return (
      <main id="main" className="container account-page">
        <p role="alert">{t('unavailable')}</p>
      </main>
    );
  }

  const { snapshot, inspection, incompleteMedia, error } = await fetchListingReviewSnapshot(gate.client, id);
  if (error || !snapshot || !inspection) {
    return (
      <AdminShell active="listings">
        <p role="alert" className="admin-alert">
          {t('unavailable')}
        </p>
        <Link href={returnTo} className="text-link">
          {inventory('title')}
        </Link>
      </AdminShell>
    );
  }

  // Capture the reviewed snapshot in Next's encrypted action closure, rather
  // than serialize storage manifest keys as ordinary bound client arguments.
  async function submitReview(state: ReviewDecisionState, form: FormData) {
    'use server';
    return decideListing(locale, snapshot!, state, form, returnTo);
  }

  async function submitRemoval(state: ReviewDecisionState, form: FormData) {
    'use server';
    return removeListing(locale, snapshot!, state, form, returnTo);
  }

  const profileText = await getTranslations('account');
  const photoText = await getTranslations('photos');
  const detailRows = getReviewListingDisplayRows(snapshot.listing);

  return (
    <AdminShell active="listings">
      <div className="admin-subpage">
        <Link href={returnTo} className="text-link">
          {inventory('title')}
        </Link>
        <h1>{snapshot.listing.status === 'pending' ? t('review') : inventory('inspect')}</h1>
        <p className="form-notice">{snapshot.listing.status === 'pending' ? t('reviewHint') : inventory('inspectionHint')}</p>
        <p><strong>{snapshot.listing.status === 'active' ? inventory('active') : e(snapshot.listing.status)}</strong> · {inventory(inspection.public_visible ? 'visible' : 'private')}</p>
        <dl className="review-details inspection-timestamps">
          {(['created_at', 'updated_at', 'approved_at', 'published_at'] as const).map(key => inspection[key] && <div key={key}><dt>{inventory(key)}</dt><dd><time dateTime={inspection[key]}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(inspection[key]))}</time></dd></div>)}
          {snapshot.listing.submitted_at && <div><dt>{inventory('submitted')}</dt><dd>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(snapshot.listing.submitted_at))}</dd></div>}
        </dl>
        {inspection.decision && <section className="admin-status-banner"><h2>{inventory('decision')}</h2><p>{inventory(`decisions.${inspection.decision.action}`)} · {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(inspection.decision.created_at))}</p>{inspection.decision.reason && <p><bdi>{inspection.decision.reason}</bdi></p>}</section>}
        <p>
          {inspection.seller_public_id ? (
            <Link href={`/admin/sellers/${inspection.seller_public_id}`} className="text-link">
              <bdi>
                {snapshot.profile.display_name} · @{snapshot.profile.username}
              </bdi>
            </Link>
          ) : (
            <bdi>
              {snapshot.profile.display_name} · @{snapshot.profile.username}
            </bdi>
          )}
        </p>
        <p className="field-hint">
          {t('eligibility', {
            visibility: snapshot.profile.is_public ? t('yes') : t('no'),
            contact:
              snapshot.profile.public_contact_consent && snapshot.profile.has_contact
                ? t('yes')
                : t('no'),
            status: inventory(`accounts.${snapshot.profile.account_status}`),
          })}
        </p>
        <dl className="review-details listing-detail-fields">
          {detailRows.map(({ key, value }) => (
            <div key={key}>
              <dt>{e.has(key) ? e(key) : t(key)}</dt>
              <dd>
                <bdi>
                  {key === 'category' ? photoText(String(value))
                    : key === 'governorate_slug' ? profileText(`governorates.${value}`)
                    : key === 'condition' || key === 'offer_type' ? e(String(value))
                    : key === 'racket_shape'
                    ? e(`shapes.${String(value)}`)
                    : typeof value === 'boolean'
                      ? t(value ? 'yes' : 'no')
                      : String(value)}
                </bdi>
              </dd>
            </div>
          ))}
        </dl>
        <>
            {incompleteMedia && <p role="status">{inventory('unavailablePhotos')}</p>}
            <div className="photo-grid">
              {snapshot.media_manifest.map((item, index) => (
                <figure key={item.media_id}>
                  <a
                    href={`/api/admin/listings/${id}/photos/${item.media_id}?variant=full`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <AdminPhotoPreview
                      fallback={inventory('noPhoto')}
                      src={`/api/admin/listings/${id}/photos/${item.media_id}?variant=card`}
                      alt={t('photo', { number: index + 1 })}
                    />
                  </a>
                  <figcaption>{t('photo', { number: index + 1 })}</figcaption>
                </figure>
              ))}
            </div>
            {snapshot.media_manifest.length === 0 && <p>{inventory('noPhoto')}</p>}
            {snapshot.listing.status === 'pending' ? <ReviewForm action={submitReview} /> : inspection.public_visible ? <ReviewForm action={submitRemoval} removal /> : <p role="status">{inventory('noActions')}</p>}
          </>
      </div>
    </AdminShell>
  );
}
