import type { ReactNode } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { AdminNavSectionId } from './types';

type AdminShellProps = {
  active: AdminNavSectionId;
  pendingCount?: number;
  openReportsCount?: number;
  children: ReactNode;
};

type LiveNavItem = {
  id: AdminNavSectionId;
  href: string;
  count?: number;
};

const PLANNED_SECTIONS: readonly AdminNavSectionId[] = [
  'sellers',
  'analytics',
  'audit',
  'settings',
  'operations',
];

export async function AdminShell({
  active,
  pendingCount,
  openReportsCount,
  children,
}: AdminShellProps) {
  const t = await getTranslations('admin');
  const locale = await getLocale();

  const liveItems: LiveNavItem[] = [
    { id: 'overview', href: '/admin' },
    { id: 'listings', href: '/admin/listings', count: pendingCount },
    { id: 'reports', href: '/admin/reports', count: openReportsCount },
  ];

  return (
    <div className="container admin-shell">
      <aside className="admin-sidebar" aria-label={t('navLabel')}>
        <div className="admin-sidebar-head">
          <p className="admin-eyebrow">{t('workspaceLabel')}</p>
          <Link href="/account" className="admin-back-link">
            {t('account')}
          </Link>
        </div>

        <nav className="admin-nav" aria-label={t('navLabel')}>
          <ul className="admin-nav-list">
            {liveItems.map((item) => {
              const isCurrent = active === item.id;
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className={`admin-nav-link${isCurrent ? ' is-active' : ''}`}
                    aria-current={isCurrent ? 'page' : undefined}
                  >
                    <span>{t(`nav.${item.id}`)}</span>
                    {typeof item.count === 'number' && (
                      <span
                        className={`admin-nav-badge${item.count > 0 ? ' is-alert' : ''}`}
                      >
                        {item.count.toLocaleString(locale)}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="admin-nav-future">
            <p className="admin-nav-group-label">{t('nav.upcomingHeading')}</p>
            <ul className="admin-nav-list">
              {PLANNED_SECTIONS.map((sectionId) => (
                <li key={sectionId}>
                  <span className="admin-nav-planned" aria-disabled="true">
                    <span>{t(`nav.${sectionId}`)}</span>
                    <span className="admin-planned-pill">{t('nav.planned')}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </aside>

      <main id="main" className="admin-main">
        {children}
      </main>
    </div>
  );
}
