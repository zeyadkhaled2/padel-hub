'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

export function ShareProfile({ username, publicId }: { username: string; publicId: string }) {
  const t = useTranslations('publicProfile');
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  const [qr, setQr] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function showQr() {
    if (open) { setOpen(false); return; }
    if (qr) { setOpen(true); return; }
    setBusy(true);
    try {
      const { toDataURL } = await import('qrcode');
      setQr(await toDataURL(`${window.location.origin}/api/profiles/${publicId}`, {
        width: 768, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' },
      }));
      setOpen(true);
    } catch { setMessage('qrError'); }
    finally { setBusy(false); }
  }
  async function copy() {
    const url = `${window.location.origin}/@${encodeURIComponent(username)}`;
    try { await navigator.clipboard.writeText(url); setMessage('copied'); }
    catch { setLink(url); setMessage('copyManually'); }
  }
  return <div><button className="button secondary" onClick={copy}>{t('copy')}</button>
    <button className="button secondary" onClick={showQr} disabled={busy} aria-expanded={open}>{t(busy ? 'qrLoading' : open ? 'hideQr' : 'showQr')}</button>
    {open && <div className="profile-qr">
      {/* eslint-disable-next-line @next/next/no-img-element -- Locally generated PNG, not remote image content. */}
      <img src={qr} width={256} height={256} alt={t('qrAlt', { username })} />
      <p>{t('qrHint')}</p>
      <a className="button secondary" href={qr} download={`padelhub-${username}-qr.png`}>{t('downloadQr')}</a>
    </div>}
    {message && <p role="status">{t(message)}</p>}
    {link && <input aria-label={t('copy')} readOnly value={link} dir="ltr" onFocus={e => e.currentTarget.select()} />}
  </div>;
}
