import { Suspense } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { ACCOUNT_TYPES, EGYPT_GOVERNORATES, EQUIPMENT_CATEGORIES, LISTING_STATUSES, MAX_PAGE, PAGE_SIZE } from '@/lib/domain/equipment';
import { AdminShell } from './shell';
import { AdminPhotoPreview } from './photo-preview';
import { requireAdminAccess } from './server';
import { INVENTORY_SORTS, inventoryHref, inventoryPageSchema, parseInventoryQuery, type InventoryParams } from './inventory';

export async function AdminInventoryPage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<InventoryParams>;
}) {
  const { locale } = await params;
  const raw = await searchParams;
  const gate = await requireAdminAccess(locale, { requireMfa: true });
  const admin = await getTranslations('admin');
  if (gate.status !== 'ok') return <AdminShell active="listings"><p role="alert">{admin('unavailable')}</p></AdminShell>;
  return <Suspense fallback={<main id="main" className="container admin-loading" aria-busy="true"><p role="status">{admin('overview.loading')}</p></main>}>
    <AdminInventoryContent locale={locale} raw={raw} client={gate.client} />
  </Suspense>;
}

async function AdminInventoryContent({ locale, raw, client }: { locale: string; raw: InventoryParams; client: SupabaseClient }) {
  const t = await getTranslations('admin.inventory');
  const a = await getTranslations('admin');
  const e = await getTranslations('listingEditor');
  const p = await getTranslations('profile');
  const photos = await getTranslations('photos');
  const parsed = parseInventoryQuery(raw);
  if (!parsed.success) return <AdminShell active="listings"><p role="alert">{t('invalid')}</p><Link href="/admin/listings">{t('clear')}</Link></AdminShell>;
  const query = parsed.data;
  const result = await client.rpc('admin_listing_inventory', {
    p_query: query.q, p_status: query.status, p_category: query.category,
    p_account_type: query.account, p_governorate: query.governorate, p_sort: query.sort, p_page: query.page,
  });
  const data = result.error ? null : inventoryPageSchema.safeParse(result.data);
  const inventory = data?.success ? data.data : null;
  const statusLabel = (status: string) => status === 'active' ? t('active') : e(status);
  const date = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  const fields = [
    { name: 'status', values: LISTING_STATUSES, label: statusLabel },
    { name: 'category', values: EQUIPMENT_CATEGORIES, label: (v: string) => photos(v) },
    { name: 'account', values: ACCOUNT_TYPES, label: (v: string) => p(v) },
    { name: 'governorate', values: EGYPT_GOVERNORATES, label: (v: string) => p(`governorates.${v}`) },
  ] as const;
  return <AdminShell active="listings" pendingCount={inventory?.counts?.pending ?? 0}>
    <header className="admin-page-header"><div><h1>{t('title')}</h1><p className="field-hint">{t('description')}</p></div></header>
    {raw.done === '1' && <p role="status" className="admin-status-banner">{a('saved')}</p>}
    {inventory && <nav className="inventory-counts" aria-label={t('counts')}>
      {LISTING_STATUSES.map(status => <Link key={status} href={inventoryHref({ ...query, status }, 1)} aria-current={query.status === status ? 'page' : undefined}>{statusLabel(status)} <strong>{(inventory.counts?.[status] ?? 0).toLocaleString(locale)}</strong></Link>)}
    </nav>}
    <form action={`/${locale}/admin/listings`} method="get" className="inventory-filters">
      <label className="inventory-search">{t('search')}<input name="q" defaultValue={query.q} maxLength={120} type="search" placeholder={t('searchHint')} /></label>
      {fields.map(field => <label key={field.name}>{t(field.name)}<select name={field.name} defaultValue={query[field.name]}><option value="">{t('all')}</option>{field.values.map(value => <option key={value} value={value}>{field.label(value)}</option>)}</select></label>)}
      <label>{t('sort')}<select name="sort" defaultValue={query.sort}>{INVENTORY_SORTS.map(sort => <option key={sort} value={sort}>{t(`sorts.${sort}`)}</option>)}</select></label>
      <div className="inventory-filter-actions"><button className="button primary">{t('apply')}</button><Link href="/admin/listings" className="button secondary">{t('clear')}</Link></div>
    </form>
    {!inventory ? <p role="alert" className="admin-alert">{a('unavailable')}</p> : <>
      <p className="field-hint">{t('results', { count: inventory.total, page: query.page })}</p>
      {inventory.items.length === 0 ? <div className="admin-empty-state"><p>{Object.values(inventory.counts ?? {}).some(Boolean) ? t('noResults') : t('empty')}</p><Link href="/admin/listings">{t('clear')}</Link></div> :
        <table className="inventory-table"><caption className="sr-only">{t('title')}</caption><thead><tr>{['listing','seller','price','status','dates','action'].map(key => <th key={key} scope="col">{t(key)}</th>)}</tr></thead><tbody>
          {inventory.items.map(item => <tr key={item.id}>
            <td><div className="inventory-listing">{item.cover_media_id ? <AdminPhotoPreview thumbnail fallback={t('noPhoto')} src={`/api/admin/listings/${item.id}/photos/${item.cover_media_id}?variant=thumb`} alt="" /> : <span className="inventory-no-photo">{t('noPhoto')}</span>}<div><bdi>{item.title || a('overview.untitledListing')}</bdi><small>{photos(item.category)}</small></div></div></td>
            <td><bdi>{item.display_name || t('unknownSeller')}</bdi>{item.username && <small><bdi>@{item.username}</bdi></small>}</td>
            <td>{item.price_egp === null ? (item.offer_type === 'swap' ? e('swap') : '—') : new Intl.NumberFormat(locale, { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(item.price_egp)}{item.offer_type === 'both' && <small>{e('both')}</small>}</td>
            <td><span className="inventory-status">{statusLabel(item.status)}</span><small>{t(item.public_visible ? 'visible' : 'private')}</small></td>
            <td><small>{t(item.submitted_at ? 'submitted' : 'created')}: <time dateTime={item.submitted_at || item.created_at}>{date(item.submitted_at || item.created_at)}</time></small><small>{t('updated')}: <time dateTime={item.updated_at}>{date(item.updated_at)}</time></small></td>
            <td><Link prefetch={false} className="admin-page-link" href={`/admin/listings/${item.id}?returnTo=${encodeURIComponent(inventoryHref(query))}`}>{item.status === 'pending' ? a('review') : t('inspect')}</Link></td>
          </tr>)}
        </tbody></table>}
      <nav className="admin-pagination" aria-label={t('pages')}>
        {query.page > 1 && <Link className="admin-page-link" href={inventoryHref(query, query.page - 1)}>{a('previous')}</Link>}
        {query.page < MAX_PAGE && query.page * PAGE_SIZE < inventory.total && <Link className="admin-page-link" href={inventoryHref(query, query.page + 1)}>{a('next')}</Link>}
      </nav>
    </>}
  </AdminShell>;
}
