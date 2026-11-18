import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { publicClient, type PublicListing } from '@/features/marketplace/public-data';
import { PublicCard } from '@/features/marketplace/public-card';
import { Link } from '@/i18n/navigation';
import { ShareProfile } from './share-profile';

export async function PublicProfilePage({ params, searchParams }: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { handle: rawHandle } = await params;
  let handle: string;
  try { handle = decodeURIComponent(rawHandle); } catch { notFound(); }
  if (!/^@[A-Za-z0-9_]{3,24}$/.test(handle)) notFound();
  const query = await searchParams;
  const page = query.page === undefined ? 1 : /^\d{1,5}$/.test(query.page) ? Number(query.page) : 0;
  if (page < 1 || page > 10000) notFound();
  const t = await getTranslations('publicProfile');
  const a = await getTranslations('account');
  const client = publicClient();
  const result = client ? await client.rpc('get_public_profile', { p_username: handle.slice(1), p_page: page }) : null;
  if (!result || result.error) return <main id="main" className="container account-page"><p role="alert">{t('unavailable')}</p></main>;
  const profile = result.data as { public_id: string; username: string; display_name: string; account_type: string; bio: string | null; governorate_slug: string; district_text: string | null; favorite_racket: string | null; items: PublicListing[]; total: number } | null;
  if (!profile) notFound();
  const href = `/@${profile.username}`;
  return <main id="main" className="container account-page">
    <header><p><bdi>@{profile.username}</bdi> · {a(profile.account_type)}</p><h1><bdi>{profile.display_name}</bdi></h1>
      <p>{a(`governorates.${profile.governorate_slug}`)}{profile.district_text && <> · <bdi>{profile.district_text}</bdi></>}</p>
      {profile.bio && <p className="user-copy"><bdi>{profile.bio}</bdi></p>}
      {profile.favorite_racket && <p>{a('favorite_racket')}: <bdi>{profile.favorite_racket}</bdi></p>}
      <ShareProfile username={profile.username} publicId={profile.public_id} />
    </header>
    <h2>{t('listings')}</h2>
    {profile.items.length ? <div className="listing-grid">{profile.items.map(listing => <PublicCard key={listing.id} listing={listing} />)}</div> : <p>{t('empty')}</p>}
    <nav aria-label={t('pages')}>
      {page > 1 && <Link href={`${href}?page=${page-1}`}>{t('previous')}</Link>}{' '}
      {page*24 < profile.total && <Link href={`${href}?page=${page+1}`}>{t('next')}</Link>}
    </nav>
  </main>;
}
