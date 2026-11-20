/* eslint-disable @next/next/no-img-element -- Review photos bypass the shared image optimizer. */
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { AnalyticsSummary } from '@/features/analytics/summary';
import { Link } from '@/i18n/navigation';
import { PAGE_SIZE } from '@/lib/domain/equipment';
import { parsePageParam, uuidSchema } from '@/lib/validation/shared';
import { decideListing } from './actions';
import { MfaForm, ReviewForm } from './forms';
import {
  fetchListingReviewSnapshot,
  fetchPendingListings,
  requireAdminAccess,
} from './server';
import type { ReviewDecisionState } from './types';
import { getReviewListingDisplayRows } from './validation';

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
  const pending = await fetchPendingListings(gate.client, current);
  const reports = await getTranslations('reports');

  return (
    <main id="main" className="container account-page">
      <Link href="/account">{t('account')}</Link>
      <h1>{t('queue')}</h1>
      <Link href="/admin/reports">{reports('queue')}</Link>
      <AnalyticsSummary admin />
      {['approve', 'reject'].includes(query.done ?? '') && <p role="status">{t('saved')}</p>}
      {pending.error || !pending.page ? (
        <p role="alert">{t('unavailable')}</p>
      ) : (
        <>
          <p>{t('count', { count: pending.page.total })}</p>
          <ul className="admin-queue">
            {pending.page.items.map((item) => (
              <li key={item.id}>
                <Link href={`/admin/listings/${item.id}`} prefetch={false}>
                  <bdi>{item.title}</bdi>
                </Link>
                <span>
                  <bdi>{item.display_name}</bdi>
                </span>
              </li>
            ))}
          </ul>
          <nav className="category-links" aria-label={t('pages')}>
            {current > 1 && <Link href={`/admin?page=${current - 1}`}>{t('previous')}</Link>}
            {current * PAGE_SIZE < pending.page.total && (
              <Link href={`/admin?page=${current + 1}`}>{t('next')}</Link>
            )}
          </nav>
        </>
      )}
    </main>
  );
}

export async function AdminReviewPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
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

  const { snapshot, error } = await fetchListingReviewSnapshot(gate.client, id);
  if (error || !snapshot) {
    return (
      <main id="main" className="container account-page">
        <p role="alert">{t('unavailable')}</p>
        <Link href="/admin">{t('queue')}</Link>
      </main>
    );
  }

  // Capture the reviewed snapshot in Next's encrypted action closure, rather
  // than serialize storage manifest keys as ordinary bound client arguments.
  async function submitReview(state: ReviewDecisionState, form: FormData) {
    'use server';
    return decideListing(locale, snapshot!, state, form);
  }

  const detailRows = getReviewListingDisplayRows(snapshot.listing);

  return (
    <main id="main" className="container account-page">
      <Link href="/admin">{t('queue')}</Link>
      <h1>{t('review')}</h1>
      <p className="form-notice">{t('reviewHint')}</p>
      <p>
        <bdi>
          {snapshot.profile.display_name} · @{snapshot.profile.username}
        </bdi>
      </p>
      <p>
        {t('eligibility', {
          visibility: snapshot.profile.is_public ? t('yes') : t('no'),
          contact:
            snapshot.profile.public_contact_consent && snapshot.profile.has_contact
              ? t('yes')
              : t('no'),
          status: snapshot.profile.account_status,
        })}
      </p>
      <dl className="review-details">
        {detailRows.map(({ key, value }) => (
          <div key={key}>
            <dt>{e.has(key) ? e(key) : t(key)}</dt>
            <dd>
              <bdi>
                {key === 'racket_shape'
                  ? e(`shapes.${String(value)}`)
                  : typeof value === 'boolean'
                    ? t(value ? 'yes' : 'no')
                    : String(value)}
              </bdi>
            </dd>
          </div>
        ))}
      </dl>
      {snapshot.listing.status === 'pending' ? (
        <>
          <div className="photo-grid">
            {snapshot.media_manifest.map((item, index) => (
              <figure key={item.media_id}>
                <a
                  href={`/api/admin/listings/${id}/photos/${item.media_id}?variant=full`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <img
                    src={`/api/admin/listings/${id}/photos/${item.media_id}`}
                    alt={t('photo', { number: index + 1 })}
                    width={640}
                    height={480}
                  />
                </a>
                <figcaption>{t('photo', { number: index + 1 })}</figcaption>
              </figure>
            ))}
          </div>
          <ReviewForm action={submitReview} />
        </>
      ) : (
        <p role="status">{t('notPending')}</p>
      )}
    </main>
  );
}
