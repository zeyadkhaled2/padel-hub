/* eslint-disable @next/next/no-img-element -- Review photos bypass the shared image optimizer. */
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { verifiedClient } from '@/server/supabase/server';
import { Link } from '@/i18n/navigation';
import { MfaForm, ReviewForm } from './forms';
import { decideListing, type ReviewSnapshot } from './actions';

async function reviewer(locale: string) {
  const client = await verifiedClient();
  if (!client) redirect(`/${locale}/auth/signin`);
  const access = await client.rpc('get_my_admin_access');
  if (access.error) return { client, access: null };
  if (!access.data?.is_admin) notFound();
  return { client, access: access.data as { mfa_verified: boolean } };
}
export async function AdminPage({ params, searchParams }: { params: Promise<{locale:string}>; searchParams: Promise<{page?:string;done?:string}> }) {
  const { locale } = await params; const query = await searchParams;
  const { client, access } = await reviewer(locale); const t = await getTranslations('admin');
  if (!access) return <main id="main" className="container account-page"><p role="alert">{t('unavailable')}</p></main>;
  if (!access.mfa_verified) {
    const factors = await client.auth.mfa.listFactors();
    return <main id="main" className="container account-page"><Link href="/account">{t('account')}</Link><h1>{t('mfaTitle')}</h1><p>{t('mfaHint')}</p>{factors.error ? <p role="alert">{t('unavailable')}</p> : <MfaForm factor={factors.data.totp[0]?.id} />}</main>;
  }
  const page = z.coerce.number().int().min(1).max(10000).safeParse(query.page ?? 1);
  const result = await client.rpc('admin_pending_listings', { p_page: page.success ? page.data : 1 });
  const current = page.success ? page.data : 1;
  return <main id="main" className="container account-page"><Link href="/account">{t('account')}</Link><h1>{t('queue')}</h1>
    {['approve','reject'].includes(query.done ?? '') && <p role="status">{t('saved')}</p>}
    {result.error ? <p role="alert">{t('unavailable')}</p> : <><p>{t('count',{count:result.data.total})}</p><ul className="admin-queue">{result.data.items.map((item: {id:string;title:string;display_name:string}) => <li key={item.id}><Link href={`/admin/listings/${item.id}`} prefetch={false}><bdi>{item.title}</bdi></Link><span><bdi>{item.display_name}</bdi></span></li>)}</ul><nav className="category-links" aria-label={t('pages')}>
      {current>1 && <Link href={`/admin?page=${current-1}`}>{t('previous')}</Link>}{current*24<result.data.total && <Link href={`/admin?page=${current+1}`}>{t('next')}</Link>}</nav></>}
  </main>;
}
export async function AdminReviewPage({ params }: { params: Promise<{locale:string;id:string}> }) {
  const { locale, id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { client, access } = await reviewer(locale);
  const t = await getTranslations('admin'); const e = await getTranslations('listingEditor');
  if (!access) return <main id="main" className="container account-page"><p role="alert">{t('unavailable')}</p></main>;
  if (!access.mfa_verified) redirect(`/${locale}/admin`);
  const result = await client.rpc('admin_get_listing_review', {p_listing_id:id});
  if (result.error) return <main id="main" className="container account-page"><p role="alert">{t('unavailable')}</p><Link href="/admin">{t('queue')}</Link></main>;
  const snapshot = result.data as ReviewSnapshot;
  // Capture the reviewed snapshot in Next's encrypted action closure, rather
  // than serialize storage manifest keys as ordinary bound client arguments.
  async function submitReview(state: {message?: string; reason?: string}, form: FormData) {
    'use server';
    return decideListing(locale, snapshot, state, form);
  }
  const fields = ['category','title','brand_slug','brand_custom','model','description','governorate_slug','district_text','condition','condition_disclosure','offer_type','price_egp','is_negotiable','swap_preference','racket_damage_repair_disclosure','racket_year','racket_shape','racket_weight_grams','racket_purchase_date','balls_quantity_packaging','balls_availability_note'];
  return <main id="main" className="container account-page"><Link href="/admin">{t('queue')}</Link><h1>{t('review')}</h1><p className="form-notice">{t('reviewHint')}</p>
    <p><bdi>{String(snapshot.profile.display_name)} · @{String(snapshot.profile.username)}</bdi></p>
    <p>{t('eligibility',{visibility:snapshot.profile.is_public?t('yes'):t('no'),contact:snapshot.profile.public_contact_consent && snapshot.profile.has_contact?t('yes'):t('no'),status:String(snapshot.profile.account_status)})}</p>
    <dl className="review-details">{fields.filter(key => snapshot.listing[key] !== null && snapshot.listing[key] !== undefined).map(key => <div key={key}><dt>{e.has(key)?e(key):t(key)}</dt><dd><bdi>{typeof snapshot.listing[key]==='boolean' ? t(snapshot.listing[key]?'yes':'no') : String(snapshot.listing[key])}</bdi></dd></div>)}</dl>
    {snapshot.listing.status === 'pending' ? <><div className="photo-grid">{snapshot.media_manifest.map((item,index) => <figure key={item.media_id}><a href={`/api/admin/listings/${id}/photos/${item.media_id}?variant=full`} target="_blank" rel="noreferrer"><img src={`/api/admin/listings/${id}/photos/${item.media_id}`} alt={t('photo',{number:index+1})} width={640} height={480} /></a><figcaption>{t('photo',{number:index+1})}</figcaption></figure>)}</div><ReviewForm action={submitReview} /></> : <p role="status">{t('notPending')}</p>}
  </main>;
}
