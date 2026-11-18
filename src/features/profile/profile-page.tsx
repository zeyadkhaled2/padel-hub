import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { verifiedClient } from '@/server/supabase/server';
import { signOut } from '@/features/auth/actions';
import { localeValue } from '@/features/auth/types';
import { ProfileForm } from './profile-form';
import type { Profile } from './types';
import { Link } from '@/i18n/navigation';

export async function ProfilePage({ locale }: { locale: string }) {
  const client = await verifiedClient();
  if (!client) redirect(`/${localeValue(locale)}/auth/signin`);
  const t = await getTranslations('account');
  const photos = await getTranslations('photos');
  const listings = await getTranslations('listingEditor');
  const admin = await getTranslations('admin');
  const access = await client.rpc('get_my_admin_access');
  const { data, error } = await client.rpc('get_my_profile_bundle');
  return <main id="main" className="container account-page">
    <div className="account-heading"><h1>{t('title')}</h1><form action={signOut.bind(null, locale)}><button className="button secondary">{t('signout')}</button></form></div>
    <p className="account-intro">{t('profileIntro')}</p>
    {access.data?.is_admin && <Link className="button secondary" href="/admin">{admin('queue')}</Link>}
    <p className="form-notice">{t('localScope')}</p>
    {data && <Link className="button secondary" href="/account/photos">{photos('title')}</Link>}
    {data && <Link className="button primary" href="/account/listings">{listings('myListings')}</Link>}
    {error ? <div role="alert"><p>{t('loadFailed')}</p><a href={`/${localeValue(locale)}/account`}>{t('reload')}</a></div> : <ProfileForm initial={data as Profile | null} />}
  </main>;
}
