'use client';

import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { MODERATION_NOTE_MAX_LENGTH } from '@/lib/domain/equipment';
import { resolveReport, submitReport } from './actions';
import { REPORT_REASONS, type ReportTargetType } from './types';

export function ReportForm({ type, target }: { type: ReportTargetType; target: string }) {
  const t = useTranslations('reports');
  const [state, action, busy] = useActionState(submitReport.bind(null, type, target), {});

  return (
    <details className="disclosure">
      <summary>{t('report')}</summary>
      <form action={action} className="account-form">
        <p>{t('hint')}</p>
        {state.message && <p role="status">{t(state.message)}</p>}
        {state.message === 'signin' && <Link href="/auth/signin">{t('signInLink')}</Link>}
        <label>
          {t('reason')}
          <select name="reason" required defaultValue={state.reason}>
            {REPORT_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {t(reason)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('details')}
          <textarea
            name="details"
            maxLength={MODERATION_NOTE_MAX_LENGTH}
            rows={3}
            defaultValue={state.details}
          />
        </label>
        <button className="button secondary" disabled={busy || state.message === 'submitted'}>
          {t('send')}
        </button>
      </form>
    </details>
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
