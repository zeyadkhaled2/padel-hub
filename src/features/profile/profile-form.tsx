'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { saveProfile } from './actions';
import { governorates, type Profile, type ProfileState } from './types';

export function ProfileForm({ initial }: { initial: Profile | null }) {
  const t = useTranslations('account');
  const [state, action, pending] = useActionState<ProfileState, FormData>(saveProfile, { profile: initial });
  // Controlled drafts survive action resets and saves in a different section.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const change = (name: string, value: string) => setDraft(previous => ({ ...previous, [name]: value }));
  const status = useRef<HTMLDivElement>(null);
  useEffect(() => { if (state.message) status.current?.focus(); }, [state]);
  const p = state.profile;
  const field = (name: string, fallback = '', options: { maxLength?: number; dir?: 'ltr'; required?: boolean; hint?: string } = {}) => <div className="form-field">
    <label htmlFor={name}>{t(name)}</label>
    <input id={name} name={name} type={name === 'whatsapp_e164' ? 'tel' : 'text'} autoComplete={name === 'whatsapp_e164' ? 'tel' : undefined} value={draft[name] ?? state.values?.[name] ?? fallback} onChange={event => change(name, event.target.value)} maxLength={options.maxLength} dir={options.dir} required={options.required} aria-invalid={!!state.errors?.[name]} aria-describedby={state.errors?.[name] || options.hint ? `${name}-hint` : undefined} />
    {(state.errors?.[name] || options.hint) && <p className={state.errors?.[name] ? 'field-error' : 'field-hint'} id={`${name}-hint`}>{t(state.errors?.[name] ?? options.hint!)}</p>}
  </div>;
  const basics = <>
    {field('display_name', p?.display_name, { required: true, maxLength: 80 })}
    <div className="form-columns"><div className="form-field"><label htmlFor="governorate_slug">{t('governorate_slug')}</label><select id="governorate_slug" name="governorate_slug" value={draft.governorate_slug ?? p?.governorate_slug ?? ''} onChange={event => change('governorate_slug', event.target.value)} required><option value="">{t('chooseLocation')}</option>{governorates.map(slug => <option key={slug} value={slug}>{t(`governorates.${slug}`)}</option>)}</select></div>
      <div className="form-field"><label htmlFor="account_type">{t('account_type')}</label><select id="account_type" name="account_type" value={draft.account_type ?? p?.account_type ?? 'individual'} onChange={event => change('account_type', event.target.value)}><option value="individual">{t('individual')}</option><option value="business">{t('business')}</option></select></div></div>
    <p className="field-hint">{t('businessHint')}</p>
  </>;
  const hidden = <input type="hidden" name="version" value={p?.version ?? ''} />;
  const button = (intent: string, label: string) => <button className="button primary" name="intent" value={intent} disabled={pending || state.message === 'conflict' || state.message === 'sessionExpired'}>{t(pending ? 'working' : label)}</button>;
  return <>
    <div ref={status} tabIndex={-1} role="status" aria-live="polite" className={state.message ? 'form-notice' : undefined}>
      {state.message && t(state.message)}
      {state.message === 'conflict' && <p><a href="">{t('reload')}</a></p>}
      {state.message === 'sessionExpired' && <p><a href="./auth/signin">{t('signin')}</a></p>}
    </div>
    {!p ? <form action={action} className="account-form" key={`create-${state.message}`}>
      <h2>{t('createProfile')}</h2><p>{t('privateDefault')}</p>
      {field('username', '', { dir: 'ltr', required: true, maxLength: 24, hint: 'usernameHint' })}{basics}
      {button('create', 'createProfile')}
    </form> : <div className="profile-sections">
      <p className="profile-visibility">{t(p.is_public ? 'publicSelected' : 'privateSelected')} · <bdi>@{p.username}</bdi></p>
      {p.account_status !== 'active' && <p className="form-notice">{t('notAllowed')}</p>}
      <form action={action} className="account-form" key={`details-${p.version}-${state.message}`}>
        <h2>{t('profileDetails')}</h2>{hidden}{basics}
        {field('district_text', p.district_text ?? '', { maxLength: 80 })}
        <div className="form-field"><label htmlFor="bio">{t('bio')}</label><textarea id="bio" name="bio" maxLength={500} rows={4} value={draft.bio ?? p.bio ?? ''} onChange={event => change('bio', event.target.value)} /></div>
        {field('favorite_racket', p.favorite_racket ?? '', { maxLength: 120 })}
        <label className="check-field"><input type="checkbox" name="is_public" checked={draft.is_public === undefined ? p.is_public : draft.is_public === 'on'} onChange={event => change('is_public', event.target.checked ? 'on' : '')} /><span>{t('is_public')}</span></label>
        <p className="field-hint">{t('visibilityHint')}</p>{button('details', 'saveDetails')}
      </form>
      <form action={action} className="account-form" key={`rename-${p.version}-${state.message}`}>
        <h2>{t('usernameTitle')}</h2>{hidden}{field('username', p.username, { dir: 'ltr', required: true, maxLength: 24, hint: 'usernameHint' })}
        <p className="field-hint">{t('renameHint')}</p>{button('rename', 'saveUsername')}
      </form>
      <form action={action} className="account-form" key={`contact-${p.version}-${state.message}`}>
        <h2>{t('contactTitle')}</h2>{hidden}<input type="hidden" name="contact_version" value={p.contact_version} />
        {field('whatsapp_e164', p.whatsapp_e164 ?? '', { dir: 'ltr', maxLength: 16, hint: 'phoneHint' })}
        <label className="check-field"><input type="checkbox" name="public_contact_consent" checked={draft.public_contact_consent === undefined ? p.public_contact_consent : draft.public_contact_consent === 'on'} onChange={event => change('public_contact_consent', event.target.checked ? 'on' : '')} /><span>{t('public_contact_consent')}</span></label>
        <p className="field-hint">{t('contactHint')}</p>{button('contact', 'saveContact')}
      </form>
    </div>}
  </>;
}
