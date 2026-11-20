import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { parseAdminAccess } from '@/features/admin/validation';
import { signOut } from '@/features/auth/actions';
import { localeValue } from '@/features/auth/types';
import { Link } from '@/i18n/navigation';
import { verifiedClient } from '@/server/supabase/server';
import { ProfileForm } from './profile-form';
import { fetchMyProfileBundle } from './server';

export async function ProfilePage({ locale }: { locale: string }) {
  const safeLocale = localeValue(locale);
  const client = await verifiedClient();
  if (!client) redirect(`/${safeLocale}/auth/signin`);

  const t = await getTranslations('account');
  const photos = await getTranslations('photos');
  const listings = await getTranslations('listingEditor');
  const admin = await getTranslations('admin');
  const [accessResponse, bundle] = await Promise.all([
    client.rpc('get_my_admin_access'),
    fetchMyProfileBundle(client),
  ]);
  const adminAccess = accessResponse.error ? null : parseAdminAccess(accessResponse.data);

  return (
    <main id="main" className="container account-page">
      <div className="account-heading">
        <h1>{t('title')}</h1>
        <form action={signOut.bind(null, locale)}>
          <button className="button secondary">{t('signout')}</button>
        </form>
      </div>
      <p className="account-intro">{t('profileIntro')}</p>
      {adminAccess?.is_admin && (
        <Link className="button secondary" href="/admin">
          {admin('queue')}
        </Link>
      )}
      <p className="form-notice">{t('localScope')}</p>
      {bundle.profile && (
        <Link className="button secondary" href="/account/photos">
          {photos('title')}
        </Link>
      )}
      {bundle.profile && (
        <Link className="button primary" href="/account/listings">
          {listings('myListings')}
        </Link>
      )}
      {bundle.error ? (
        <div role="alert">
          <p>{t('loadFailed')}</p>
          <a href={`/${safeLocale}/account`}>{t('reload')}</a>
        </div>
      ) : (
        <ProfileForm initial={bundle.profile} />
      )}
    </main>
  );
}
