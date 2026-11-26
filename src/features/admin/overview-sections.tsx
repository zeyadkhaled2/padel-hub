import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type {
  AdminActivityItem,
  AdminDashboardOverview,
  AdminNeedsAttention,
  AdminOverviewKpis,
  AdminOverviewTrends,
} from './types';
import {
  buildRecentEngagementSeries,
  getActivityActionTranslationKey,
} from './validation';

function formatUtcTimestamp(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(parsed);
}

function formatUtcDay(isoDay: string, locale: string): string {
  const parsed = new Date(`${isoDay}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return isoDay;
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}

export async function NeedsAttentionPanel({
  attention,
}: {
  attention: AdminNeedsAttention;
}) {
  const t = await getTranslations('admin.overview');
  const locale = await getLocale();
  const oldestPending = formatUtcTimestamp(attention.oldest_pending_submitted_at, locale);
  const oldestReport = formatUtcTimestamp(attention.oldest_open_report_at, locale);
  const allClear = attention.pending_listings === 0 && attention.open_reports === 0;

  return (
    <section className="admin-section" aria-labelledby="admin-attention-heading">
      <div className="admin-section-head">
        <div>
          <h2 id="admin-attention-heading">{t('attentionHeading')}</h2>
          <p className="field-hint">{t('attentionHint')}</p>
        </div>
      </div>

      {allClear && (
        <p className="admin-clear-banner">
          {t('allClear')}
        </p>
      )}

      <div className="admin-attention-grid">
        <article
          className={`admin-attention-card${attention.pending_listings > 0 ? ' is-priority' : ''}`}
        >
          <div className="admin-attention-top">
            <span className="admin-kpi-label">{t('attentionPending')}</span>
            <span className="admin-kpi-value">
              {attention.pending_listings.toLocaleString(locale)}
            </span>
          </div>
          <p className="field-hint">
            {oldestPending
              ? t('oldestWaiting', { date: oldestPending })
              : t('noPendingWaiting')}
          </p>
          <Link href="/admin/listings?status=pending&sort=pending" className="admin-card-action">
            {t('goPendingQueue')}
          </Link>
        </article>

        <article
          className={`admin-attention-card${attention.open_reports > 0 ? ' is-priority' : ''}`}
        >
          <div className="admin-attention-top">
            <span className="admin-kpi-label">{t('attentionReports')}</span>
            <span className="admin-kpi-value">
              {attention.open_reports.toLocaleString(locale)}
            </span>
          </div>
          <p className="field-hint">
            {oldestReport
              ? t('oldestReport', { date: oldestReport })
              : t('noOpenReports')}
          </p>
          <Link href="/admin/reports" className="admin-card-action">
            {t('goReportsQueue')}
          </Link>
        </article>

        <article className="admin-attention-card">
          <div className="admin-attention-top">
            <span className="admin-kpi-label">{t('attentionSuspended')}</span>
            <span className="admin-kpi-value">
              {attention.suspended_sellers.toLocaleString(locale)}
            </span>
          </div>
          <p className="field-hint">{t('suspendedHint')}</p>
          <Link href="/admin/sellers?status=suspended" className="admin-card-action">
            {t('goSuspendedSellers')}
          </Link>
        </article>
      </div>
    </section>
  );
}

export async function KpiSummaryGrid({ kpis }: { kpis: AdminOverviewKpis }) {
  const t = await getTranslations('admin.overview');
  const analyticsT = await getTranslations('analytics');
  const locale = await getLocale();

  const soldOrTraded = kpis.listings_sold + kpis.listings_traded;
  const nonPublicListings =
    kpis.listings_draft + kpis.listings_archived + kpis.listings_removed;

  return (
    <section className="admin-section" aria-labelledby="admin-kpi-heading">
      <div className="admin-section-head">
        <div>
          <h2 id="admin-kpi-heading">{t('kpiHeading')}</h2>
          <p className="field-hint">{t('kpiHint')}</p>
        </div>
      </div>

      <div className="admin-kpi-groups">
        <div className="admin-kpi-group">
          <h3 className="admin-group-title">{t('groupSellers')}</h3>
          <div className="admin-kpi-grid">
            <article className="admin-kpi-card">
              <span className="admin-kpi-label">{t('kpiSellersTotal')}</span>
              <strong className="admin-kpi-value">
                {kpis.sellers_total.toLocaleString(locale)}
              </strong>
              {kpis.sellers_hidden > 0 && (
                <span className="admin-kpi-meta">
                  {t('kpiSellersHiddenMeta', {
                    count: kpis.sellers_hidden.toLocaleString(locale),
                  })}
                </span>
              )}
            </article>

            <article className="admin-kpi-card">
              <span className="admin-kpi-label">{t('kpiSellersActive')}</span>
              <strong className="admin-kpi-value">
                {kpis.sellers_active.toLocaleString(locale)}
              </strong>
            </article>

            <article className="admin-kpi-card">
              <span className="admin-kpi-label">{t('kpiSellersSuspended')}</span>
              <strong className="admin-kpi-value">
                {kpis.sellers_suspended.toLocaleString(locale)}
              </strong>
            </article>
          </div>
        </div>

        <div className="admin-kpi-group">
          <h3 className="admin-group-title">{t('groupListings')}</h3>
          <div className="admin-kpi-grid">
            <article className="admin-kpi-card">
              <span className="admin-kpi-label">{t('kpiListingsTotal')}</span>
              <strong className="admin-kpi-value">
                {kpis.listings_total.toLocaleString(locale)}
              </strong>
              <span className="admin-kpi-meta">
                {t('kpiListingsOtherMeta', {
                  count: nonPublicListings.toLocaleString(locale),
                })}
              </span>
            </article>

            <article className="admin-kpi-card">
              <span className="admin-kpi-label">{t('kpiListingsActive')}</span>
              <strong className="admin-kpi-value">
                {kpis.listings_active.toLocaleString(locale)}
              </strong>
            </article>

            <article className="admin-kpi-card">
              <span className="admin-kpi-label">{t('kpiListingsPending')}</span>
              <strong className="admin-kpi-value">
                {kpis.listings_pending.toLocaleString(locale)}
              </strong>
              <Link href="/admin/listings?status=pending&sort=pending" className="admin-kpi-link">
                {t('reviewQueueLink')}
              </Link>
            </article>

            <article className="admin-kpi-card">
              <span className="admin-kpi-label">{t('kpiListingsRejected')}</span>
              <strong className="admin-kpi-value">
                {kpis.listings_rejected.toLocaleString(locale)}
              </strong>
            </article>

            <article className="admin-kpi-card">
              <span className="admin-kpi-label">{t('kpiListingsSoldTraded')}</span>
              <strong className="admin-kpi-value">
                {soldOrTraded.toLocaleString(locale)}
              </strong>
              <span className="admin-kpi-meta">
                {t('kpiSoldTradedSplit', {
                  sold: kpis.listings_sold.toLocaleString(locale),
                  traded: kpis.listings_traded.toLocaleString(locale),
                })}
              </span>
            </article>
          </div>
        </div>

        <div className="admin-kpi-group">
          <h3 className="admin-group-title">{t('groupModerationActivity')}</h3>
          <div className="admin-kpi-grid">
            <article className="admin-kpi-card">
              <span className="admin-kpi-label">{t('kpiOpenReports')}</span>
              <strong className="admin-kpi-value">
                {kpis.open_reports.toLocaleString(locale)}
              </strong>
              <Link href="/admin/reports" className="admin-kpi-link">
                {t('openReportsLink')}
              </Link>
            </article>

            <article className="admin-kpi-card">
              <span className="admin-kpi-label">{analyticsT('views')}</span>
              <strong className="admin-kpi-value">
                {kpis.views_30d.toLocaleString(locale)}
              </strong>
              <span className="admin-kpi-meta">{t('kpiWindow30d')}</span>
            </article>

            <article className="admin-kpi-card">
              <span className="admin-kpi-label">{analyticsT('contacts')}</span>
              <strong className="admin-kpi-value">
                {kpis.contacts_30d.toLocaleString(locale)}
              </strong>
              <span className="admin-kpi-meta">{t('kpiContactsCaveat')}</span>
            </article>
          </div>
        </div>
      </div>

      <p className="field-hint admin-footnote">{analyticsT('notice')}</p>
    </section>
  );
}

export async function MarketplaceTrendsSection({
  trends,
  windowEndUtc,
}: {
  trends: AdminOverviewTrends;
  windowEndUtc: string;
}) {
  const t = await getTranslations('admin.overview');
  const locale = await getLocale();

  const daily7d = buildRecentEngagementSeries(trends.daily_engagement, windowEndUtc, 7);

  const trendRows = [
    {
      key: 'views',
      label: t('trendViews'),
      d7: trends.period_7d.views,
      d30: trends.period_30d.views,
    },
    {
      key: 'contacts',
      label: t('trendContacts'),
      d7: trends.period_7d.contacts,
      d30: trends.period_30d.contacts,
    },
    {
      key: 'new_sellers',
      label: t('trendNewSellers'),
      d7: trends.period_7d.new_sellers,
      d30: trends.period_30d.new_sellers,
    },
    {
      key: 'new_listings',
      label: t('trendNewListings'),
      d7: trends.period_7d.new_listings,
      d30: trends.period_30d.new_listings,
    },
    {
      key: 'submitted_listings',
      label: t('trendSubmittedListings'),
      d7: trends.period_7d.submitted_listings,
      d30: trends.period_30d.submitted_listings,
    },
    {
      key: 'new_reports',
      label: t('trendNewReports'),
      d7: trends.period_7d.new_reports,
      d30: trends.period_30d.new_reports,
    },
  ];

  return (
    <section className="admin-section" aria-labelledby="admin-trends-heading">
      <div className="admin-section-head">
        <div>
          <h2 id="admin-trends-heading">{t('trendsHeading')}</h2>
          <p className="field-hint">{t('trendsHint', { endDate: windowEndUtc })}</p>
        </div>
      </div>

      <div className="admin-trends-layout">
        <div className="admin-panel">
          <h3 className="admin-panel-title">{t('trendsComparisonTitle')}</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">{t('trendMetricCol')}</th>
                  <th scope="col" className="admin-num">
                    {t('trend7dCol')}
                  </th>
                  <th scope="col" className="admin-num">
                    {t('trend30dCol')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {trendRows.map((row) => (
                  <tr key={row.key}>
                    <th scope="row">{row.label}</th>
                    <td className="admin-num">{row.d7.toLocaleString(locale)}</td>
                    <td className="admin-num">{row.d30.toLocaleString(locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="admin-panel">
          <div className="admin-panel-head">
            <h3 className="admin-panel-title">{t('dailyEngagementTitle')}</h3>
            {daily7d.hasActivity && (
              <div className="admin-legend" aria-hidden="true">
                <span className="admin-legend-item">
                  <span className="admin-legend-swatch is-views" />
                  {t('dailyLegendViews')}
                </span>
                <span className="admin-legend-item">
                  <span className="admin-legend-swatch is-contacts" />
                  {t('dailyLegendContacts')}
                </span>
              </div>
            )}
          </div>
          {!daily7d.hasActivity ? (
            <p className="field-hint">{t('dailyEngagementEmpty')}</p>
          ) : (
            <ul className="admin-bars" aria-label={t('dailyEngagementTitle')}>
              {daily7d.points.map((point) => {
                const viewPct =
                  daily7d.maxViews > 0 ? Math.round((point.views / daily7d.maxViews) * 100) : 0;
                const contactPct =
                  daily7d.maxContacts > 0
                    ? Math.round((point.contacts / daily7d.maxContacts) * 100)
                    : 0;
                return (
                  <li key={point.day} className="admin-bar-row">
                    <span className="admin-bar-day">{formatUtcDay(point.day, locale)}</span>
                    <div className="admin-bar-tracks">
                      <div className="admin-bar-line">
                        <span
                          className="admin-bar-fill is-views"
                          style={{ width: `${Math.max(viewPct, point.views > 0 ? 6 : 0)}%` }}
                        />
                      </div>
                      <div className="admin-bar-line">
                        <span
                          className="admin-bar-fill is-contacts"
                          style={{
                            width: `${Math.max(contactPct, point.contacts > 0 ? 6 : 0)}%`,
                          }}
                        />
                      </div>
                    </div>
                    <span className="admin-bar-counts">
                      {t('dailyBarSummary', {
                        views: point.views.toLocaleString(locale),
                        contacts: point.contacts.toLocaleString(locale),
                      })}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="field-hint admin-footnote">{t('trendsLimitationNote')}</p>
        </div>
      </div>
    </section>
  );
}

export async function RecentActivitySection({
  items,
}: {
  items: readonly AdminActivityItem[];
}) {
  const t = await getTranslations('admin.overview');
  const locale = await getLocale();

  return (
    <section className="admin-section" aria-labelledby="admin-activity-heading">
      <div className="admin-section-head">
        <div>
          <h2 id="admin-activity-heading">{t('activityHeading')}</h2>
          <p className="field-hint">{t('activityHint')}</p>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="admin-empty-state">{t('activityEmpty')}</p>
      ) : (
        <ul className="admin-activity-list">
          {items.map((item) => {
            const actionKey = getActivityActionTranslationKey(item.action);
            const timestamp = formatUtcTimestamp(item.created_at, locale);

            return (
              <li key={item.id} className="admin-activity-item">
                <div className="admin-activity-main">
                  <div className="admin-activity-topline">
                    <span className={`admin-role-pill is-${item.actor_role}`}>
                      {t(`roles.${item.actor_role}`)}
                    </span>
                    <span className="admin-activity-action">
                      {t(`actions.${actionKey}`)}
                    </span>
                    {timestamp && (
                      <time dateTime={item.created_at} className="admin-activity-time">
                        {t('utcTimestamp', { date: timestamp })}
                      </time>
                    )}
                  </div>

                  <div className="admin-activity-target">
                    <bdi>
                      {item.target_label ||
                        (item.target_type === 'listing'
                          ? t('untitledListing')
                          : t('sellerProfileTarget'))}
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
  );
}

export async function AdminOverviewDashboard({
  overview,
}: {
  overview: AdminDashboardOverview;
}) {
  return (
    <>
      <NeedsAttentionPanel attention={overview.needs_attention} />
      <KpiSummaryGrid kpis={overview.kpis} />
      <MarketplaceTrendsSection
        trends={overview.trends}
        windowEndUtc={overview.window_end_utc}
      />
    </>
  );
}
