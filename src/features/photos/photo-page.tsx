/* eslint-disable @next/next/no-img-element -- Owner photos use the private proxy. */
import { MutationNotice } from '@/features/profile/mutation-notice';
import { fetchMyAccountDeletionRequest } from '@/features/profile/server';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { AlertTriangle, ArrowLeft, FileEdit, FolderOpen, Plus } from 'lucide-react';
import { localeValue } from '@/features/auth/types';
import { fetchOwnerListing, fetchOwnerPhotoDrafts } from '@/features/listings/server';
import { createPhotoDraft } from '@/features/photos/actions';
import { PhotoForm } from '@/features/photos/photo-form';
import { Link } from '@/i18n/navigation';
import {
  EQUIPMENT_CATEGORIES,
  MAX_LISTING_PHOTOS,
  MIN_LISTING_PHOTOS,
} from '@/lib/domain/equipment';
import { verifiedClient } from '@/server/supabase/server';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ listing?: string; error?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const client = await verifiedClient();
  if (!client) redirect(`/${localeValue(locale)}/auth/signin`);

  const [t, editor, draftsResult, deletion] = await Promise.all([
    getTranslations('photos'),
    getTranslations('listingEditor'),
    fetchOwnerPhotoDrafts(client),
    fetchMyAccountDeletionRequest(client),
  ]);

  const { items, error } = draftsResult;
  const selected = items.find((item) => item.id === query.listing) ?? items[0];
  const listingResult = selected ? await fetchOwnerListing(client, selected.id) : null;

  const readOnly = deletion.error || deletion.request?.status === 'pending';

  return (
    <main id="main" className="container seller-page photo-manager-page">
      <div className="detail-breadcrumb seller-top-bar">
        <div className="seller-top-links">
          <Link href="/account/listings" className="detail-back-link">
            <ArrowLeft size={16} className="icon-directional" aria-hidden />
            <span>{editor('myListings')}</span>
          </Link>
          <Link href="/account" className="detail-back-link">
            <span>{t('back')}</span>
          </Link>
        </div>

        {selected && (
          <Link className="button primary seller-compact-btn" href={`/account/listings/${selected.id}`}>
            <FileEdit size={15} aria-hidden />
            <span>{editor('heading')}</span>
          </Link>
        )}
      </div>

      <div className="photo-manager-header">
        <div>
          <p className="eyebrow">
            {t('ruleBadge', { min: MIN_LISTING_PHOTOS, max: MAX_LISTING_PHOTOS })}
          </p>
          <h1>{t('title')}</h1>
          <p className="seller-hero-subtitle">{t('intro')}</p>
        </div>

        <div className="photo-draft-controls">
          {items.length > 0 && (
            <form className="photo-control-form" method="get">
              <div className="form-field">
                <label htmlFor="listing">{t('draft')}</label>
                <select id="listing" name="listing" defaultValue={selected?.id}>
                  {items.map((item, index) => (
                    <option key={item.id} value={item.id}>
                      {(item.title || `${t(item.category)} · ${index + 1}`) +
                        ` (${item.photo_count}/${MAX_LISTING_PHOTOS})`}
                    </option>
                  ))}
                </select>
              </div>
              <button className="button secondary seller-compact-btn">
                <FolderOpen size={15} aria-hidden />
                <span>{t('open')}</span>
              </button>
            </form>
          )}

          {!readOnly && <form action={createPhotoDraft.bind(null, locale)} className="photo-control-form">
            <div className="form-field">
              <label htmlFor="category">{t('category')}</label>
              <select id="category" name="category">
                {EQUIPMENT_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {t(category)}
                  </option>
                ))}
              </select>
            </div>
            <button className="button secondary seller-compact-btn">
              <Plus size={15} aria-hidden />
              <span>{t('create')}</span>
            </button>
          </form>}
        </div>
      </div>

      {(error || listingResult?.error || query.error) && (
        <div role="alert" className="seller-feedback-banner is-error">
          <AlertTriangle size={16} aria-hidden />
          <span>{t('unavailable')}</span>
        </div>
      )}

      {readOnly && <MutationNotice error={deletion.error} />}
      {listingResult?.listing ? (
        readOnly ? (
          listingResult.listing.media_ids.length > 0 ? (
            <div className="photo-grid">
              {listingResult.listing.media_ids.map((id, index) => (
                <figure key={id}>
                  <img
                    src={`/api/media/${id}?variant=card`}
                    alt={t('photoAlt', { number: index + 1 })}
                  />
                </figure>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>{t('empty')}</p>
            </div>
          )
        ) : (
          <PhotoForm key={selected!.id} listing={listingResult.listing} />
        )
      ) : (
        !error && (
          <div className="empty-state">
            <h2>{t('noDraftsTitle')}</h2>
            <p>{t('noDraftsHint')}</p>
          </div>
        )
      )}
    </main>
  );
}
