import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { requireAdminAccess } from '@/features/admin/server';
import { Link } from '@/i18n/navigation';
import { PAGE_SIZE } from '@/lib/domain/equipment';
import { parsePageParam } from '@/lib/validation/shared';
import { ResolveForm } from './forms';
import { parseAdminReportsPage } from './validation';

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; done?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const t = await getTranslations('reports');
  const gate = await requireAdminAccess(locale, { requireMfa: true });

  if (gate.status === 'unavailable') {
    return (
      <main id="main" className="container account-page">
        <p role="alert">{t('unavailable')}</p>
      </main>
    );
  }

  const parsedPage = parsePageParam(query.page);
  if (!parsedPage.ok) notFound();
  const { page } = parsedPage;

  const result = await gate.client.rpc('admin_reports', { p_page: page });
  const reportsPage = result.error ? null : parseAdminReportsPage(result.data);

  return (
    <main id="main" className="container account-page">
      <Link href="/admin">{t('admin')}</Link>
      <h1>{t('queue')}</h1>
      {query.done === '1' && <p role="status">{t('resolved')}</p>}
      {!reportsPage ? (
        <p role="alert">{t('unavailable')}</p>
      ) : (
        <>
          <p>{t('count', { count: reportsPage.total })}</p>
          {reportsPage.items.map((item) => (
            <section key={item.id} className="disclosure">
              <h2>
                <bdi>{item.title || `@${item.username}`}</bdi>
              </h2>
              <p>{t(item.reason_code)}</p>
              <p className="user-copy">{item.details}</p>
              <Link
                href={
                  item.target_type === 'listing'
                    ? `/equipment/${item.listing_id}`
                    : `/@${item.username}`
                }
                target="_blank"
                rel="noreferrer"
              >
                {t('view')}
              </Link>
              <ResolveForm
                id={item.id}
                version={item.version}
                targetVersion={item.target_version}
                type={item.target_type}
              />
            </section>
          ))}
          <nav aria-label={t('pages')}>
            {page > 1 && <Link href={`/admin/reports?page=${page - 1}`}>{t('previous')}</Link>}{' '}
            {page * PAGE_SIZE < reportsPage.total && (
              <Link href={`/admin/reports?page=${page + 1}`}>{t('next')}</Link>
            )}
          </nav>
        </>
      )}
    </main>
  );
}
