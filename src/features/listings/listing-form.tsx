'use client';

import { useActionState, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import {
  CURATED_BRANDS,
  EGYPT_GOVERNORATES,
  LISTING_CONDITIONS,
  LISTING_PRICE_BOUNDS,
  LISTING_TEXT_LIMITS,
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
import { saveListing } from './actions';
import type { Listing, ListingFormFieldKey } from './types';

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

export function ListingForm({ initial }: { initial: Listing }) {
  const t = useTranslations('listingEditor');
  const account = useTranslations('account');
  const locale = useLocale();
  const [state, action, busy] = useActionState(saveListing, { listing: initial });
  const listing = state.listing;
  const categoryConfig = getCategoryConfig(listing.category);
  const [dirty, setDirty] = useState(false);

  const editable = isListingEditable(listing.status);
  const value = (key: ListingFormFieldKey) => state.values?.[key] ?? readListingFieldValue(listing, key);

  const renderTextField = (key: ListingTextFieldKey, multiline = false) => (
    <label key={key}>
      {t(key)}
      {multiline ? (
        <textarea
          name={key}
          defaultValue={value(key)}
          maxLength={LISTING_TEXT_LIMITS[key]}
          rows={3}
        />
      ) : (
        <input name={key} defaultValue={value(key)} maxLength={LISTING_TEXT_LIMITS[key]} />
      )}
    </label>
  );

  const renderSelectField = (
    key: 'brand_slug' | 'governorate_slug' | 'condition' | 'offer_type',
    options: readonly string[],
  ) => (
    <label key={key}>
      {t(key)}
      <select aria-label={t(key)} name={key} defaultValue={value(key)}>
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
    </label>
  );

  return (
    <section>
      <p className="form-notice">
        {t('status')}: {t(listing.status)}
      </p>
      {state.message && (
        <p role="status" className="form-notice">
          {t(state.message)}
        </p>
      )}
      <form
        action={async (form) => {
          await action(form);
          setDirty(false);
        }}
        className="account-form"
      >
        <input type="hidden" name="id" value={listing.id} />
        <input type="hidden" name="version" value={listing.version} />
        <fieldset disabled={busy || state.message === 'conflict'} className="listing-fields">
          {editable && (
            <div
              key={`${listing.version}-${state.message}`}
              onChange={() => setDirty(true)}
              className="listing-fields"
            >
              {renderTextField('title')}
              {renderSelectField('brand_slug', CURATED_BRANDS)}
              {renderTextField('brand_custom')}
              {renderTextField('model')}
              {renderTextField('description', true)}
              {renderSelectField('governorate_slug', EGYPT_GOVERNORATES)}
              {renderTextField('district_text')}
              {renderSelectField('condition', LISTING_CONDITIONS)}
              {renderTextField('condition_disclosure', true)}

              {categoryConfig.extraTextFields.map((spec) =>
                renderTextField(spec.key, spec.multiline),
              )}

              {categoryConfig.supportsSwap && (
                <>
                  {renderSelectField('offer_type', categoryConfig.supportedOfferTypes)}
                  {renderTextField('swap_preference', true)}
                </>
              )}

              {categoryConfig.hasRacketSpecs && (
                <fieldset className="listing-fields">
                  <legend>{t('racketSpecs')}</legend>
                  <p className="field-hint">{t('racketSpecsHint')}</p>
                  <div className="form-columns">
                    <label>
                      {t('racket_year')}
                      <input
                        aria-label={t('racket_year')}
                        name="racket_year"
                        type="number"
                        min={RACKET_YEAR_BOUNDS.min}
                        max={RACKET_YEAR_BOUNDS.max}
                        step="1"
                        defaultValue={value('racket_year')}
                      />
                    </label>
                    <label>
                      {t('racket_weight_grams')}
                      <input
                        aria-label={t('racket_weight_grams')}
                        name="racket_weight_grams"
                        type="number"
                        min={RACKET_WEIGHT_BOUNDS.min}
                        max={RACKET_WEIGHT_BOUNDS.max}
                        step="1"
                        defaultValue={value('racket_weight_grams')}
                      />
                    </label>
                  </div>
                  <label>
                    {t('racket_shape')}
                    <select
                      aria-label={t('racket_shape')}
                      name="racket_shape"
                      defaultValue={value('racket_shape')}
                    >
                      <option value="">{t('unknown')}</option>
                      {RACKET_SHAPES.map((shape) => (
                        <option key={shape} value={shape}>
                          {t(`shapes.${shape}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                </fieldset>
              )}

              {categoryConfig.hasShoeSize && (
                <label>
                  {t('shoe_size_eu')}
                  <input
                    name="shoe_size_eu"
                    type="number"
                    min={SHOE_SIZE_BOUNDS.min}
                    max={SHOE_SIZE_BOUNDS.max}
                    step={SHOE_SIZE_BOUNDS.step}
                    defaultValue={value('shoe_size_eu')}
                  />
                  <span className="field-hint">{t('shoeSizeHint')}</span>
                </label>
              )}

              <label>
                {t('price_egp')}
                <input
                  name="price_egp"
                  type="number"
                  min={LISTING_PRICE_BOUNDS.min}
                  max={LISTING_PRICE_BOUNDS.max}
                  step="1"
                  defaultValue={value('price_egp')}
                />
              </label>

              <label className="checkbox-label">
                <input
                  name="is_negotiable"
                  type="checkbox"
                  defaultChecked={
                    state.values ? state.values.is_negotiable === 'on' : listing.is_negotiable
                  }
                />
                {t('is_negotiable')}
              </label>

              <p className="field-hint">{t('offerHint')}</p>
              <button name="intent" value="save" className="button primary">
                {t('save')}
              </button>
            </div>
          )}

          {editable && (
            <>
              <p>{t('requirementsHint', { count: categoryConfig.minPhotos })}</p>
              <p>{t('photoCount', { count: listing.media_ids.length })}</p>
              {!dirty && (
                <Link className="button secondary" href={`/account/photos?listing=${listing.id}`}>
                  {t('photos')}
                </Link>
              )}
              <p className="field-hint">{t('saveFirst')}</p>
              <button
                name="intent"
                value="submit"
                disabled={dirty || !!state.values}
                className="button primary"
              >
                {t('submit')}
              </button>
            </>
          )}

          {isListingWithdrawable(listing.status) && (
            <>
              <p>{t('withdrawHint')}</p>
              <button name="intent" value="withdraw" className="button secondary">
                {t('withdraw')}
              </button>
            </>
          )}

          {listing.status === 'active' && (
            <>
              <p className="field-hint">{t('completedHint')}</p>
              {canMarkListingSold(listing.status, listing.offer_type) && (
                <button name="intent" value="sold" className="button secondary">
                  {t('markSold')}
                </button>
              )}
              {canMarkListingTraded(listing.category, listing.status, listing.offer_type) && (
                <button name="intent" value="traded" className="button secondary">
                  {t('markTraded')}
                </button>
              )}
            </>
          )}

          {isListingArchivable(listing.status) && (
            <>
              <p className="field-hint">{t('archiveHint')}</p>
              <button name="intent" value="archive" disabled={dirty} className="button secondary">
                {t('archive')}
              </button>
            </>
          )}

          {isListingRelistable(listing.status) && (
            <>
              <p className="field-hint">{t('relistHint')}</p>
              <button name="intent" value="relist" className="button primary">
                {t('relist')}
              </button>
            </>
          )}
        </fieldset>
      </form>
      {state.message === 'conflict' && (
        <a className="button secondary" href={`/${locale}/account/listings/${listing.id}`}>
          {t('reload')}
        </a>
      )}
    </section>
  );
}
