import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
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
  const lookup = await fetchPublicProfile(username, page);

  if (lookup.status === 'unavailable') {
    return (
      <main id="main" className="container account-page">
        <p role="alert">{t('unavailable')}</p>
      </main>
    );
  }
  if (lookup.status === 'not_found') notFound();

  const { profile } = lookup;
  const href = `/@${profile.username}`;

  return (
    <main id="main" className="container account-page">
      <header>
        <p>
          <bdi>@{profile.username}</bdi> · {a(profile.account_type)}
        </p>
        <h1>
          <bdi>{profile.display_name}</bdi>
        </h1>
        <p>
          {a(`governorates.${profile.governorate_slug}`)}
          {profile.district_text && (
            <>
              {' '}
              · <bdi>{profile.district_text}</bdi>
            </>
          )}
        </p>
        {profile.bio && (
          <p className="user-copy">
            <bdi>{profile.bio}</bdi>
          </p>
        )}
        {profile.favorite_racket && (
          <p>
            {a('favorite_racket')}: <bdi>{profile.favorite_racket}</bdi>
          </p>
        )}
        <ShareProfile username={profile.username} publicId={profile.public_id} />
        <ReportForm type="profile" target={profile.public_id} />
      </header>
      <h2>{t('listings')}</h2>
      {profile.items.length ? (
        <div className="listing-grid">
          {profile.items.map((listing) => (
            <PublicCard key={listing.id} listing={listing} />
          ))}
        </div>
      ) : (
        <p>{t('empty')}</p>
      )}
      <nav aria-label={t('pages')}>
        {page > 1 && <Link href={`${href}?page=${page - 1}`}>{t('previous')}</Link>}{' '}
        {page * PAGE_SIZE < profile.total && (
          <Link href={`${href}?page=${page + 1}`}>{t('next')}</Link>
        )}
      </nav>
    </main>
  );
}
