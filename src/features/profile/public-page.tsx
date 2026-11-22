import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft, CircleDot, Info, MapPin, PackageOpen } from 'lucide-react';
import { PublicCard } from '@/features/marketplace/public-card';
import { ReportForm } from '@/features/reports/forms';
import { Link } from '@/i18n/navigation';
import { PAGE_SIZE } from '@/lib/domain/equipment';
import { parsePageParam, parseProfileHandle } from '@/lib/validation/shared';
import { fetchPublicProfile } from './server';
import { ShareProfile } from './share-profile';

export async function PublicProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { handle: rawHandle } = await params;
  const username = parseProfileHandle(rawHandle);
  if (!username) notFound();

  const query = await searchParams;
  const parsedPage = parsePageParam(query.page);
  if (!parsedPage.ok) notFound();
  const { page } = parsedPage;

  const t = await getTranslations('publicProfile');
  const a = await getTranslations('account');
  const market = await getTranslations('market');
  const lookup = await fetchPublicProfile(username, page);

  if (lookup.status === 'unavailable') {
    return (
      <main id="main" className="container storefront-page">
        <div className="empty-state">
          <p role="alert">{t('unavailable')}</p>
          <Link href="/" className="button secondary">
            {market('back')}
          </Link>
        </div>
      </main>
    );
  }
  if (lookup.status === 'not_found') notFound();

  const { profile } = lookup;
  const href = `/@${profile.username}`;
  const initial = profile.display_name.trim().charAt(0).toUpperCase() || '@';
  const totalPages = Math.max(1, Math.ceil(profile.total / PAGE_SIZE));
  const hasPagination = profile.total > PAGE_SIZE;

  return (
    <main id="main" className="container storefront-page">
      <div className="detail-breadcrumb">
        <Link href="/" className="detail-back-link">
          <ArrowLeft size={16} className="icon-directional" aria-hidden />
          <span>{market('back')}</span>
        </Link>
      </div>

      <header className="storefront-header">
        <div className="storefront-identity">
          <span className="avatar storefront-avatar" aria-hidden>
            {initial}
          </span>

          <div className="storefront-copy">
            <div className="storefront-eyebrow-row">
              <span className="storefront-handle">
                <bdi>@{profile.username}</bdi>
              </span>
              <span className="condition">{a(profile.account_type)}</span>
            </div>

            <h1>
              <bdi>{profile.display_name}</bdi>
            </h1>

            <div className="storefront-meta-row">
              <span className="storefront-meta-item">
                <MapPin size={15} aria-hidden />
                <span>
                  {a(`governorates.${profile.governorate_slug}`)}
                  {profile.district_text && (
                    <>
                      {' · '}
                      <bdi>{profile.district_text}</bdi>
                    </>
                  )}
                </span>
              </span>

              {profile.favorite_racket && (
                <span className="storefront-meta-item">
                  <CircleDot size={15} aria-hidden />
                  <span>
                    {t('favoriteRacket')}: <bdi>{profile.favorite_racket}</bdi>
                  </span>
                </span>
              )}
            </div>

            {profile.bio && (
              <p className="user-copy storefront-bio">
                <bdi>{profile.bio}</bdi>
              </p>
            )}

            {profile.account_type === 'business' && (
              <p className="storefront-business-note">
                <Info size={14} aria-hidden />
                <span>{t('businessNotice')}</span>
              </p>
            )}
          </div>
        </div>

        <div className="storefront-controls">
          <ShareProfile username={profile.username} publicId={profile.public_id} />
          <div className="storefront-report-wrap">
            <ReportForm type="profile" target={profile.public_id} />
          </div>
        </div>
      </header>

      <section className="storefront-listings" aria-labelledby="storefront-listings-heading">
        <div className="section-heading">
          <div>
            <h2 id="storefront-listings-heading">{t('listings')}</h2>
          </div>
          <span className="result-count">
            {market('count', { count: profile.total })}
          </span>
        </div>

        {profile.items.length ? (
          <div className="listing-grid">
            {profile.items.map((listing) => (
              <PublicCard key={listing.id} listing={listing} />
            ))}
          </div>
        ) : (
          <div className="empty-state storefront-empty">
            <span className="storefront-empty-icon" aria-hidden>
              <PackageOpen size={24} />
            </span>
            <h3>{t('empty')}</h3>
            <p>{t('emptyHint')}</p>
            <Link href="/" className="button secondary">
              {t('browseAll')}
            </Link>
          </div>
        )}

        {hasPagination && (
          <nav className="storefront-pagination" aria-label={t('pages')}>
            {page > 1 && (
              <Link href={`${href}?page=${page - 1}`} className="button secondary">
                {t('previous')}
              </Link>
            )}
            <span className="storefront-page-indicator">
              {t('page', { page, pages: totalPages })}
            </span>
            {page * PAGE_SIZE < profile.total && (
              <Link href={`${href}?page=${page + 1}`} className="button secondary">
                {t('next')}
              </Link>
            )}
          </nav>
        )}
      </section>
    </main>
  );
}
