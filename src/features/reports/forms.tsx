'use client';

import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type SyntheticEvent,
} from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AlertCircle, CheckCircle2, Flag, ShieldCheck, X } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { MODERATION_NOTE_MAX_LENGTH } from '@/lib/domain/equipment';
import { resolveReport, submitReport } from './actions';
import { REPORT_REASONS, type ReportReason, type ReportTargetType } from './types';

export function ReportForm({ type, target }: { type: ReportTargetType; target: string }) {
  const t = useTranslations('reports');
  const [state, action, busy] = useActionState(submitReport.bind(null, type, target), {});
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [details, setDetails] = useState('');
  const [clientError, setClientError] = useState<'reasonRequired' | 'detailsTooLong' | null>(null);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const titleId = useId();
  const descId = useId();
  const reasonId = useId();
  const detailsId = useId();

  const isSubmitted = state.message === 'submitted';

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) {
        dialog.showModal();
      }
      if (isSubmitted) {
        closeButtonRef.current?.focus();
      } else {
        selectRef.current?.focus();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open, isSubmitted]);

  function openDialog() {
    setClientError(null);
    setOpen(true);
  }

  function closeDialog() {
    if (busy) return;
    const dialog = dialogRef.current;
    if (dialog?.open) {
      dialog.close();
    }
    setOpen(false);
    setClientError(null);
    triggerRef.current?.focus();
  }

  function handleDialogCancel(event: SyntheticEvent<HTMLDialogElement>) {
    if (busy) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    closeDialog();
  }

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current && !busy) {
      closeDialog();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!(REPORT_REASONS as readonly string[]).includes(reason as ReportReason)) {
      event.preventDefault();
      setClientError('reasonRequired');
      return;
    }
    if (details.trim().length > MODERATION_NOTE_MAX_LENGTH) {
      event.preventDefault();
      setClientError('detailsTooLong');
      return;
    }
    setClientError(null);
  }

  const statusTone = clientError
    ? 'is-error'
    : state.message === 'submitted'
      ? 'is-success'
      : state.message === 'signin'
        ? 'is-info'
        : state.message
          ? 'is-error'
          : '';

  return (
    <div className="report-control">
      <button
        ref={triggerRef}
        type="button"
        className="report-trigger"
        onClick={openDialog}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Flag size={15} aria-hidden />
        <span>{t('report')}</span>
      </button>

      <dialog
        ref={dialogRef}
        className="report-dialog"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onCancel={handleDialogCancel}
        onClick={handleBackdropClick}
      >
        <div className="report-dialog-panel">
          <div className="report-dialog-header">
            <div className="report-dialog-title-wrap">
              <span className="report-dialog-icon" aria-hidden>
                <Flag size={18} />
              </span>
              <h2 id={titleId}>
                {t(type === 'listing' ? 'dialogTitleListing' : 'dialogTitleProfile')}
              </h2>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              className="report-dialog-close"
              onClick={closeDialog}
              disabled={busy}
              aria-label={t('close')}
            >
              <X size={18} aria-hidden />
            </button>
          </div>

          <p id={descId} className="report-dialog-hint">
            {t('hint')}
          </p>

          {(clientError || state.message) && (
            <div role="status" aria-live="polite" className={`report-status ${statusTone}`}>
              {state.message === 'submitted' ? (
                <CheckCircle2 size={18} aria-hidden />
              ) : (
                <AlertCircle size={18} aria-hidden />
              )}
              <div className="report-status-body">
                <p>
                  {clientError === 'detailsTooLong'
                    ? t('detailsTooLong', { max: MODERATION_NOTE_MAX_LENGTH })
                    : clientError
                      ? t(clientError)
                      : state.message
                        ? t(state.message)
                        : null}
                </p>
                {!clientError && state.message === 'signin' && (
                  <Link href="/auth/signin" className="button secondary report-signin-link">
                    {t('signInLink')}
                  </Link>
                )}
              </div>
            </div>
          )}

          <form action={action} onSubmit={handleSubmit} className="report-dialog-form">
            <div className="form-field">
              <label htmlFor={reasonId}>{t('reason')}</label>
              <select
                ref={selectRef}
                id={reasonId}
                name="reason"
                required
                value={reason}
                disabled={busy || isSubmitted}
                onChange={(event) => {
                  setReason(event.target.value);
                  setClientError(null);
                }}
              >
                {REPORT_REASONS.map((option) => (
                  <option key={option} value={option}>
                    {t(option)}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <div className="report-label-row">
                <label htmlFor={detailsId}>{t('details')}</label>
                <span className="report-char-count" aria-live="off">
                  {t('detailsCount', {
                    count: details.length,
                    max: MODERATION_NOTE_MAX_LENGTH,
                  })}
                </span>
              </div>
              <textarea
                id={detailsId}
                name="details"
                maxLength={MODERATION_NOTE_MAX_LENGTH}
                rows={4}
                value={details}
                disabled={busy || isSubmitted}
                placeholder={t('detailsPlaceholder')}
                onChange={(event) => {
                  setDetails(event.target.value);
                  setClientError(null);
                }}
              />
            </div>

            <p className="report-privacy-note">
              <ShieldCheck size={15} aria-hidden />
              <span>{t('privacyNote')}</span>
            </p>

            <div className="report-dialog-actions">
              <button
                type="button"
                className="button secondary"
                onClick={closeDialog}
                disabled={busy}
              >
                {t(isSubmitted ? 'close' : 'cancel')}
              </button>
              <button
                type="submit"
                className="button primary"
                disabled={busy || isSubmitted}
              >
                {busy ? t('sending') : t('send')}
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </div>
  );
}

export function ResolveForm({
  id,
  version,
  targetVersion,
  type,
}: {
  id: string;
  version: number;
  targetVersion: number;
  type: ReportTargetType;
}) {
  const t = useTranslations('reports');
  const locale = useLocale();
  const [state, action, busy] = useActionState(
    resolveReport.bind(null, locale, id, version, targetVersion),
    {},
  );
  const moderationAction = type === 'listing' ? 'remove' : 'suspend';

  return (
    <form action={action} className="account-form">
      {state.message && <p role="alert">{t(state.message)}</p>}
      {state.message === 'conflict' && <a href="">{t('reload')}</a>}
      <label>
        {t('note')}
        <textarea
          name="details"
          required
          maxLength={MODERATION_NOTE_MAX_LENGTH}
          rows={2}
          defaultValue={state.details}
        />
      </label>
      <button
        name="intent"
        value="dismiss"
        className="button secondary"
        disabled={busy || state.message === 'conflict'}
      >
        {t('dismiss')}
      </button>
      <button
        name="intent"
        value={moderationAction}
        className="button secondary"
        disabled={busy || state.message === 'conflict'}
      >
        {t(moderationAction)}
      </button>
      <p className="field-hint">{t('actionHint')}</p>
    </form>
  );
}
