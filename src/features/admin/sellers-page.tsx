import { Suspense } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  EGYPT_GOVERNORATES,
  MAX_PAGE,
  PAGE_SIZE,
} from '@/lib/domain/equipment';
import { AdminShell } from './shell';
import { requireAdminAccess } from './server';
import {
  parseSellersQuery,
  SELLER_SORTS,
  SELLER_VISIBILITIES,
  sellersHref,
  sellerInventoryPageSchema,
  type SellerQueryParams,
} from './sellers';

export async function AdminSellersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SellerQueryParams>;
}) {
  const { locale } = await params;
  const raw = await searchParams;
  const gate = await requireAdminAccess(locale, { requireMfa: true });
  const admin = await getTranslations('admin');

  if (gate.status !== 'ok') {
    return (
      <AdminShell active="sellers">
        <p role="alert" className="admin-alert">
          {admin('unavailable')}
        </p>
      </AdminShell>
    );
  }

  return (
    <Suspense
      fallback={
        <main id="main" className="container admin-loading" aria-busy="true">
          <p role="status">{admin('overview.loading')}</p>
        </main>
      }
    >
      <AdminSellersContent locale={locale} raw={raw} client={gate.client} />
    </Suspense>
  );
}

async function AdminSellersContent({
  locale,
  raw,
  client,
}: {
  locale: string;
  raw: SellerQueryParams;
  client: SupabaseClient;
}) {
  const t = await getTranslations('admin.sellers');
  const a = await getTranslations('admin');
  const inv = await getTranslations('admin.inventory');
  const p = await getTranslations('account');

  const parsed = parseSellersQuery(raw);
  if (!parsed.success) {
    return (
      <AdminShell active="sellers">
        <header className="admin-page-header">
          <div>
            <h1>{t('title')}</h1>
          </div>
        </header>
        <p role="alert" className="admin-alert">
          {t('invalidFilters')}
        </p>
        <Link href="/admin/sellers" className="text-link">
          {t('clearFilters')}
        </Link>
      </AdminShell>
    );
  }

  const query = parsed.data;
  const result = await client.rpc('admin_seller_inventory', {
    p_query: query.q,
    p_account_type: query.account,
    p_account_status: query.status,
    p_governorate: query.governorate,
    p_visibility: query.visibility,
    p_sort: query.sort,
    p_page: query.page,
  });
  const validated = result.error ? null : sellerInventoryPageSchema.safeParse(result.data);
  const data = validated?.success ? validated.data : null;

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value));

  const returnToHref = sellersHref(query);
  const currentTotal = data?.counts.total ?? 0;

  return (
    <AdminShell active="sellers">
      <header className="admin-page-header">
        <div>
          <h1>{t('title')}</h1>
          <p className="field-hint">{t('description')}</p>
          <p className="field-hint">{t('profileCountCaveat')}</p>
        </div>
      </header>

      {data && (
        <section aria-label={t('summaryHeading')} className="seller-summary-strip">
          <div className="admin-kpi-grid seller-summary-grid">
            <Link
              href="/admin/sellers"
              className={`admin-kpi-card seller-stat-link${!query.account && !query.status && !query.visibility && !query.governorate && !query.q ? ' is-current' : ''}`}
            >
              <span className="admin-kpi-label">{t('counts.total')}</span>
              <strong className="admin-kpi-value">{data.counts.total.toLocaleString(locale)}</strong>
              <span className="admin-kpi-meta">{t('counts.totalMeta')}</span>
            </Link>
            <Link
              href={sellersHref({ ...query, account: query.account === 'individual' ? '' : 'individual' }, 1)}
              className={`admin-kpi-card seller-stat-link${query.account === 'individual' ? ' is-current' : ''}`}
            >
              <span className="admin-kpi-label">{t('counts.personal')}</span>
              <strong className="admin-kpi-value">{data.counts.individual.toLocaleString(locale)}</strong>
              <span className="admin-kpi-meta">
                {t('counts.defaultAllowanceMeta', { limit: data.defaults.individual.toLocaleString(locale) })}
              </span>
            </Link>
            <Link
              href={sellersHref({ ...query, account: query.account === 'business' ? '' : 'business' }, 1)}
              className={`admin-kpi-card seller-stat-link${query.account === 'business' ? ' is-current' : ''}`}
            >
              <span className="admin-kpi-label">{t('counts.business')}</span>
              <strong className="admin-kpi-value">{data.counts.business.toLocaleString(locale)}</strong>
              <span className="admin-kpi-meta">
                {t('counts.defaultAllowanceMeta', { limit: data.defaults.business.toLocaleString(locale) })}
              </span>
            </Link>
            <Link
              href={sellersHref({ ...query, status: query.status === 'active' ? '' : 'active' }, 1)}
              className={`admin-kpi-card seller-stat-link${query.status === 'active' ? ' is-current' : ''}`}
            >
              <span className="admin-kpi-label">{t('counts.active')}</span>
              <strong className="admin-kpi-value">{data.counts.active.toLocaleString(locale)}</strong>
            </Link>
            <Link
              href={sellersHref({ ...query, status: query.status === 'suspended' ? '' : 'suspended' }, 1)}
              className={`admin-kpi-card seller-stat-link${query.status === 'suspended' ? ' is-current' : ''}`}
            >
              <span className="admin-kpi-label">{t('counts.suspended')}</span>
              <strong className="admin-kpi-value">{data.counts.suspended.toLocaleString(locale)}</strong>
            </Link>
            <Link
              href={sellersHref({ ...query, status: query.status === 'hidden' ? '' : 'hidden' }, 1)}
              className={`admin-kpi-card seller-stat-link${query.status === 'hidden' ? ' is-current' : ''}`}
            >
              <span className="admin-kpi-label">{t('counts.hidden')}</span>
              <strong className="admin-kpi-value">{data.counts.hidden.toLocaleString(locale)}</strong>
            </Link>
          </div>
        </section>
      )}

      <form action={`/${locale}/admin/sellers`} method="get" className="inventory-filters">
        <label className="inventory-search">
          {t('searchLabel')}
          <input
            name="q"
            type="search"
            defaultValue={query.q}
            maxLength={120}
            placeholder={t('searchPlaceholder')}
          />
        </label>
        <label>
          {t('accountTypeFilter')}
          <select name="account" defaultValue={query.account}>
            <option value="">{inv('all')}</option>
            {ACCOUNT_TYPES.map((type) => (
              <option key={type} value={type}>
                {p(type)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('statusFilter')}
          <select name="status" defaultValue={query.status}>
            <option value="">{inv('all')}</option>
            {ACCOUNT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {inv(`accounts.${status}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('governorateFilter')}
          <select name="governorate" defaultValue={query.governorate}>
            <option value="">{inv('all')}</option>
            {EGYPT_GOVERNORATES.map((gov) => (
              <option key={gov} value={gov}>
                {p(`governorates.${gov}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('visibilityFilter')}
          <select name="visibility" defaultValue={query.visibility}>
            <option value="">{inv('all')}</option>
            {SELLER_VISIBILITIES.map((vis) => (
              <option key={vis} value={vis}>
                {t(`visibilityOptions.${vis}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('sortLabel')}
          <select name="sort" defaultValue={query.sort}>
            {SELLER_SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {t(`sorts.${sort}`)}
              </option>
            ))}
          </select>
        </label>
        <div className="inventory-filter-actions">
          <button type="submit" className="button primary">
            {inv('apply')}
          </button>
          <Link href="/admin/sellers" className="button secondary">
            {t('clearFilters')}
          </Link>
        </div>
      </form>

      {!data ? (
        <p role="alert" className="admin-alert">
          {a('unavailable')}
        </p>
      ) : (
        <>
          <p className="field-hint">
            {t('resultsSummary', {
              count: data.total.toLocaleString(locale),
              page: query.page.toLocaleString(locale),
            })}
          </p>

          {data.items.length === 0 ? (
            <div className="admin-empty-state">
              <p>{currentTotal > 0 ? t('noResults') : t('empty')}</p>
              {currentTotal > 0 && (
                <Link href="/admin/sellers" className="text-link">
                  {t('clearFilters')}
                </Link>
              )}
            </div>
          ) : (
            <table className="inventory-table sellers-table">
              <caption className="sr-only">{t('title')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('columns.seller')}</th>
                  <th scope="col">{t('columns.account')}</th>
                  <th scope="col">{t('columns.visibility')}</th>
                  <th scope="col">{t('columns.capacity')}</th>
                  <th scope="col">{t('columns.created')}</th>
                  <th scope="col">{t('columns.action')}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((seller) => {
                  const used = seller.active_listings + seller.pending_listings;
                  const detailHref = `/admin/sellers/${seller.public_id}?returnTo=${encodeURIComponent(returnToHref)}`;
                  return (
                    <tr key={seller.public_id}>
                      <td>
                        <div className="seller-cell-primary">
                          <strong>
                            <bdi>{seller.display_name}</bdi>
                          </strong>
                          <small>
                            <bdi dir="ltr">@{seller.username}</bdi> · {p(`governorates.${seller.governorate_slug}`)}
                          </small>
                        </div>
                      </td>
                      <td>
                        <span className={`admin-seller-status is-${seller.account_status}`}>
                          {inv(`accounts.${seller.account_status}`)}
                        </span>
                        <small>{p(seller.account_type)}</small>
                      </td>
                      <td>
                        <span className="inventory-status">
                          {seller.is_public ? t('visibilityOptions.public') : t('visibilityOptions.private')}
                        </span>
                        {seller.is_public && !seller.public_profile_visible && (
                          <small>{t('visibilityBlockedByStatus')}</small>
                        )}
                      </td>
                      <td>
                        <div className="seller-capacity-cell">
                          <span>
                            {t('rowUsageSummary', {
                              active: seller.active_listings.toLocaleString(locale),
                              pending: seller.pending_listings.toLocaleString(locale),
                            })}
                          </span>
                          <small>
                            {t('rowAllowanceSummary', {
                              used: used.toLocaleString(locale),
                              limit: seller.effective_listing_limit.toLocaleString(locale),
                            })}
                            {seller.listing_limit_override !== null
                              ? ` · ${t('customOverrideTag')}`
                              : ''}
                          </small>
                        </div>
                      </td>
                      <td>
                        <time dateTime={seller.created_at}>{formatDate(seller.created_at)}</time>
                      </td>
                      <td>
                        <Link prefetch={false} className="admin-page-link" href={detailHref}>
                          {t('inspectSeller')}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {(query.page > 1 || (query.page < MAX_PAGE && query.page * PAGE_SIZE < data.total)) && (
            <nav className="admin-pagination" aria-label={t('pages')}>
              {query.page > 1 && (
                <Link className="admin-page-link" href={sellersHref(query, query.page - 1)}>
                  {a('previous')}
                </Link>
              )}
              {query.page < MAX_PAGE && query.page * PAGE_SIZE < data.total && (
                <Link className="admin-page-link" href={sellersHref(query, query.page + 1)}>
                  {a('next')}
                </Link>
              )}
            </nav>
          )}
        </>
      )}
    </AdminShell>
  );
}
