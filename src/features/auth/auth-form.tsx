'use client';

import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { authenticate } from './actions';

export function AuthForm({ mode, callbackError = false }: { mode: 'signin' | 'signup'; callbackError?: boolean }) {
  const t = useTranslations('account');
  const locale = useLocale();
  const [state, action, pending] = useActionState(authenticate.bind(null, locale, mode), {});
  return <>
    {callbackError && <p className="form-notice" role="alert">{t('callbackFailed')}</p>}
    <form action={action} className="account-form">
      <label htmlFor="email">{t('email')}</label>
      <input id="email" name="email" type="email" dir="ltr" autoComplete="email" required maxLength={254} defaultValue={state.email} aria-invalid={!!state.errors?.email} aria-describedby={state.errors?.email ? 'email-error' : undefined} />
      {state.errors?.email && <p id="email-error" className="field-error">{t(state.errors.email)}</p>}
      <label htmlFor="password">{t('password')}</label>
      <input id="password" name="password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={mode === 'signup' ? 8 : 1} maxLength={128} aria-invalid={!!state.errors?.password} aria-describedby="password-hint" />
      <p id="password-hint" className="field-hint">{t(state.errors?.password ?? 'passwordHint')}</p>
      <div aria-live="polite" aria-atomic="true">{state.message && <p className="form-notice">{t(state.message)}</p>}</div>
      <button className="button primary" disabled={pending}>{t(pending ? 'working' : mode)}</button>
    </form>
    <p className="account-switch"><Link href={`/auth/${mode === 'signin' ? 'signup' : 'signin'}`}>{t(mode === 'signin' ? 'newAccount' : 'haveAccount')}</Link></p>
  </>;
}
