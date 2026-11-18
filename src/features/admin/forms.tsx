'use client';
import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { verifyAdmin } from './actions';

export function MfaForm({ factor }: { factor?: string }) {
  const t = useTranslations('admin'); const locale = useLocale();
  const [state, action, busy] = useActionState(verifyAdmin.bind(null,locale), {});
  return <form action={action} className="account-form">
    {state.message && <p role="alert">{t(state.message)}</p>}
    {state.secret && <><p>{t('setupHint')}</p><code className="mfa-secret" data-testid="mfa-secret">{state.secret}</code></>}
    {factor || state.factor ? <><input name="factor" type="hidden" value={factor || state.factor} /><label htmlFor="mfa-code">{t('code')}</label><input id="mfa-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required /><button name="intent" value="verify" className="button primary" disabled={busy}>{t('verify')}</button></> : <button name="intent" value="enroll" className="button primary" disabled={busy}>{t('enroll')}</button>}
  </form>;
}
export function ReviewForm({ action }: { action: (state: {message?: string; reason?: string}, form: FormData) => Promise<{message?: string; reason?: string}> }) {
  const t = useTranslations('admin');
  const [state, submit, busy] = useActionState(action, {});
  return <form action={submit} className="account-form">
    {state.message && <p role="alert">{t(state.message)}</p>}
    {state.message === 'conflict' && <a href="">{t('reload')}</a>}
    <label htmlFor="reason">{t('reason')}</label><textarea id="reason" name="reason" defaultValue={state.reason} maxLength={1000} rows={3} />
    <button name="intent" value="approve" disabled={busy || state.message === 'conflict'} className="button primary">{t('approve')}</button>
    <button name="intent" value="reject" disabled={busy || state.message === 'conflict'} className="button secondary">{t('reject')}</button>
  </form>;
}
