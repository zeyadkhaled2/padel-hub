import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import {
  AlertTriangle,
  ImagePlus,
  LayoutGrid,
  LogOut,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { parseAdminAccess } from '@/features/admin/validation';
import { signOut } from '@/features/auth/actions';
import { localeValue } from '@/features/auth/types';
import { Link } from '@/i18n/navigation';
import { verifiedClient } from '@/server/supabase/server';
import { ProfileForm } from './profile-form';
import { MutationNotice } from './mutation-notice';
import { AccountDeletionCard } from './account-deletion-card';
import { fetchMyAccountDeletionRequest, fetchMyProfileBundle } from './server';

export async function ProfilePage({ locale }: { locale: string }) {
  const safeLocale = localeValue(locale);
  const client = await verifiedClient();
  if (!client) redirect(`/${safeLocale}/auth/signin`);

  const [t, photos, listings, admin, accessResponse, bundle, deletion] = await Promise.all([
    getTranslations('account'),
    getTranslations('photos'),
    getTranslations('listingEditor'),
    getTranslations('admin'),
    client.rpc('get_my_admin_access'),
    fetchMyProfileBundle(client),
    fetchMyAccountDeletionRequest(client),
  ]);
  const adminAccess = accessResponse.error ? null : parseAdminAccess(accessResponse.data);
  const profile = bundle.profile;
  const initial = profile?.display_name.trim().charAt(0).toUpperCase() || '@';

  return (
    <main id="main" className="container seller-page seller-profile-page">
      <div className="seller-profile-hero">
        <div className="seller-profile-hero-main">
          <span className="avatar seller-hero-avatar" aria-hidden>
            {profile ? initial : <UserRound size={24} />}
          </span>
          <div className="seller-profile-hero-copy">
            <div className="storefront-eyebrow-row">
              {profile ? (
                <>
                  <span className="storefront-handle">
                    <bdi>@{profile.username}</bdi>
                  </span>
                  <span className="condition">{t(profile.account_type)}</span>
                </>
              ) : (
                <span className="eyebrow">{t('profileEyebrow')}</span>
              )}
            </div>
            <h1>{t('title')}</h1>
            <p className="seller-hero-subtitle">{t('profileIntro')}</p>
          </div>
        </div>

        <div className="seller-profile-hero-actions">
          {profile && (
            <Link className="button primary seller-compact-btn" href="/account/listings">
              <LayoutGrid size={16} aria-hidden />
              <span>{listings('myListings')}</span>
            </Link>
          )}
          {profile && (
            <Link className="button secondary seller-compact-btn" href="/account/photos">
              <ImagePlus size={16} aria-hidden />
              <span>{photos('title')}</span>
            </Link>
          )}
          {adminAccess?.is_admin && (
            <Link className="button secondary seller-compact-btn" href="/admin">
              <ShieldCheck size={16} aria-hidden />
              <span>{admin('queue')}</span>
            </Link>
          )}
          <form action={signOut.bind(null, locale)}>
            <button className="button secondary seller-compact-btn">
              <LogOut size={15} aria-hidden />
              <span>{t('signout')}</span>
            </button>
          </form>
        </div>
      </div>

      {bundle.error || deletion.error ? (
        <div role="alert" className="seller-feedback-banner is-error">
          <AlertTriangle size={16} aria-hidden />
          <div>
            <p>{t('loadFailed')}</p>
            <a href={`/${safeLocale}/account`} className="text-link">
              {t('reload')}
            </a>
          </div>
        </div>
      ) : deletion.request?.status !== 'pending' ? (
        <ProfileForm initial={bundle.profile} />
      ) : null}

      {deletion.request?.status === 'pending' && <MutationNotice showLink={false} />}
      <AccountDeletionCard initial={deletion.request} loadError={deletion.error} />
    </main>
  );
}
