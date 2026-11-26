import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { LISTING_STATUSES } from '@/lib/domain/equipment';
import { uuidSchema } from '@/lib/validation/shared';
import {
  moderateSellerStatus,
  updateSellerAccountType,
  updateSellerListingLimit,
} from './actions';
import {
  SellerAccountTypeForm,
  SellerAllowanceForm,
  SellerModerationForm,
} from './seller-forms';
import {
  sellerDetailSchema,
  sellersReturnHref,
  type SellerActionState,
  type SellerQueryParams,
} from './sellers';
import { requireAdminAccess } from './server';
import { AdminShell } from './shell';
import { getActivityActionTranslationKey } from './validation';

function formatTimestamp(iso: string, locale: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(parsed);
}

export async function AdminSellerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<SellerQueryParams>;
}) {
  const { locale, id } = await params;
  const query = await searchParams;
  if (!uuidSchema.safeParse(id).success) notFound();

  const returnTo = sellersReturnHref(query.returnTo);
  const gate = await requireAdminAccess(locale, { requireMfa: true });
  const a = await getTranslations('admin');
  const t = await getTranslations('admin.sellers');
  const inv = await getTranslations('admin.inventory');
  const ov = await getTranslations('admin.overview');
  const analyticsT = await getTranslations('analytics');
  const p = await getTranslations('account');
  const e = await getTranslations('listingEditor');

  if (gate.status !== 'ok') {
    return (
      <main id="main" className="container account-page">
        <p role="alert">{a('unavailable')}</p>
      </main>
    );
  }

  const response = await gate.client.rpc('admin_seller_detail', {
    p_seller_public_id: id,
  });

  if (response.error) {
    return (
      <AdminShell active="sellers">
        <p role="alert" className="admin-alert">
          {a('unavailable')}
        </p>
        <Link href={returnTo} className="text-link">
          {t('backToSellers')}
        </Link>
      </AdminShell>
    );
  }

  if (response.data === null) {
    notFound();
  }

  const parsed = sellerDetailSchema.safeParse(response.data);
  if (!parsed.success) {
    return (
      <AdminShell active="sellers">
        <p role="alert" className="admin-alert">
          {a('unavailable')}
        </p>
        <Link href={returnTo} className="text-link">
          {t('backToSellers')}
        </Link>
      </AdminShell>
    );
  }

  const detail = parsed.data;
  const { profile, allowance, listing_counts, engagement_30d, recent_activity, open_reports_count } = detail;

  async function submitAccountType(state: SellerActionState, form: FormData) {
    'use server';
    return updateSellerAccountType(locale, profile.public_id, profile.version, returnTo, state, form);
  }

  async function submitAllowance(state: SellerActionState, form: FormData) {
    'use server';
    return updateSellerListingLimit(locale, profile.public_id, profile.version, returnTo, state, form);
  }

  async function submitModeration(state: SellerActionState, form: FormData) {
    'use server';
    return moderateSellerStatus(locale, profile.public_id, profile.version, returnTo, state, form);
  }

  const doneKey = typeof query.done === 'string' &&
    ['account_type', 'allowance', 'allowance_reset', 'suspended', 'hidden'].includes(query.done)
    ? query.done
    : null;

  const usageRatio =
    allowance.effective_limit > 0
      ? Math.min(100, Math.round((allowance.used_count / allowance.effective_limit) * 100))
      : allowance.used_count > 0
        ? 100
        : 0;

  const statusLabel = (status: string) => (status === 'active' ? inv('active') : e(status));

  return (
    <AdminShell active="sellers">
      <div className="seller-detail-layout">
        <div className="seller-detail-topbar">
          <Link href={returnTo} className="text-link">
            {t('backToSellers')}
          </Link>
          <div className="seller-detail-quick-links">
            <Link href={`/admin/listings?seller=${profile.public_id}`} className="button secondary">
              {t('viewSellerListings')}
            </Link>
            {profile.public_profile_visible && (
              <Link href={`/@${profile.username}`} target="_blank" rel="noreferrer" className="button secondary">
                {t('openPublicStorefront')}
              </Link>
            )}
          </div>
        </div>

        <header className="admin-page-header seller-detail-header">
          <div>
            <div className="seller-detail-badges">
              <span className={`admin-seller-status is-${profile.account_status}`}>
                {inv(`accounts.${profile.account_status}`)}
              </span>
              <span className="inventory-status">{p(profile.account_type)}</span>
              <span className="inventory-status">
                {profile.public_profile_visible ? t('storefrontLive') : t('storefrontNotPublic')}
              </span>
            </div>
            <h1>
              <bdi>{profile.display_name}</bdi>
            </h1>
            <p className="field-hint">
              <bdi dir="ltr">@{profile.username}</bdi> · {p(`governorates.${profile.governorate_slug}`)}
              {profile.district_text ? (
                <>
                  {' '}
                  · <bdi>{profile.district_text}</bdi>
                </>
              ) : null}
            </p>
            <p className="field-hint seller-id-line">
              {t('sellerProfileIdLabel')}: <code>{profile.public_id}</code>
            </p>
          </div>
        </header>

        {doneKey && (
          <p role="status" className="admin-status-banner">
            {t(`savedMessages.${doneKey}`)}
          </p>
        )}

        <section className="admin-section" aria-labelledby="seller-profile-info-heading">
          <div className="admin-section-head">
            <div>
              <h2 id="seller-profile-info-heading">{t('profileInfoHeading')}</h2>
              <p className="field-hint">{t('profilePrivacyNote')}</p>
            </div>
          </div>

          <dl className="review-details seller-profile-dl">
            <div>
              <dt>{t('accountTypeFilter')}</dt>
              <dd>{p(profile.account_type)}</dd>
            </div>
            <div>
              <dt>{t('statusFilter')}</dt>
              <dd>{inv(`accounts.${profile.account_status}`)}</dd>
            </div>
            <div>
              <dt>{t('publicVisibilityLabel')}</dt>
              <dd>
                {profile.is_public ? a('yes') : a('no')} ·{' '}
                {profile.public_profile_visible ? t('storefrontLive') : t('storefrontNotPublic')}
              </dd>
            </div>
            <div>
              <dt>{t('contactConsentLabel')}</dt>
              <dd>
                {profile.public_contact_consent ? a('yes') : a('no')} ·{' '}
                {profile.has_contact ? t('contactConfigured') : t('contactMissing')}
              </dd>
            </div>
            {profile.public_contact_consented_at && (
              <div>
                <dt>{t('contactConsentedAtLabel')}</dt>
                <dd>
                  <time dateTime={profile.public_contact_consented_at}>
                    {ov('utcTimestamp', { date: formatTimestamp(profile.public_contact_consented_at, locale) })}
                  </time>
                </dd>
              </div>
            )}
            <div>
              <dt>{t('createdAtLabel')}</dt>
              <dd>
                <time dateTime={profile.created_at}>
                  {ov('utcTimestamp', { date: formatTimestamp(profile.created_at, locale) })}
                </time>
              </dd>
            </div>
            <div>
              <dt>{t('updatedAtLabel')}</dt>
              <dd>
                <time dateTime={profile.updated_at}>
                  {ov('utcTimestamp', { date: formatTimestamp(profile.updated_at, locale) })}
                </time>
              </dd>
            </div>
            <div>
              <dt>{t('openReportsLabel')}</dt>
              <dd>
                {open_reports_count.toLocaleString(locale)}
                {open_reports_count > 0 && (
                  <>
                    {' '}
                    ·{' '}
                    <Link href="/admin/reports" className="text-link">
                      {ov('openReportsLink')}
                    </Link>
                  </>
                )}
              </dd>
            </div>
            {profile.favorite_racket && (
              <div>
                <dt>{t('favoriteRacketLabel')}</dt>
                <dd>
                  <bdi>{profile.favorite_racket}</bdi>
                </dd>
              </div>
            )}
            {profile.bio && (
              <div className="seller-dl-wide">
                <dt>{t('bioLabel')}</dt>
                <dd>
                  <bdi>{profile.bio}</bdi>
                </dd>
              </div>
            )}
          </dl>
        </section>

        <section className="admin-section" aria-labelledby="seller-capacity-heading">
          <div className="admin-section-head">
            <div>
              <h2 id="seller-capacity-heading">{t('capacityHeading')}</h2>
              <p className="field-hint">{t('capacityHint')}</p>
            </div>
            <Link href={`/admin/listings?seller=${profile.public_id}`} className="admin-card-action">
              {t('viewSellerListings')}
            </Link>
          </div>

          <div className="admin-kpi-grid">
            <article className="admin-kpi-card">
              <span className="admin-kpi-label">{t('effectiveAllowanceLabel')}</span>
              <strong className="admin-kpi-value">{allowance.effective_limit.toLocaleString(locale)}</strong>
              <span className="admin-kpi-meta">
                {allowance.override_limit !== null
                  ? t('customAllowanceActive', {
                      defaultLimit: allowance.default_limit.toLocaleString(locale),
                    })
                  : t('defaultAllowanceActive')}
              </span>
            </article>
            <article className="admin-kpi-card">
              <span className="admin-kpi-label">{t('currentUsageLabel')}</span>
              <strong className="admin-kpi-value">{allowance.used_count.toLocaleString(locale)}</strong>
              <span className="admin-kpi-meta">
                {t('usageBreakdown', {
                  active: allowance.active_count.toLocaleString(locale),
                  pending: allowance.pending_count.toLocaleString(locale),
                })}
              </span>
            </article>
            <article className="admin-kpi-card">
              <span className="admin-kpi-label">{t('remainingCapacityLabel')}</span>
              <strong className="admin-kpi-value">{allowance.remaining_count.toLocaleString(locale)}</strong>
              <span className="admin-kpi-meta">
                {allowance.over_limit ? t('overLimitNote') : t('capacityRuleNote')}
              </span>
            </article>
            <article className="admin-kpi-card">
              <span className="admin-kpi-label">{t('publicListingsCountLabel')}</span>
              <strong className="admin-kpi-value">
                {listing_counts.public_visible.toLocaleString(locale)}
              </strong>
              <span className="admin-kpi-meta">
                {t('totalListingsMeta', { total: listing_counts.total.toLocaleString(locale) })}
              </span>
            </article>
          </div>

          <div className="seller-capacity-meter" aria-hidden="true">
            <div
              className={`seller-capacity-fill${allowance.over_limit ? ' is-over' : ''}`}
              style={{ width: `${usageRatio}%` }}
            />
          </div>

          <h3 className="admin-group-title seller-sub-heading">{t('lifecycleCountsHeading')}</h3>
          <div className="inventory-counts">
            {LISTING_STATUSES.map((status) => (
              <Link
                key={status}
                href={`/admin/listings?seller=${profile.public_id}&status=${status}`}
              >
                {statusLabel(status)}{' '}
                <strong>{listing_counts[status].toLocaleString(locale)}</strong>
              </Link>
            ))}
          </div>
        </section>

        <section className="admin-section" aria-labelledby="seller-engagement-heading">
          <div className="admin-section-head">
            <div>
              <h2 id="seller-engagement-heading">{t('engagementHeading')}</h2>
              <p className="field-hint">
                {t('engagementHint', { endDate: engagement_30d.window_end_utc })}
              </p>
            </div>
          </div>

          <div className="admin-kpi-grid">
            <article className="admin-kpi-card">
              <span className="admin-kpi-label">{analyticsT('views')}</span>
              <strong className="admin-kpi-value">{engagement_30d.views.toLocaleString(locale)}</strong>
              <span className="admin-kpi-meta">{ov('kpiWindow30d')}</span>
            </article>
            <article className="admin-kpi-card">
              <span className="admin-kpi-label">{analyticsT('contacts')}</span>
              <strong className="admin-kpi-value">{engagement_30d.contacts.toLocaleString(locale)}</strong>
              <span className="admin-kpi-meta">{ov('kpiContactsCaveat')}</span>
            </article>
          </div>
          <p className="field-hint admin-footnote">{t('engagementDisclaimer')}</p>
        </section>

        <div className="seller-controls-grid">
          <section className="admin-section" aria-labelledby="seller-account-type-heading">
            <div className="admin-section-head">
              <div>
                <h2 id="seller-account-type-heading">{t('accountTypeSectionHeading')}</h2>
              </div>
            </div>
            <SellerAccountTypeForm
              currentType={profile.account_type}
              individualDefault={allowance.individual_default}
              businessDefault={allowance.business_default}
              overrideLimit={allowance.override_limit}
              usedCount={allowance.used_count}
              action={submitAccountType}
            />
          </section>

          <section className="admin-section" aria-labelledby="seller-allowance-heading">
            <div className="admin-section-head">
              <div>
                <h2 id="seller-allowance-heading">{t('allowanceSectionHeading')}</h2>
              </div>
            </div>
            <SellerAllowanceForm
              defaultLimit={allowance.default_limit}
              overrideLimit={allowance.override_limit}
              effectiveLimit={allowance.effective_limit}
              usedCount={allowance.used_count}
              remainingCount={allowance.remaining_count}
              action={submitAllowance}
            />
          </section>
        </div>

        <section className="admin-section seller-moderation-section" aria-labelledby="seller-moderation-heading">
          <div className="admin-section-head">
            <div>
              <h2 id="seller-moderation-heading">{t('moderationSectionHeading')}</h2>
              <p className="field-hint">{t('moderationSectionHint')}</p>
            </div>
          </div>
          <SellerModerationForm currentStatus={profile.account_status} action={submitModeration} />
        </section>

        <section className="admin-section" aria-labelledby="seller-activity-heading">
          <div className="admin-section-head">
            <div>
              <h2 id="seller-activity-heading">{t('recentActivityHeading')}</h2>
              <p className="field-hint">{t('recentActivityHint')}</p>
            </div>
          </div>
          {recent_activity.length === 0 ? (
            <p className="admin-empty-state">{t('recentActivityEmpty')}</p>
          ) : (
            <ul className="admin-activity-list">
              {recent_activity.map((item) => {
                const actionKey = getActivityActionTranslationKey(item.action);
                return (
                  <li key={item.id} className="admin-activity-item">
                    <div className="admin-activity-main">
                      <div className="admin-activity-topline">
                        <span className={`admin-role-pill is-${item.actor_role}`}>
                          {ov(`roles.${item.actor_role}`)}
                        </span>
                        <span className="admin-activity-action">
                          {ov(`actions.${actionKey}`)}
                        </span>
                        <time dateTime={item.created_at} className="admin-activity-time">
                          {ov('utcTimestamp', { date: formatTimestamp(item.created_at, locale) })}
                        </time>
                      </div>
                      <div className="admin-activity-target">
                        <bdi>
                          {item.target_label ||
                            (item.target_type === 'listing'
                              ? ov('untitledListing')
                              : ov('sellerProfileTarget'))}
                        </bdi>
                      </div>
                      {item.reason && (
                        <p className="admin-activity-reason">
                          <bdi>{item.reason}</bdi>
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
