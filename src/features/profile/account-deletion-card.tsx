'use client';

import { useActionState, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { requestAccountDeletion } from './actions';
import type { AccountDeletionRequest } from './types';
import { ACCOUNT_DELETION_REASON_MAX } from './validation';

function formatRequestDate(iso: string, locale: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(parsed);
}

export function AccountDeletionCard({
  initial,
  loadError = false,
}: {
  initial: AccountDeletionRequest | null;
  loadError?: boolean;
}) {
  const t = useTranslations('account.deletion');
  const locale = useLocale();
  const [state, action, pending] = useActionState(
    requestAccountDeletion.bind(null, locale),
    { request: initial, reason: '' },
  );
  const [reasonLength, setReasonLength] = useState(0);

  const activeRequest = state.request?.status === 'pending' ? state.request : null;

  return (
    <section
      id="account-deletion"
      aria-labelledby="account-deletion-heading"
      className="seller-card account-deletion-card"
    >
      <div className="account-deletion-header">
        <span className="account-deletion-icon" aria-hidden>
          <Trash2 size={18} />
        </span>
        <div>
          <h2 id="account-deletion-heading">{t('title')}</h2>
          <p className="field-hint">{t('subtitle')}</p>
        </div>
      </div>

      {loadError ? (
        <p role="alert" className="form-notice">
          {t('loadFailed')}
        </p>
      ) : activeRequest ? (
        <div role="status" className="seller-feedback-banner is-success account-deletion-status">
          <CheckCircle2 size={18} aria-hidden />
          <div>
            <p>
              <strong>{t('pendingHeading')}</strong>
            </p>
            <p className="field-hint">
              {t('pendingBody', {
                date: `${formatRequestDate(activeRequest.requested_at, locale)} UTC`,
              })}
            </p>
            <p className="field-hint">{t('pendingNextSteps')}</p>
          </div>
        </div>
      ) : (
        <div className="account-deletion-body">
          <div className="seller-consequence-box">
            <p>{t('whatHappens')}</p>
            <p className="field-hint">{t('manualNote')}</p>
          </div>

          <form action={action} className="account-form seller-admin-form">
            <label htmlFor="deletion-reason">
              {t('reasonLabel')}{' '}
              <span className="field-counter" dir="ltr">
                {reasonLength} / {ACCOUNT_DELETION_REASON_MAX}
              </span>
            </label>
            <textarea
              id="deletion-reason"
              name="reason"
              rows={3}
              maxLength={ACCOUNT_DELETION_REASON_MAX}
              defaultValue={state.reason ?? ''}
              onChange={(event) => setReasonLength(event.target.value.length)}
              placeholder={t('reasonPlaceholder')}
            />

            <label className="seller-confirm-check" htmlFor="deletion-confirm">
              <input
                id="deletion-confirm"
                name="confirm"
                type="checkbox"
                value="on"
                required
              />
              <span>{t('confirmLabel')}</span>
            </label>

            <div aria-live="polite" aria-atomic="true">
              {state.message && state.message !== 'requested' && (
                <p role="alert" className="seller-feedback-banner is-error">
                  <AlertTriangle size={16} aria-hidden />
                  <span>{t(`errors.${state.message}`)}</span>
                </p>
              )}
            </div>

            <div className="seller-form-actions">
              <button
                type="submit"
                className="button seller-danger-button"
                disabled={pending}
              >
                {t(pending ? 'submitting' : 'submit')}
              </button>
              <Link href="/privacy" className="button secondary">
                {t('privacyLink')}
              </Link>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
