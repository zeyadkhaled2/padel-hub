import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  EyeOff,
  ImagePlus,
  Info,
  Plus,
  UserRound,
} from 'lucide-react';
import { AnalyticsSummary } from '@/features/analytics/summary';
import { localeValue } from '@/features/auth/types';
import { fetchMyProfileBundle } from '@/features/profile/server';
import { Link } from '@/i18n/navigation';
import { EQUIPMENT_CATEGORIES, MAX_LISTING_PHOTOS, MIN_LISTING_PHOTOS } from '@/lib/domain/equipment';
import { verifiedClient } from '@/server/supabase/server';
import { createListing } from './actions';
import { SellerListingsBoard } from './seller-listings-board';
import { fetchOwnerListings } from './server';

export default async function ListingIndex({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const client = await verifiedClient();
  if (!client) redirect(`/${localeValue(locale)}/auth/signin`);

  const [t, photos, account, publicProfile, listingsResult, profileBundle] = await Promise.all([
    getTranslations('listingEditor'),
    getTranslations('photos'),
    getTranslations('account'),
    getTranslations('publicProfile'),
    fetchOwnerListings(client),
    fetchMyProfileBundle(client),
  ]);

  const profile = profileBundle.profile;
  const initial = profile?.display_name.trim().charAt(0).toUpperCase() || '@';
  const profileReadyForPublic = Boolean(
    profile &&
      profile.account_status === 'active' &&
      profile.is_public &&
      profile.public_contact_consent &&
      profile.whatsapp_e164,
  );

  return (
    <main id="main" className="container seller-page">
      <div className="detail-breadcrumb seller-top-bar">
        <Link href="/account" className="detail-back-link">
          <ArrowLeft size={16} className="icon-directional" aria-hidden />
          <span>{t('account')}</span>
        </Link>
        <div className="seller-top-links">
          {profile && (
            <Link href="/account/photos" className="button secondary seller-compact-btn">
              <ImagePlus size={15} aria-hidden />
              <span>{photos('title')}</span>
            </Link>
          )}
          {profile && profile.is_public && profile.account_status === 'active' && (
            <Link
              href={`/@${profile.username}`}
              prefetch={false}
              className="button secondary seller-compact-btn"
            >
              <ExternalLink size={15} aria-hidden />
              <span>{publicProfile('view')}</span>
            </Link>
          )}
        </div>
      </div>

      {/* Seller Dashboard Header + Prominent Create Listing Action */}
      <div className="seller-hero">
        <div className="seller-hero-identity">
          <div className="seller-hero-title-row">
            {profile ? (
              <span className="avatar seller-hero-avatar" aria-hidden>
                {initial}
              </span>
            ) : (
              <span className="avatar seller-hero-avatar" aria-hidden>
                <UserRound size={24} />
              </span>
            )}
            <div className="seller-hero-copy">
              <p className="eyebrow">{t('dashboardEyebrow')}</p>
              <h1>{t('myListings')}</h1>
            </div>
          </div>

          {profile ? (
            <div className="seller-identity-summary">
              <div className="seller-identity-row">
                <strong className="seller-identity-name">
                  <bdi>{profile.display_name}</bdi>
                </strong>
                <span className="storefront-handle">
                  <bdi>@{profile.username}</bdi>
                </span>
                <span className="condition">{account(profile.account_type)}</span>
              </div>
              <div className="seller-readiness-pills">
                <span className={`seller-pill ${profile.is_public ? 'is-ready' : 'is-muted'}`}>
                  {profile.is_public ? (
                    <CheckCircle2 size={13} aria-hidden />
                  ) : (
                    <EyeOff size={13} aria-hidden />
                  )}
                  <span>{account(profile.is_public ? 'publicSelected' : 'privateSelected')}</span>
                </span>
                <span
                  className={`seller-pill ${
                    profile.public_contact_consent && profile.whatsapp_e164
                      ? 'is-ready'
                      : 'is-warn'
                  }`}
                >
                  {profile.public_contact_consent && profile.whatsapp_e164 ? (
                    <CheckCircle2 size={13} aria-hidden />
                  ) : (
                    <AlertTriangle size={13} aria-hidden />
                  )}
                  <span>
                    {profile.public_contact_consent && profile.whatsapp_e164
                      ? t('dashboardContactOn')
                      : t('dashboardContactOff')}
                  </span>
                </span>
              </div>
              {profile.account_type === 'business' && (
                <p className="seller-inline-hint">
                  <Info size={14} aria-hidden />
                  <span>{account('businessHint')}</span>
                </p>
              )}
              {!profileReadyForPublic && (
                <p className="seller-inline-hint">
                  <Link href="/account" className="text-link seller-inline-link">
                    {t('dashboardEnableProfileLink')}
                  </Link>
                </p>
              )}
            </div>
          ) : (
            <div className="seller-profile-needed">
              <p>{t('dashboardCreateProfileFirst')}</p>
              <Link href="/account" className="button primary seller-compact-btn">
                {account('createProfile')}
              </Link>
            </div>
          )}
        </div>

        <form action={createListing.bind(null, locale)} className="seller-create-card">
          <p className="seller-create-title">{t('dashboardCreateHeading')}</p>
          <p className="field-hint">
            {t('dashboardCreateHint', {
              min: MIN_LISTING_PHOTOS,
              max: MAX_LISTING_PHOTOS,
            })}
          </p>
          <div className="seller-create-controls">
            <div className="form-field seller-create-select">
              <label htmlFor="category">{photos('category')}</label>
              <select id="category" name="category">
                {EQUIPMENT_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {photos(category)}
                  </option>
                ))}
              </select>
            </div>
            <button className="button primary seller-create-submit" disabled={!profile}>
              <Plus size={17} aria-hidden />
              <span>{t('create')}</span>
            </button>
          </div>
        </form>
      </div>

      {query.error === 'createFailed' && (
        <div role="alert" className="seller-feedback-banner is-error">
          <AlertTriangle size={16} aria-hidden />
          <span>{t('dashboardCreateFailed')}</span>
        </div>
      )}

      <AnalyticsSummary />

      {listingsResult.error ? (
        <div role="alert" className="seller-feedback-banner is-error">
          <AlertTriangle size={16} aria-hidden />
          <span>{t('unavailable')}</span>
        </div>
      ) : (
        <SellerListingsBoard
          initialItems={listingsResult.items}
          hasProfile={profile !== null}
          profileReadyForPublic={profileReadyForPublic}
        />
      )}
    </main>
  );
}
