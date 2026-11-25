'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Eye,
  Globe,
  Info,
  Lock,
  MessageCircle,
  Shield,
  UserCheck,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { EGYPT_GOVERNORATES } from '@/lib/domain/equipment';
import { saveProfile } from './actions';
import { ShareProfile } from './share-profile';
import {
  PROFILE_TEXT_LIMITS,
  type Profile,
  type ProfileFormField,
  type ProfileIntent,
  type ProfileState,
} from './types';

export function ProfileForm({ initial }: { initial: Profile | null }) {
  const t = useTranslations('account');
  const publicText = useTranslations('publicProfile');
  const [state, action, pending] = useActionState<ProfileState, FormData>(saveProfile, {
    profile: initial,
  });
  // Controlled drafts survive action resets and saves in a different section.
  const [draft, setDraft] = useState<Partial<Record<ProfileFormField, string>>>({});
  const change = (name: ProfileFormField, value: string) =>
    setDraft((previous) => ({ ...previous, [name]: value }));
  const status = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.message) status.current?.focus();
  }, [state]);

  const p = state.profile;
  const isErrorMessage = Boolean(state.message && state.message !== 'saved');
  const bioValue = draft.bio ?? p?.bio ?? '';
  const selectedAccountType = draft.account_type ?? p?.account_type ?? 'individual';

  const field = (
    name: ProfileFormField,
    fallback = '',
    options: {
      maxLength?: number;
      dir?: 'ltr';
      required?: boolean;
      hint?: string;
      placeholder?: string;
    } = {},
  ) => {
    const fieldError = state.errors?.[name];
    const hintKey = fieldError ?? options.hint;
    return (
      <div className="form-field">
        <div className="field-header">
          <label htmlFor={name}>{t(name)}</label>
          <span className={`field-badge ${options.required ? 'is-required' : 'is-optional'}`}>
            {t(options.required ? 'requiredTag' : 'optionalTag')}
          </span>
        </div>
        <input
          id={name}
          name={name}
          type={name === 'whatsapp_e164' ? 'tel' : 'text'}
          autoComplete={name === 'whatsapp_e164' ? 'tel' : undefined}
          value={draft[name] ?? state.values?.[name] ?? fallback}
          onChange={(event) => change(name, event.target.value)}
          maxLength={options.maxLength}
          dir={options.dir}
          required={options.required}
          placeholder={options.placeholder}
          aria-invalid={!!fieldError}
          aria-describedby={hintKey ? `${name}-hint` : undefined}
        />
        {hintKey && (
          <p className={fieldError ? 'field-error' : 'field-hint'} id={`${name}-hint`}>
            {t(hintKey)}
          </p>
        )}
      </div>
    );
  };

  const basics = (
    <>
      {field('display_name', p?.display_name, {
        required: true,
        maxLength: PROFILE_TEXT_LIMITS.display_name,
      })}
      <div className="form-columns">
        <div className="form-field">
          <div className="field-header">
            <label htmlFor="governorate_slug">{t('governorate_slug')}</label>
            <span className="field-badge is-required">{t('requiredTag')}</span>
          </div>
          <select
            id="governorate_slug"
            name="governorate_slug"
            value={draft.governorate_slug ?? p?.governorate_slug ?? ''}
            onChange={(event) => change('governorate_slug', event.target.value)}
            required
          >
            <option value="">{t('chooseLocation')}</option>
            {EGYPT_GOVERNORATES.map((slug) => (
              <option key={slug} value={slug}>
                {t(`governorates.${slug}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <div className="field-header">
            <label htmlFor="account_type">{t('account_type')}</label>
            <span className="field-badge is-required">{t('requiredTag')}</span>
          </div>
          <select
            id="account_type"
            name="account_type"
            value={selectedAccountType}
            onChange={(event) => change('account_type', event.target.value)}
          >
            <option value="individual">{t('individual')}</option>
            <option value="business">{t('business')}</option>
          </select>
        </div>
      </div>
      <p className="seller-inline-hint">
        <Info size={14} aria-hidden />
        <span>{t('businessHint')}</span>
      </p>
    </>
  );

  const hidden = <input type="hidden" name="version" value={p?.version ?? ''} />;
  const button = (intent: ProfileIntent, label: string) => (
    <button
      className="button primary"
      name="intent"
      value={intent}
      disabled={pending || state.message === 'conflict' || state.message === 'sessionExpired'}
    >
      {t(pending ? 'working' : label)}
    </button>
  );

  return (
    <>
      <div
        ref={status}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        className={
          state.message
            ? `seller-feedback-banner ${isErrorMessage ? 'is-error' : 'is-success'}`
            : 'sr-only'
        }
      >
        {state.message && (
          <>
            {isErrorMessage ? (
              <AlertTriangle size={16} aria-hidden />
            ) : (
              <CheckCircle2 size={16} aria-hidden />
            )}
            <div>
              <p>{t(state.message)}</p>
              {state.message === 'conflict' && (
                <p className="seller-status-action">
                  <a href="" className="text-link">
                    {t('reload')}
                  </a>
                </p>
              )}
              {state.message === 'sessionExpired' && (
                <p className="seller-status-action">
                  <a href="./auth/signin" className="text-link">
                    {t('signin')}
                  </a>
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {!p ? (
        <div className="profile-create-layout">
          <form action={action} className="account-form seller-card" key={`create-${state.message}`}>
            <div className="detail-panel-head">
              <span className="detail-panel-icon" aria-hidden>
                <UserCheck size={18} />
              </span>
              <div>
                <h2>{t('createProfile')}</h2>
                <p className="detail-panel-subtitle">{t('privateDefault')}</p>
              </div>
            </div>

            {field('username', '', {
              dir: 'ltr',
              required: true,
              maxLength: PROFILE_TEXT_LIMITS.username,
              hint: 'usernameHint',
            })}
            {basics}
            <div className="seller-form-footer">{button('create', 'createProfile')}</div>
          </form>

          <aside className="seller-card seller-privacy-guide" aria-labelledby="privacy-guide-heading">
            <div className="detail-panel-head">
              <span className="detail-panel-icon" aria-hidden>
                <Shield size={18} />
              </span>
              <div>
                <h2 id="privacy-guide-heading">{t('privacyGuideTitle')}</h2>
                <p className="detail-panel-subtitle">{t('privacyGuideSubtitle')}</p>
              </div>
            </div>
            <div className="seller-privacy-columns">
              <div className="seller-privacy-block">
                <h3>
                  <Lock size={15} aria-hidden />
                  <span>{t('privacyPrivateHeading')}</span>
                </h3>
                <p>{t('privacyPrivateBody')}</p>
              </div>
              <div className="seller-privacy-block">
                <h3>
                  <Eye size={15} aria-hidden />
                  <span>{t('privacyPublicHeading')}</span>
                </h3>
                <p>{t('privacyPublicBody')}</p>
              </div>
            </div>
          </aside>
        </div>
      ) : (
        <div className="profile-workspace-grid">
          <div className="profile-main-column">
            {p.account_status !== 'active' && (
              <div role="alert" className="seller-feedback-banner is-error">
                <AlertTriangle size={16} aria-hidden />
                <span>{t('notAllowed')}</span>
              </div>
            )}

            <form
              action={action}
              className="account-form seller-card"
              key={`details-${p.version}-${state.message}`}
            >
              <div className="detail-panel-head">
                <span className="detail-panel-icon" aria-hidden>
                  <UserCheck size={18} />
                </span>
                <div>
                  <h2>{t('profileDetails')}</h2>
                  <p className="detail-panel-subtitle">{t('profileDetailsSubtitle')}</p>
                </div>
              </div>

              {hidden}
              {basics}

              <div className="form-columns">
                {field('district_text', p.district_text ?? '', {
                  maxLength: PROFILE_TEXT_LIMITS.district_text,
                })}
                {field('favorite_racket', p.favorite_racket ?? '', {
                  maxLength: PROFILE_TEXT_LIMITS.favorite_racket,
                })}
              </div>

              <div className="form-field">
                <div className="field-header">
                  <label htmlFor="bio">{t('bio')}</label>
                  <span className="report-char-count" dir="ltr">
                    {bioValue.length} / {PROFILE_TEXT_LIMITS.bio}
                  </span>
                </div>
                <textarea
                  id="bio"
                  name="bio"
                  maxLength={PROFILE_TEXT_LIMITS.bio}
                  rows={4}
                  value={bioValue}
                  onChange={(event) => change('bio', event.target.value)}
                />
              </div>

              <div className="seller-consent-box">
                <label className="check-field">
                  <input
                    type="checkbox"
                    name="is_public"
                    checked={draft.is_public === undefined ? p.is_public : draft.is_public === 'on'}
                    onChange={(event) => change('is_public', event.target.checked ? 'on' : '')}
                  />
                  <span className="seller-consent-copy">
                    <strong>{t('is_public')}</strong>
                    <span className="field-hint">{t('visibilityHint')}</span>
                  </span>
                </label>
              </div>

              <div className="seller-form-footer">{button('details', 'saveDetails')}</div>
            </form>

            <form
              action={action}
              className="account-form seller-card"
              key={`contact-${p.version}-${state.message}`}
            >
              <div className="detail-panel-head">
                <span className="detail-panel-icon" aria-hidden>
                  <MessageCircle size={18} />
                </span>
                <div>
                  <h2>{t('contactTitle')}</h2>
                  <p className="detail-panel-subtitle">{t('contactSubtitle')}</p>
                </div>
              </div>

              {hidden}
              <input type="hidden" name="contact_version" value={p.contact_version} />
              {field('whatsapp_e164', p.whatsapp_e164 ?? '', {
                dir: 'ltr',
                maxLength: PROFILE_TEXT_LIMITS.whatsapp_e164,
                hint: 'phoneHint',
                placeholder: '+2010XXXXXXXX',
              })}

              <div className="seller-consent-box">
                <label className="check-field">
                  <input
                    type="checkbox"
                    name="public_contact_consent"
                    checked={
                      draft.public_contact_consent === undefined
                        ? p.public_contact_consent
                        : draft.public_contact_consent === 'on'
                    }
                    onChange={(event) =>
                      change('public_contact_consent', event.target.checked ? 'on' : '')
                    }
                  />
                  <span className="seller-consent-copy">
                    <strong>{t('public_contact_consent')}</strong>
                    <span className="field-hint">{t('contactHint')}</span>
                  </span>
                </label>
              </div>

              <div className="seller-form-footer">{button('contact', 'saveContact')}</div>
            </form>
          </div>

          <aside className="profile-side-column">
            <section className="seller-card seller-storefront-card">
              <div className="detail-panel-head">
                <span className="detail-panel-icon" aria-hidden>
                  <Globe size={18} />
                </span>
                <div>
                  <h2>{t('usernameTitle')}</h2>
                  <p className="seller-handle-pill">
                    <bdi>@{p.username}</bdi>
                  </p>
                </div>
              </div>

              <p className="profile-visibility-pill">
                {t(p.is_public ? 'publicSelected' : 'privateSelected')} · <bdi>@{p.username}</bdi>
              </p>
              <p className="field-hint">{t('usernameFixed')}</p>

              {p.is_public && p.account_status === 'active' ? (
                <div className="seller-storefront-share">
                  <Link
                    href={`/@${p.username}`}
                    prefetch={false}
                    className="button primary seller-storefront-link"
                  >
                    <ExternalLink size={16} aria-hidden />
                    <span>{publicText('view')}</span>
                  </Link>
                  <div className="seller-qr-embed">
                    <p className="seller-qr-heading">{publicText('shareHeading')}</p>
                    <ShareProfile username={p.username} publicId={p.public_id} />
                  </div>
                </div>
              ) : (
                <p className="seller-private-storefront-note">
                  <Lock size={15} aria-hidden />
                  <span>{t('storefrontPrivateNote')}</span>
                </p>
              )}
            </section>

            <section className="seller-card seller-privacy-guide">
              <div className="detail-panel-head">
                <span className="detail-panel-icon" aria-hidden>
                  <Shield size={18} />
                </span>
                <div>
                  <h2>{t('privacyGuideTitle')}</h2>
                  <p className="detail-panel-subtitle">{t('privacyGuideSubtitle')}</p>
                </div>
              </div>
              <div className="seller-privacy-columns">
                <div className="seller-privacy-block">
                  <h3>
                    <Eye size={15} aria-hidden />
                    <span>{t('privacyPublicHeading')}</span>
                  </h3>
                  <p>{t('privacyPublicBody')}</p>
                </div>
                <div className="seller-privacy-block">
                  <h3>
                    <Lock size={15} aria-hidden />
                    <span>{t('privacyPrivateHeading')}</span>
                  </h3>
                  <p>{t('privacyPrivateBody')}</p>
                </div>
              </div>
            </section>
          </aside>
        </div>
      )}
    </>
  );
}
