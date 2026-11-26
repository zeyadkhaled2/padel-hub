'use client';

import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { MODERATION_NOTE_MAX_LENGTH } from '@/lib/domain/equipment';
import { verifyAdmin } from './actions';
import type { ReviewDecisionState } from './types';

export function MfaForm({ factor }: { factor?: string }) {
  const t = useTranslations('admin');
  const locale = useLocale();
  const [state, action, busy] = useActionState(verifyAdmin.bind(null, locale), {});

  return (
    <form action={action} className="account-form">
      {state.message && <p role="alert">{t(state.message)}</p>}
      {state.secret && (
        <>
          <p>{t('setupHint')}</p>
          <code className="mfa-secret" data-testid="mfa-secret">
            {state.secret}
          </code>
        </>
      )}
      {factor || state.factor ? (
        <>
          <input name="factor" type="hidden" value={factor || state.factor} />
          <label htmlFor="mfa-code">{t('code')}</label>
          <input
            id="mfa-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
          />
          <button name="intent" value="verify" className="button primary" disabled={busy}>
            {t('verify')}
          </button>
        </>
      ) : (
        <button name="intent" value="enroll" className="button primary" disabled={busy}>
          {t('enroll')}
        </button>
      )}
    </form>
  );
}

export function ReviewForm({
  action,
  removal = false,
}: {
  action: (state: ReviewDecisionState, form: FormData) => Promise<ReviewDecisionState>;
  removal?: boolean;
}) {
  const t = useTranslations('admin');
  const [state, submit, busy] = useActionState(action, {});

  return (
    <form action={submit} className="account-form">
      {state.message && <p role="alert">{t(state.message)}</p>}
      {state.message === 'conflict' && <a href="">{t('reload')}</a>}
      {removal && <p className="form-notice">{t('inventory.removeHint')}</p>}
      <label htmlFor="reason">{t(removal ? 'inventory.removeReason' : 'reason')}</label>
      <textarea
        id="reason"
        name="reason"
        defaultValue={state.reason}
        maxLength={MODERATION_NOTE_MAX_LENGTH}
        rows={3}
        required={removal}
      />
      {!removal && <button
        name="intent"
        value="approve"
        disabled={busy || state.message === 'conflict'}
        className="button primary"
      >
        {t('approve')}
      </button>}
      <button
        name="intent"
        value={removal ? 'remove' : 'reject'}
        disabled={busy || state.message === 'conflict'}
        className="button secondary"
      >
        {t(removal ? 'inventory.remove' : 'reject')}
      </button>
    </form>
  );
}
