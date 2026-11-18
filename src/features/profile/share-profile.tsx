'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

export function ShareProfile({ username }: { username: string }) {
  const t = useTranslations('publicProfile');
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  async function copy() {
    const url = `${window.location.origin}/@${encodeURIComponent(username)}`;
    try { await navigator.clipboard.writeText(url); setMessage('copied'); }
    catch { setLink(url); setMessage('copyManually'); }
  }
  return <div><button className="button secondary" onClick={copy}>{t('copy')}</button>
    {message && <p role="status">{t(message)}</p>}
    {link && <input aria-label={t('copy')} readOnly value={link} dir="ltr" onFocus={e => e.currentTarget.select()} />}
  </div>;
}
