'use client';
import { useActionState, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { governorates } from '@/features/profile/types';
import { saveListing } from './actions';
import { brands, textFields, type Listing } from './types';

export function ListingForm({ initial }: { initial: Listing }) {
  const t = useTranslations('listingEditor');
  const account = useTranslations('account');
  const locale = useLocale();
  const [state, action, busy] = useActionState(saveListing, { listing: initial });
  const listing = state.listing;
  const [dirty, setDirty] = useState(false);
  const editable = ['draft','rejected'].includes(listing.status);
  const value = (key: string) => state.values?.[key] ?? String(listing[key] ?? '');
  const field = (key: keyof typeof textFields, multiline = false) => <label key={key}>{t(key)}{multiline ? <textarea name={key} defaultValue={value(key)} maxLength={textFields[key]} rows={3} /> : <input name={key} defaultValue={value(key)} maxLength={textFields[key]} />}</label>;
  const select = (key: string, options: readonly string[]) => <label>{t(key)}<select aria-label={t(key)} name={key} defaultValue={value(key)}><option value="">{t('choose')}</option>{options.map(option => <option key={option} value={option}>{key === 'governorate_slug' ? account(`governorates.${option}`) : key === 'brand_slug' && option !== 'other' ? option.replaceAll('_',' ') : t(option)}</option>)}</select></label>;
  return <section>
    <p className="form-notice">{t('status')}: {t(listing.status)}</p>
    {state.message && <p role="status" className="form-notice">{t(state.message)}</p>}
    <form action={async form => { await action(form); setDirty(false); }} className="account-form">
      <input type="hidden" name="id" value={listing.id} /><input type="hidden" name="version" value={listing.version} />
      <fieldset disabled={busy || state.message === 'conflict'} className="listing-fields">
        {editable && <div key={`${listing.version}-${state.message}`} onChange={() => setDirty(true)} className="listing-fields">
          {field('title')}{select('brand_slug', brands)}{field('brand_custom')}{field('model')}{field('description', true)}
          {select('governorate_slug', governorates)}{field('district_text')}{select('condition',['new','used'])}{field('condition_disclosure',true)}
          {listing.category === 'rackets' && <>{field('racket_damage_repair_disclosure',true)}{select('offer_type',['sale','swap','both'])}{field('swap_preference',true)}</>}
          {listing.category === 'balls' && <>{field('balls_quantity_packaging')}{field('balls_availability_note')}</>}
          {listing.category === 'shoes' && <label>{t('shoe_size_eu')}<input name="shoe_size_eu" type="number" min="20" max="55" step="0.5" defaultValue={value('shoe_size_eu')} /><span className="field-hint">{t('shoeSizeHint')}</span></label>}
          <label>{t('price_egp')}<input name="price_egp" type="number" min="1" max="500000" step="1" defaultValue={value('price_egp')} /></label>
          <label className="checkbox-label"><input name="is_negotiable" type="checkbox" defaultChecked={state.values ? state.values.is_negotiable === 'on' : listing.is_negotiable} />{t('is_negotiable')}</label>
          <p className="field-hint">{t('offerHint')}</p>
          <button name="intent" value="save" className="button primary">{t('save')}</button>
        </div>}
        {editable && <><p>{t('requirementsHint', { count: listing.category === 'rackets' ? 3 : 1 })}</p><p>{t('photoCount', { count: listing.media_ids.length })}</p>
          {!dirty && <Link className="button secondary" href={`/account/photos?listing=${listing.id}`}>{t('photos')}</Link>}
          <p className="field-hint">{t('saveFirst')}</p><button name="intent" value="submit" disabled={dirty || !!state.values} className="button primary">{t('submit')}</button></>}
        {['pending','active','reserved'].includes(listing.status) && <><p>{t('withdrawHint')}</p><button name="intent" value="withdraw" className="button secondary">{t('withdraw')}</button></>}
        {listing.status === 'active' && <><p className="field-hint">{t('completedHint')}</p>
          {['sale','both'].includes(String(listing.offer_type)) && <button name="intent" value="sold" className="button secondary">{t('markSold')}</button>}
          {listing.category === 'rackets' && ['swap','both'].includes(String(listing.offer_type)) && <button name="intent" value="traded" className="button secondary">{t('markTraded')}</button>}
        </>}
        {['pending','active'].includes(listing.status) && <><p className="field-hint">{t('archiveHint')}</p><button name="intent" value="archive" disabled={dirty} className="button secondary">{t('archive')}</button></>}
        {['sold','traded','archived'].includes(listing.status) && <><p className="field-hint">{t('relistHint')}</p><button name="intent" value="relist" className="button primary">{t('relist')}</button></>}
      </fieldset>
    </form>
    {state.message === 'conflict' && <a className="button secondary" href={`/${locale}/account/listings/${listing.id}`}>{t('reload')}</a>}
  </section>;
}
