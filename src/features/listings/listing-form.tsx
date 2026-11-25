'use client';
/* eslint-disable @next/next/no-img-element -- Owner preview photos bypass the shared optimizer. */

import { useActionState, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  AlertTriangle,
  Archive,
  Camera,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  ExternalLink,
  ImagePlus,
  Info,
  MapPin,
  RotateCcw,
  Save,
  Send,
  ShieldAlert,
  SlidersHorizontal,
  Tag,
} from 'lucide-react';
import type { Profile } from '@/features/profile/types';
import { Link } from '@/i18n/navigation';
import {
  CURATED_BRANDS,
  EGYPT_GOVERNORATES,
  LISTING_CONDITIONS,
  LISTING_PRICE_BOUNDS,
  LISTING_TEXT_LIMITS,
  MAX_LISTING_PHOTOS,
  MIN_LISTING_PHOTOS,
  RACKET_SHAPES,
  RACKET_WEIGHT_BOUNDS,
  RACKET_YEAR_BOUNDS,
  SHOE_SIZE_BOUNDS,
  canMarkListingSold,
  canMarkListingTraded,
  formatBrandLabel,
  getCategoryConfig,
  isListingArchivable,
  isListingEditable,
  isListingRelistable,
  isListingWithdrawable,
  type BrandSlug,
  type ListingTextFieldKey,
} from '@/lib/domain/equipment';
import { formatAmount } from '@/lib/format';
import { saveListing } from './actions';
import type { Listing, ListingFormFieldKey } from './types';
import { getListingSubmissionReadiness } from './validation';

function readListingFieldValue(listing: Listing, key: ListingFormFieldKey): string {
  switch (key) {
    case 'title':
      return listing.title ?? '';
    case 'brand_slug':
      return listing.brand_slug ?? '';
    case 'brand_custom':
      return listing.brand_custom ?? '';
    case 'model':
      return listing.model ?? '';
    case 'description':
      return listing.description ?? '';
    case 'governorate_slug':
      return listing.governorate_slug ?? '';
    case 'district_text':
      return listing.district_text ?? '';
    case 'condition':
      return listing.condition ?? '';
    case 'condition_disclosure':
      return listing.condition_disclosure ?? '';
    case 'offer_type':
      return listing.offer_type ?? '';
    case 'swap_preference':
      return listing.swap_preference ?? '';
    case 'racket_damage_repair_disclosure':
      return listing.racket_damage_repair_disclosure ?? '';
    case 'balls_quantity_packaging':
      return listing.balls_quantity_packaging ?? '';
    case 'balls_availability_note':
      return listing.balls_availability_note ?? '';
    case 'price_egp':
      return listing.price_egp === null ? '' : String(listing.price_egp);
    case 'shoe_size_eu':
      return listing.shoe_size_eu === null ? '' : String(listing.shoe_size_eu);
    case 'racket_year':
      return listing.racket_year === null ? '' : String(listing.racket_year);
    case 'racket_weight_grams':
      return listing.racket_weight_grams === null ? '' : String(listing.racket_weight_grams);
    case 'racket_shape':
      return listing.racket_shape ?? '';
  }
}

const SUCCESS_MESSAGES = new Set(['saved', 'submitted', 'withdrawn', 'statusUpdated']);

export function ListingForm({
  initial,
  profile,
}: {
  initial: Listing;
  profile: Pick<
    Profile,
    'is_public' | 'public_contact_consent' | 'whatsapp_e164' | 'account_status'
  > | null;
}) {
  const t = useTranslations('listingEditor');
  const account = useTranslations('account');
  const market = useTranslations('market');
  const photos = useTranslations('photos');
  const locale = useLocale();
  const [state, action, busy] = useActionState(saveListing, { listing: initial });
  const listing = state.listing;
  const categoryConfig = getCategoryConfig(listing.category);
  const [dirty, setDirty] = useState(false);

  // Track interactive conditional fields locally so selecting "Other" brand or "Swap"
  // offer updates the form layout immediately while preserving uncontrolled FormData values.
  const [brandOverride, setBrandOverride] = useState<string | null>(null);
  const [offerOverride, setOfferOverride] = useState<string | null>(null);

  const editable = isListingEditable(listing.status);
  const value = (key: ListingFormFieldKey) => state.values?.[key] ?? readListingFieldValue(listing, key);

  const currentBrand = brandOverride ?? value('brand_slug');
  const currentOffer = categoryConfig.supportsSwap
    ? (offerOverride ?? value('offer_type'))
    : 'sale';
  const showCustomBrand = currentBrand === 'other' || value('brand_custom').trim().length > 0;
  const showPriceField = !categoryConfig.supportsSwap || currentOffer !== 'swap';
  const showSwapField =
    categoryConfig.supportsSwap &&
    (currentOffer === 'swap' || currentOffer === 'both' || value('swap_preference').trim().length > 0);

  const readiness = getListingSubmissionReadiness(listing, profile);
  const isSuccess = Boolean(state.message && SUCCESS_MESSAGES.has(state.message));
  const photoProgressPct = Math.min(
    100,
    Math.round((listing.media_ids.length / MAX_LISTING_PHOTOS) * 100),
  );
  const canViewPublic =
    ['active', 'reserved', 'sold', 'traded'].includes(listing.status) &&
    Boolean(
      profile?.is_public && profile?.public_contact_consent && profile?.account_status === 'active',
    );

  const fieldError = (key: ListingFormFieldKey) => state.fieldErrors?.[key];

  const renderTextField = (
    key: ListingTextFieldKey,
    options: { multiline?: boolean; required?: boolean; hint?: string; rows?: number } = {},
  ) => {
    const err = fieldError(key);
    const id = `listing-field-${key}`;
    const descId = err || options.hint ? `${id}-desc` : undefined;
    return (
      <div className="form-field" key={key}>
        <div className="field-header">
          <label htmlFor={id}>{t(key)}</label>
          <span className={`field-badge ${options.required ? 'is-required' : 'is-optional'}`}>
            {t(options.required ? 'requiredTag' : 'optionalTag')}
          </span>
        </div>
        {options.multiline ? (
          <textarea
            id={id}
            name={key}
            defaultValue={value(key)}
            maxLength={LISTING_TEXT_LIMITS[key]}
            rows={options.rows ?? 3}
            aria-invalid={!!err}
            aria-describedby={descId}
          />
        ) : (
          <input
            id={id}
            name={key}
            defaultValue={value(key)}
            maxLength={LISTING_TEXT_LIMITS[key]}
            aria-invalid={!!err}
            aria-describedby={descId}
          />
        )}
        {err ? (
          <p id={descId} className="field-error">
            {t(err)}
          </p>
        ) : options.hint ? (
          <p id={descId} className="field-hint">
            {options.hint}
          </p>
        ) : null}
      </div>
    );
  };

  const renderSelectField = (
    key: 'brand_slug' | 'governorate_slug' | 'condition' | 'offer_type',
    options: readonly string[],
    onSelectChange?: (next: string) => void,
  ) => {
    const err = fieldError(key);
    const id = `listing-field-${key}`;
    const descId = err ? `${id}-desc` : undefined;
    return (
      <div className="form-field" key={key}>
        <div className="field-header">
          <label htmlFor={id}>{t(key)}</label>
          <span className="field-badge is-required">{t('requiredTag')}</span>
        </div>
        <select
          id={id}
          aria-label={t(key)}
          name={key}
          defaultValue={value(key)}
          aria-invalid={!!err}
          aria-describedby={descId}
          onChange={(event) => onSelectChange?.(event.target.value)}
        >
          <option value="">{t('choose')}</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {key === 'governorate_slug'
                ? account(`governorates.${option}`)
                : key === 'brand_slug' && option !== 'other'
                  ? formatBrandLabel(option as BrandSlug)
                  : t(option)}
            </option>
          ))}
        </select>
        {err && (
          <p id={descId} className="field-error">
            {t(err)}
          </p>
        )}
      </div>
    );
  };

  return (
    <section className="editor-workspace">
      <div className="editor-status-bar">
        <p className={`seller-status-badge is-${listing.status} editor-status-pill`}>
          {t('status')}: {t(listing.status)}
        </p>
        <span className="editor-photo-summary-chip" dir="ltr">
          <Camera size={14} aria-hidden />
          <span>
            {listing.media_ids.length} / {MAX_LISTING_PHOTOS}
          </span>
        </span>
      </div>

      {state.message && (
        <div
          role="status"
          aria-live="polite"
          className={`seller-feedback-banner ${isSuccess ? 'is-success' : 'is-error'}`}
        >
          {isSuccess ? (
            <CheckCircle2 size={16} aria-hidden />
          ) : (
            <AlertTriangle size={16} aria-hidden />
          )}
          <div>
            <p>{t(state.message)}</p>
            {state.message === 'conflict' && (
              <p className="seller-status-action">
                <a className="button secondary seller-inline-btn" href={`/${locale}/account/listings/${listing.id}`}>
                  {t('reload')}
                </a>
              </p>
            )}
          </div>
        </div>
      )}

      <div className="editor-workspace-grid">
        <div className="editor-main-column">
          {!editable && (
            <div className="seller-card editor-readonly-summary">
              <div className="editor-readonly-head">
                <div>
                  <h2>
                    <bdi>{listing.title || photos(listing.category)}</bdi>
                  </h2>
                  <p className="field-hint">
                    {listing.brand_slug === 'other'
                      ? listing.brand_custom || t('other')
                      : listing.brand_slug
                        ? formatBrandLabel(listing.brand_slug)
                        : '—'}
                    {listing.model ? ` · ${listing.model}` : ''}
                    {listing.governorate_slug
                      ? ` · ${account(`governorates.${listing.governorate_slug}`)}`
                      : ''}
                  </p>
                </div>
                <p className="seller-listing-price">
                  {listing.offer_type === 'swap'
                    ? t('swap')
                    : listing.price_egp !== null
                      ? market('price', { amount: formatAmount(listing.price_egp, locale) })
                      : t('dashboardPriceUnset')}
                </p>
              </div>

              {listing.description && (
                <p className="user-copy editor-readonly-desc">
                  <bdi>{listing.description}</bdi>
                </p>
              )}

              {canViewPublic && (
                <div className="editor-readonly-actions">
                  <Link
                    href={`/equipment/${listing.id}`}
                    prefetch={false}
                    className="button secondary seller-compact-btn"
                  >
                    <ExternalLink size={15} aria-hidden />
                    <span>{t('dashboardViewPublic')}</span>
                  </Link>
                </div>
              )}
            </div>
          )}

          <form
            action={async (form) => {
              await action(form);
              setDirty(false);
              setBrandOverride(null);
              setOfferOverride(null);
            }}
            className="account-form editor-form"
          >
            <input type="hidden" name="id" value={listing.id} />
            <input type="hidden" name="version" value={listing.version} />

            <fieldset disabled={busy || state.message === 'conflict'} className="listing-fields">
              {editable && (
                <div
                  key={`${listing.version}-${state.message}`}
                  onChange={() => setDirty(true)}
                  className="editor-sections-stack"
                >
                  {/* Section 1: Equipment basics */}
                  <div className="seller-card editor-section">
                    <div className="detail-panel-head">
                      <span className="detail-panel-icon" aria-hidden>
                        <Tag size={18} />
                      </span>
                      <div>
                        <h2>{t('sectionBasics')}</h2>
                        <p className="detail-panel-subtitle">{t('sectionBasicsHint')}</p>
                      </div>
                    </div>

                    {renderTextField('title', { required: true })}
                    <div className="form-columns">
                      {renderSelectField('brand_slug', CURATED_BRANDS, setBrandOverride)}
                      {renderTextField('model', { required: true })}
                    </div>
                    {showCustomBrand && renderTextField('brand_custom', { required: true })}
                    {renderTextField('description', { multiline: true, required: true, rows: 4 })}
                  </div>

                  {/* Section 2: Condition & disclosures */}
                  <div className="seller-card editor-section">
                    <div className="detail-panel-head">
                      <span className="detail-panel-icon" aria-hidden>
                        <ShieldAlert size={18} />
                      </span>
                      <div>
                        <h2>{t('sectionCondition')}</h2>
                        <p className="detail-panel-subtitle">{t('sectionConditionHint')}</p>
                      </div>
                    </div>

                    {renderSelectField('condition', LISTING_CONDITIONS)}
                    {renderTextField('condition_disclosure', { multiline: true, required: true })}

                    {categoryConfig.extraTextFields.map((spec) =>
                      renderTextField(spec.key, {
                        multiline: spec.multiline,
                        required: spec.key !== 'balls_availability_note',
                      }),
                    )}

                    {categoryConfig.hasShoeSize && (
                      <div className="form-field">
                        <div className="field-header">
                          <label htmlFor="listing-field-shoe_size_eu">{t('shoe_size_eu')}</label>
                          <span className="field-badge is-required">{t('requiredTag')}</span>
                        </div>
                        <input
                          id="listing-field-shoe_size_eu"
                          name="shoe_size_eu"
                          type="number"
                          min={SHOE_SIZE_BOUNDS.min}
                          max={SHOE_SIZE_BOUNDS.max}
                          step={SHOE_SIZE_BOUNDS.step}
                          defaultValue={value('shoe_size_eu')}
                          aria-invalid={!!fieldError('shoe_size_eu')}
                          aria-describedby="listing-field-shoe_size_eu-desc"
                        />
                        <p
                          id="listing-field-shoe_size_eu-desc"
                          className={fieldError('shoe_size_eu') ? 'field-error' : 'field-hint'}
                        >
                          {fieldError('shoe_size_eu')
                            ? t(fieldError('shoe_size_eu')!)
                            : t('shoeSizeHint')}
                        </p>
                      </div>
                    )}

                    {listing.category === 'bags' && (
                      <p className="seller-inline-hint">
                        <Info size={14} aria-hidden />
                        <span>{t('bagsCategoryHint')}</span>
                      </p>
                    )}
                  </div>

                  {/* Section 3: Offer & pricing */}
                  <div className="seller-card editor-section">
                    <div className="detail-panel-head">
                      <span className="detail-panel-icon" aria-hidden>
                        <SlidersHorizontal size={18} />
                      </span>
                      <div>
                        <h2>{t('sectionOffer')}</h2>
                        <p className="detail-panel-subtitle">{t('offerHint')}</p>
                      </div>
                    </div>

                    {categoryConfig.supportsSwap ? (
                      renderSelectField('offer_type', categoryConfig.supportedOfferTypes, setOfferOverride)
                    ) : (
                      <p className="seller-inline-hint">
                        <Info size={14} aria-hidden />
                        <span>{t('saleOnlyNotice')}</span>
                      </p>
                    )}

                    {showPriceField ? (
                      <>
                        <div className="form-field">
                          <div className="field-header">
                            <label htmlFor="listing-field-price_egp">{t('price_egp')}</label>
                            <span className="field-badge is-required">{t('requiredTag')}</span>
                          </div>
                          <input
                            id="listing-field-price_egp"
                            name="price_egp"
                            type="number"
                            min={LISTING_PRICE_BOUNDS.min}
                            max={LISTING_PRICE_BOUNDS.max}
                            step="1"
                            defaultValue={value('price_egp')}
                            aria-invalid={!!fieldError('price_egp')}
                            aria-describedby={
                              fieldError('price_egp') ? 'listing-field-price_egp-desc' : undefined
                            }
                          />
                          {fieldError('price_egp') && (
                            <p id="listing-field-price_egp-desc" className="field-error">
                              {t(fieldError('price_egp')!)}
                            </p>
                          )}
                        </div>

                        <label className="check-field checkbox-label">
                          <input
                            name="is_negotiable"
                            type="checkbox"
                            defaultChecked={
                              state.values
                                ? state.values.is_negotiable === 'on'
                                : listing.is_negotiable
                            }
                          />
                          <span>{t('is_negotiable')}</span>
                        </label>
                      </>
                    ) : (
                      <p className="seller-inline-hint">
                        <Info size={14} aria-hidden />
                        <span>{t('swapNoPriceNotice')}</span>
                      </p>
                    )}

                    {showSwapField &&
                      renderTextField('swap_preference', { multiline: true, required: true })}
                  </div>

                  {/* Section 4: Location */}
                  <div className="seller-card editor-section">
                    <div className="detail-panel-head">
                      <span className="detail-panel-icon" aria-hidden>
                        <MapPin size={18} />
                      </span>
                      <div>
                        <h2>{t('sectionLocation')}</h2>
                        <p className="detail-panel-subtitle">{t('sectionLocationHint')}</p>
                      </div>
                    </div>

                    <div className="form-columns">
                      {renderSelectField('governorate_slug', EGYPT_GOVERNORATES)}
                      {renderTextField('district_text', { required: false })}
                    </div>
                  </div>

                  {/* Section 5: Optional Racket Specifications (kept as last <fieldset>) */}
                  {categoryConfig.hasRacketSpecs && (
                    <fieldset className="seller-card editor-section editor-racket-specs">
                      <legend className="editor-fieldset-legend">{t('racketSpecs')}</legend>
                      <p className="field-hint">{t('racketSpecsHint')}</p>
                      <div className="form-columns">
                        <div className="form-field">
                          <div className="field-header">
                            <label htmlFor="listing-field-racket_year">{t('racket_year')}</label>
                            <span className="field-badge is-optional">{t('optionalTag')}</span>
                          </div>
                          <input
                            id="listing-field-racket_year"
                            aria-label={t('racket_year')}
                            name="racket_year"
                            type="number"
                            min={RACKET_YEAR_BOUNDS.min}
                            max={RACKET_YEAR_BOUNDS.max}
                            step="1"
                            defaultValue={value('racket_year')}
                            aria-invalid={!!fieldError('racket_year')}
                            aria-describedby={
                              fieldError('racket_year')
                                ? 'listing-field-racket_year-desc'
                                : undefined
                            }
                          />
                          {fieldError('racket_year') && (
                            <p id="listing-field-racket_year-desc" className="field-error">
                              {t(fieldError('racket_year')!)}
                            </p>
                          )}
                        </div>
                        <div className="form-field">
                          <div className="field-header">
                            <label htmlFor="listing-field-racket_weight_grams">
                              {t('racket_weight_grams')}
                            </label>
                            <span className="field-badge is-optional">{t('optionalTag')}</span>
                          </div>
                          <input
                            id="listing-field-racket_weight_grams"
                            aria-label={t('racket_weight_grams')}
                            name="racket_weight_grams"
                            type="number"
                            min={RACKET_WEIGHT_BOUNDS.min}
                            max={RACKET_WEIGHT_BOUNDS.max}
                            step="1"
                            defaultValue={value('racket_weight_grams')}
                            aria-invalid={!!fieldError('racket_weight_grams')}
                            aria-describedby={
                              fieldError('racket_weight_grams')
                                ? 'listing-field-racket_weight_grams-desc'
                                : undefined
                            }
                          />
                          {fieldError('racket_weight_grams') && (
                            <p id="listing-field-racket_weight_grams-desc" className="field-error">
                              {t(fieldError('racket_weight_grams')!)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="form-field">
                        <div className="field-header">
                          <label htmlFor="listing-field-racket_shape">{t('racket_shape')}</label>
                          <span className="field-badge is-optional">{t('optionalTag')}</span>
                        </div>
                        <select
                          id="listing-field-racket_shape"
                          aria-label={t('racket_shape')}
                          name="racket_shape"
                          defaultValue={value('racket_shape')}
                          aria-invalid={!!fieldError('racket_shape')}
                        >
                          <option value="">{t('unknown')}</option>
                          {RACKET_SHAPES.map((shape) => (
                            <option key={shape} value={shape}>
                              {t(`shapes.${shape}`)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </fieldset>
                  )}

                  {/* Save & Submit Actions Card */}
                  <div className="seller-card editor-actions-card">
                    <div className="editor-actions-buttons">
                      <button name="intent" value="save" className="button secondary">
                        <Save size={16} aria-hidden />
                        <span>{t('save')}</span>
                      </button>
                      <button
                        name="intent"
                        value="submit"
                        disabled={dirty || !!state.values}
                        className="button primary"
                      >
                        <Send size={16} aria-hidden />
                        <span>{t('submit')}</span>
                      </button>
                    </div>
                    <p className="field-hint">{t('saveFirst')}</p>
                  </div>
                </div>
              )}

              {/* Lifecycle Controls for Non-Editable Listings */}
              {!editable && (
                <div className="editor-lifecycle-grid">
                  {isListingWithdrawable(listing.status) && (
                    <div className="seller-card editor-lifecycle-card">
                      <h3>{t('withdraw')}</h3>
                      <p className="field-hint">{t('withdrawHint')}</p>
                      <button name="intent" value="withdraw" className="button secondary">
                        <RotateCcw size={15} aria-hidden />
                        <span>{t('withdraw')}</span>
                      </button>
                    </div>
                  )}

                  {listing.status === 'active' && (
                    <div className="seller-card editor-lifecycle-card">
                      <h3>{t('lifecycleCompletedTitle')}</h3>
                      <p className="field-hint">{t('completedHint')}</p>
                      <div className="editor-lifecycle-buttons">
                        {canMarkListingSold(listing.status, listing.offer_type) && (
                          <button name="intent" value="sold" className="button secondary">
                            <Tag size={15} aria-hidden />
                            <span>{t('markSold')}</span>
                          </button>
                        )}
                        {canMarkListingTraded(listing.category, listing.status, listing.offer_type) && (
                          <button name="intent" value="traded" className="button secondary">
                            <RotateCcw size={15} aria-hidden />
                            <span>{t('markTraded')}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {isListingArchivable(listing.status) && (
                    <div className="seller-card editor-lifecycle-card">
                      <h3>{t('archive')}</h3>
                      <p className="field-hint">{t('archiveHint')}</p>
                      <button name="intent" value="archive" disabled={dirty} className="button secondary">
                        <Archive size={15} aria-hidden />
                        <span>{t('archive')}</span>
                      </button>
                    </div>
                  )}

                  {isListingRelistable(listing.status) && (
                    <div className="seller-card editor-lifecycle-card">
                      <h3>{t('relist')}</h3>
                      <p className="field-hint">{t('relistHint')}</p>
                      <button name="intent" value="relist" className="button primary">
                        <Send size={15} aria-hidden />
                        <span>{t('relist')}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </fieldset>
          </form>
        </div>

        {/* Sticky Side Column: Photos & Submission Readiness */}
        <aside className="editor-side-column">
          <div className="seller-card editor-side-card">
            <div className="editor-side-head">
              <h2>{t('sectionPhotos')}</h2>
              <span
                dir="ltr"
                className={`seller-pill ${
                  listing.media_ids.length >= MIN_LISTING_PHOTOS &&
                  listing.media_ids.length <= MAX_LISTING_PHOTOS
                    ? 'is-ready'
                    : 'is-warn'
                }`}
              >
                {t('photoRatio', {
                  count: listing.media_ids.length,
                  max: MAX_LISTING_PHOTOS,
                })}
              </span>
            </div>

            <div className="photo-progress-track" aria-hidden="true">
              <span className="photo-progress-fill" style={{ width: `${photoProgressPct}%` }} />
            </div>

            <p className="field-hint">
              {t('photoCount', { count: listing.media_ids.length })} ·{' '}
              {t('photoRuleShort', {
                min: MIN_LISTING_PHOTOS,
                max: MAX_LISTING_PHOTOS,
              })}
            </p>

            {listing.media_ids.length > 0 ? (
              <div className="editor-thumb-strip">
                {listing.media_ids.map((mediaId, index) => (
                  <div key={mediaId} className="editor-thumb-item">
                    <img
                      src={`/api/media/${mediaId}?variant=thumb`}
                      alt={photos('photoAlt', { number: index + 1 })}
                      width={120}
                      height={90}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="editor-no-photos-note">{photos('empty')}</p>
            )}

            {readiness.exceedsMaxPhotos && (
              <p className="field-hint editor-legacy-note">
                {t('legacyPhotoLimitNote', { max: MAX_LISTING_PHOTOS })}
              </p>
            )}

            {editable && !dirty && (
              <Link
                className="button secondary editor-photos-cta"
                href={`/account/photos?listing=${listing.id}`}
              >
                <ImagePlus size={16} aria-hidden />
                <span>{t('photos')}</span>
              </Link>
            )}
            {editable && dirty && <p className="field-hint">{t('saveFirst')}</p>}
          </div>

          {editable && (
            <div className="seller-card editor-side-card">
              <div className="detail-panel-head">
                <span className="detail-panel-icon" aria-hidden>
                  <ClipboardCheck size={18} />
                </span>
                <div>
                  <h2>{t('checklistTitle')}</h2>
                  <p className="detail-panel-subtitle">
                    {t('requirementsHint', {
                      count: categoryConfig.minPhotos,
                      max: categoryConfig.maxPhotos,
                    })}
                  </p>
                </div>
              </div>

              <ul className="editor-checklist">
                {readiness.items.map((item) => (
                  <li key={item.key} className={item.done ? 'is-done' : ''}>
                    {item.done ? (
                      <CheckCircle2 size={16} aria-hidden />
                    ) : (
                      <Circle size={16} aria-hidden />
                    )}
                    <span>
                      {t(`checklist.${item.key}`, {
                        min: MIN_LISTING_PHOTOS,
                        max: MAX_LISTING_PHOTOS,
                      })}
                    </span>
                  </li>
                ))}
              </ul>

              {!readiness.items.find((i) => i.key === 'account')?.done && (
                <Link href="/account" className="text-link editor-account-link">
                  {t('dashboardEnableProfileLink')}
                </Link>
              )}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
