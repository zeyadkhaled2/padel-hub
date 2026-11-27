'use client';
/* eslint-disable @next/next/no-img-element -- Owner listing thumbnails bypass the shared image optimizer. */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  Camera,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileEdit,
  ImagePlus,
  PackageOpen,
  RotateCcw,
  Tag,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import {
  MAX_LISTING_PHOTOS,
  MIN_LISTING_PHOTOS,
  canMarkListingSold,
  canMarkListingTraded,
  isListingArchivable,
  isListingEditable,
  isListingRelistable,
  isListingWithdrawable,
  meetsListingPhotoRules,
  type ListingStatus,
} from '@/lib/domain/equipment';
import { formatAmount } from '@/lib/format';
import { runDashboardListingAction } from './actions';
import type { ListingEditorMessage, OwnerListingSummary } from './types';

type StatusFilter =
  | 'all'
  | 'active'
  | 'pending'
  | 'rejected'
  | 'draft'
  | 'completed'
  | 'archived';

const PUBLIC_PREVIEW_STATUSES: readonly ListingStatus[] = ['active', 'reserved', 'sold', 'traded'];

function matchesStatusFilter(status: ListingStatus, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'completed') return status === 'sold' || status === 'traded';
  if (filter === 'archived') return status === 'archived' || status === 'removed';
  return status === filter;
}

export function SellerListingsBoard({
  readOnly = false,
  initialItems,
  hasProfile,
  profileReadyForPublic,
}: {
  readOnly?: boolean;
  initialItems: OwnerListingSummary[];
  hasProfile: boolean;
  profileReadyForPublic: boolean;
}) {
  const t = useTranslations('listingEditor');
  const photos = useTranslations('photos');
  const market = useTranslations('market');
  const locale = useLocale();
  const router = useRouter();

  const [items, setItems] = useState<OwnerListingSummary[]>(initialItems);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [busyListingId, setBusyListingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    kind: 'success' | 'error';
    message: ListingEditorMessage;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const counts = useMemo(() => {
    const map = {
      all: items.length,
      active: 0,
      pending: 0,
      rejected: 0,
      draft: 0,
      sold: 0,
      traded: 0,
      completed: 0,
      archived: 0,
    };
    for (const item of items) {
      if (item.status === 'active') map.active++;
      else if (item.status === 'pending') map.pending++;
      else if (item.status === 'rejected') map.rejected++;
      else if (item.status === 'draft') map.draft++;
      else if (item.status === 'sold') {
        map.sold++;
        map.completed++;
      } else if (item.status === 'traded') {
        map.traded++;
        map.completed++;
      } else if (item.status === 'archived' || item.status === 'removed') {
        map.archived++;
      }
    }
    return map;
  }, [items]);

  const filteredItems = useMemo(
    () => items.filter((item) => matchesStatusFilter(item.status, filter)),
    [items, filter],
  );

  function triggerLifecycleAction(
    item: OwnerListingSummary,
    intent: 'withdraw' | 'sold' | 'traded' | 'archive' | 'relist' | 'reopen',
  ) {
    if (readOnly) return;
    setBusyListingId(item.id);
    setFeedback(null);
    const form = new FormData();
    form.set('id', item.id);
    form.set('version', String(item.version));
    form.set('intent', intent);

    startTransition(async () => {
      try {
        const result = await runDashboardListingAction(locale, form);
        if (result.ok) {
          setItems((previous) =>
            previous.map((entry) =>
              entry.id === item.id
                ? {
                    ...entry,
                    status: result.listing.status,
                    version: result.listing.version,
                    rejection_reason:
                      result.listing.status === 'rejected' ? entry.rejection_reason : null,
                  }
                : entry,
            ),
          );
          setFeedback({ kind: 'success', message: result.message });
          router.refresh();
        } else {
          setFeedback({ kind: 'error', message: result.message });
        }
      } catch {
        setFeedback({ kind: 'error', message: 'unavailable' });
      } finally {
        setBusyListingId(null);
      }
    });
  }

  const filterTabs: { id: StatusFilter; label: string; count: number }[] = [
    { id: 'all', label: t('dashboardFilterAll'), count: counts.all },
    { id: 'active', label: t('active'), count: counts.active },
    { id: 'pending', label: t('pending'), count: counts.pending },
    { id: 'rejected', label: t('rejected'), count: counts.rejected },
    { id: 'draft', label: t('draft'), count: counts.draft },
    { id: 'completed', label: t('dashboardFilterCompleted'), count: counts.completed },
    { id: 'archived', label: t('archived'), count: counts.archived },
  ];

  return (
    <div className="seller-board">
      {/* Real listing status counts grouped by status */}
      <div className="seller-stats-grid" aria-label={t('dashboardCountsLabel')}>
        <div className="seller-stat-card">
          <span className="seller-stat-label">{t('dashboardTotal')}</span>
          <strong className="seller-stat-value">{counts.all.toLocaleString(locale)}</strong>
        </div>
        <div className="seller-stat-card is-active">
          <span className="seller-stat-label">{t('active')}</span>
          <strong className="seller-stat-value">{counts.active.toLocaleString(locale)}</strong>
        </div>
        <div className="seller-stat-card is-pending">
          <span className="seller-stat-label">{t('pending')}</span>
          <strong className="seller-stat-value">{counts.pending.toLocaleString(locale)}</strong>
        </div>
        <div className={`seller-stat-card is-rejected${counts.rejected > 0 ? ' is-highlighted' : ''}`}>
          <span className="seller-stat-label">{t('rejected')}</span>
          <strong className="seller-stat-value">{counts.rejected.toLocaleString(locale)}</strong>
        </div>
        <div className="seller-stat-card">
          <span className="seller-stat-label">{t('draft')}</span>
          <strong className="seller-stat-value">{counts.draft.toLocaleString(locale)}</strong>
        </div>
        <div className="seller-stat-card">
          <span className="seller-stat-label">{t('dashboardFilterCompleted')}</span>
          <strong className="seller-stat-value">{counts.completed.toLocaleString(locale)}</strong>
          {(counts.sold > 0 || counts.traded > 0) && (
            <span className="seller-stat-meta">
              {t('dashboardCompletedSplit', {
                sold: counts.sold.toLocaleString(locale),
                traded: counts.traded.toLocaleString(locale),
              })}
            </span>
          )}
        </div>
        <div className="seller-stat-card">
          <span className="seller-stat-label">{t('archived')}</span>
          <strong className="seller-stat-value">{counts.archived.toLocaleString(locale)}</strong>
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          aria-live="polite"
          className={`seller-feedback-banner ${feedback.kind === 'error' ? 'is-error' : 'is-success'}`}
        >
          <span>{t(feedback.message)}</span>
          {(feedback.message === 'conflict' || feedback.message === 'conflictOrLimit') && (
            <button
              type="button"
              className="button secondary seller-inline-btn"
              onClick={() => {
                setFeedback(null);
                router.refresh();
              }}
            >
              {t('dashboardRefresh')}
            </button>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <div className="seller-empty-panel">
          <div className="seller-empty-head">
            <span className="storefront-empty-icon" aria-hidden>
              <PackageOpen size={24} />
            </span>
            <h2>{t('dashboardEmptyTitle')}</h2>
            <p>{t('empty')}</p>
          </div>
          <ol className="seller-onboarding-steps">
            <li className="seller-onboarding-step">
              <span className="step-number">1</span>
              <div>
                <h3>{t('onboardingStep1Title')}</h3>
                <p>{t('onboardingStep1Body')}</p>
              </div>
            </li>
            <li className="seller-onboarding-step">
              <span className="step-number">2</span>
              <div>
                <h3>{t('onboardingStep2Title')}</h3>
                <p>
                  {t('onboardingStep2Body', {
                    min: MIN_LISTING_PHOTOS,
                    max: MAX_LISTING_PHOTOS,
                  })}
                </p>
              </div>
            </li>
            <li className="seller-onboarding-step">
              <span className="step-number">3</span>
              <div>
                <h3>{t('onboardingStep3Title')}</h3>
                <p>{t('onboardingStep3Body')}</p>
              </div>
            </li>
          </ol>
          {(!hasProfile || !profileReadyForPublic) && !readOnly && (
            <div className="seller-empty-cta">
              <Link href="/account" className="button secondary">
                <span>{hasProfile ? t('onboardingConfigureProfile') : t('onboardingCreateProfile')}</span>
                <ArrowRight size={16} className="icon-directional" aria-hidden />
              </Link>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Filter bar */}
          <div className="seller-filter-bar" role="group" aria-label={t('dashboardFilterLabel')}>
            {filterTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`category-link seller-filter-pill${filter === tab.id ? ' selected' : ''}`}
                aria-pressed={filter === tab.id}
                onClick={() => setFilter(tab.id)}
              >
                <span>{tab.label}</span>
                <span className="seller-pill-count">{tab.count.toLocaleString(locale)}</span>
              </button>
            ))}
          </div>

          {filteredItems.length === 0 ? (
            <div className="empty-state">
              <h3>{t('dashboardNoFilterMatch')}</h3>
              <p>{t('dashboardNoFilterMatchHint')}</p>
              <button
                type="button"
                className="button secondary"
                onClick={() => setFilter('all')}
              >
                {t('dashboardShowAll')}
              </button>
            </div>
          ) : (
            <ul className="seller-listings-list">
              {filteredItems.map((item, index) => {
                const displayTitle = item.title || `${photos(item.category)} · ${index + 1}`;
                const editable = isListingEditable(item.status);
                const canPreview =
                  profileReadyForPublic && PUBLIC_PREVIEW_STATUSES.includes(item.status);
                const busy = isPending && busyListingId === item.id;
                const needsMorePhotos = editable && item.photo_count < MIN_LISTING_PHOTOS;
                const hasExcessPhotos = editable && item.photo_count > MAX_LISTING_PHOTOS;
                const relistable = isListingRelistable(item.status);
                const relistPhotoValid = meetsListingPhotoRules(item.photo_count);
                const photoBadgeWarn = needsMorePhotos || hasExcessPhotos || (relistable && !relistPhotoValid);

                return (
                  <li key={item.id} className="seller-listing-card">
                    <Link
                      href={`/account/listings/${item.id}`}
                      className="seller-listing-thumb"
                      aria-hidden="true"
                      tabIndex={-1}
                    >
                      {item.cover_media_id ? (
                        <img
                          src={`/api/media/${item.cover_media_id}?variant=card`}
                          alt=""
                          width={320}
                          height={240}
                          loading={index < 6 ? 'eager' : 'lazy'}
                        />
                      ) : (
                        <span className="seller-thumb-placeholder">
                          <Camera size={24} />
                          <span>{t('dashboardNoPhoto')}</span>
                        </span>
                      )}
                      <span
                        dir="ltr"
                        className={`seller-thumb-count${photoBadgeWarn ? ' is-warn' : ''}`}
                      >
                        {item.photo_count} / {MAX_LISTING_PHOTOS}
                      </span>
                    </Link>

                    <div className="seller-listing-body">
                      <div className="seller-listing-top">
                        <div className="card-tags">
                          <span className={`seller-status-badge is-${item.status}`}>
                            {item.status === 'active' && <CheckCircle2 size={13} aria-hidden />}
                            {item.status === 'pending' && <Clock size={13} aria-hidden />}
                            {item.status === 'rejected' && <AlertTriangle size={13} aria-hidden />}
                            {item.status === 'archived' && <Archive size={13} aria-hidden />}
                            <span>{t(item.status)}</span>
                          </span>
                          <span className="card-meta-tag">{photos(item.category)}</span>
                          {item.condition && (
                            <span className={`condition is-${item.condition}`}>
                              {t(item.condition)}
                            </span>
                          )}
                          {item.offer_type && (
                            <span className="card-meta-tag">{t(item.offer_type)}</span>
                          )}
                        </div>

                        <p className="seller-listing-price">
                          {item.offer_type === 'swap' ? (
                            <span className="seller-price-swap">{t('swap')}</span>
                          ) : item.price_egp !== null ? (
                            <>
                              <span>{market('price', { amount: formatAmount(item.price_egp, locale) })}</span>
                              {item.is_negotiable && (
                                <span className="card-negotiable-tag">{market('negotiable')}</span>
                              )}
                            </>
                          ) : (
                            <span className="seller-price-unset">{t('dashboardPriceUnset')}</span>
                          )}
                        </p>
                      </div>

                      <h3 className="seller-listing-title">
                        <Link href={`/account/listings/${item.id}`}>
                          <bdi>{displayTitle}</bdi>
                        </Link>
                      </h3>

                      {editable && needsMorePhotos && (
                        <p className="seller-photo-alert">
                          <ImagePlus size={14} aria-hidden />
                          <span>
                            {t('dashboardPhotosNeeded', {
                              current: item.photo_count,
                              min: MIN_LISTING_PHOTOS,
                              max: MAX_LISTING_PHOTOS,
                            })}
                          </span>
                        </p>
                      )}

                      {editable && hasExcessPhotos && (
                        <p className="seller-photo-alert">
                          <AlertTriangle size={14} aria-hidden />
                          <span>
                            {t('dashboardPhotosExcess', {
                              current: item.photo_count,
                              excess: item.photo_count - MAX_LISTING_PHOTOS,
                              min: MIN_LISTING_PHOTOS,
                              max: MAX_LISTING_PHOTOS,
                            })}
                          </span>
                        </p>
                      )}

                      {relistable && !relistPhotoValid && (
                        <p className="seller-photo-alert">
                          <AlertTriangle size={14} aria-hidden />
                          <span>
                            {item.photo_count < MIN_LISTING_PHOTOS
                              ? t('relistPhotoTooFew', {
                                  count: item.photo_count,
                                  min: MIN_LISTING_PHOTOS,
                                  max: MAX_LISTING_PHOTOS,
                                })
                              : t('relistPhotoTooMany', {
                                  count: item.photo_count,
                                  min: MIN_LISTING_PHOTOS,
                                  max: MAX_LISTING_PHOTOS,
                                })}
                          </span>
                        </p>
                      )}

                      {item.status === 'rejected' && item.rejection_reason && (
                        <div className="seller-rejection-box">
                          <p className="seller-rejection-title">
                            <AlertTriangle size={15} aria-hidden />
                            <span>{t('dashboardRejectionLabel')}</span>
                          </p>
                          <p className="user-copy seller-rejection-copy">{item.rejection_reason}</p>
                        </div>
                      )}

                      <div className="seller-listing-actions">
                        <Link
                          href={`/account/listings/${item.id}`}
                          className={`button ${item.status === 'rejected' && !readOnly ? 'primary' : 'secondary'} seller-card-btn`}
                        >
                          <FileEdit size={15} aria-hidden />
                          <span>
                            {readOnly ? t('dashboardManage') : item.status === 'rejected'
                              ? t('dashboardFixResubmit')
                              : editable
                                ? t('dashboardEdit')
                                : t('dashboardManage')}
                          </span>
                        </Link>

                        {editable && (
                          <Link
                            href={`/account/photos?listing=${item.id}`}
                            className="button secondary seller-card-btn"
                          >
                            <ImagePlus size={15} aria-hidden />
                            <span>{t('photos')}</span>
                          </Link>
                        )}

                        {canPreview && (
                          <Link
                            href={`/equipment/${item.id}`}
                            prefetch={false}
                            className="button secondary seller-card-btn"
                          >
                            <ExternalLink size={15} aria-hidden />
                            <span>{t('dashboardViewPublic')}</span>
                          </Link>
                        )}

                        {canMarkListingSold(item.status, item.offer_type) && (
                          <button
                            type="button"
                            className="button secondary seller-card-btn"
                            disabled={busy || readOnly}
                            onClick={() => triggerLifecycleAction(item, 'sold')}
                          >
                            <Tag size={15} aria-hidden />
                            <span>{t('markSold')}</span>
                          </button>
                        )}

                        {canMarkListingTraded(item.category, item.status, item.offer_type) && (
                          <button
                            type="button"
                            className="button secondary seller-card-btn"
                            disabled={busy || readOnly}
                            onClick={() => triggerLifecycleAction(item, 'traded')}
                          >
                            <RotateCcw size={15} aria-hidden />
                            <span>{t('markTraded')}</span>
                          </button>
                        )}

                        {isListingWithdrawable(item.status) && item.status === 'pending' && (
                          <button
                            type="button"
                            className="button secondary seller-card-btn"
                            disabled={busy || readOnly}
                            onClick={() => triggerLifecycleAction(item, 'withdraw')}
                          >
                            <span>{t('withdraw')}</span>
                          </button>
                        )}

                        {isListingArchivable(item.status) && (
                          <button
                            type="button"
                            className="button secondary seller-card-btn"
                            disabled={busy || readOnly}
                            onClick={() => triggerLifecycleAction(item, 'archive')}
                          >
                            <Archive size={15} aria-hidden />
                            <span>{t('archive')}</span>
                          </button>
                        )}

                        {relistable && relistPhotoValid && (
                          <>
                            <button
                              type="button"
                              className="button primary seller-card-btn"
                              disabled={busy || readOnly}
                              onClick={() => triggerLifecycleAction(item, 'relist')}
                            >
                              <RotateCcw size={15} aria-hidden />
                              <span>{t('relist')}</span>
                            </button>
                            <button
                              type="button"
                              className="button secondary seller-card-btn"
                              disabled={busy || readOnly}
                              onClick={() => triggerLifecycleAction(item, 'reopen')}
                            >
                              <FileEdit size={15} aria-hidden />
                              <span>{t('reopen')}</span>
                            </button>
                          </>
                        )}

                        {relistable && !relistPhotoValid && (
                          <button
                            type="button"
                            className="button primary seller-card-btn"
                            disabled={busy || readOnly}
                            onClick={() => triggerLifecycleAction(item, 'reopen')}
                          >
                            <RotateCcw size={15} aria-hidden />
                            <span>{t('reopen')}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
