'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Download, Link2, QrCode } from 'lucide-react';

export function ShareProfile({ username, publicId }: { username: string; publicId: string }) {
  const t = useTranslations('publicProfile');
  const [message, setMessage] = useState<'copied' | 'copyManually' | 'qrError' | ''>('');
  const [link, setLink] = useState('');
  const [qr, setQr] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const qrPanelId = useId();

  async function showQr() {
    if (open) {
      setOpen(false);
      return;
    }
    if (qr) {
      setOpen(true);
      return;
    }
    setBusy(true);
    try {
      const { toDataURL } = await import('qrcode');
      setQr(
        await toDataURL(`${window.location.origin}/api/profiles/${publicId}`, {
          width: 768,
          margin: 4,
          errorCorrectionLevel: 'M',
          color: { dark: '#000000', light: '#ffffff' },
        }),
      );
      setOpen(true);
    } catch {
      setMessage('qrError');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    const url = `${window.location.origin}/@${encodeURIComponent(username)}`;
    try {
      await navigator.clipboard.writeText(url);
      setLink('');
      setMessage('copied');
    } catch {
      setLink(url);
      setMessage('copyManually');
    }
  }

  return (
    <div className="share-profile">
      <div className="share-profile-actions">
        <button type="button" className="button secondary share-action-btn" onClick={copy}>
          {message === 'copied' ? (
            <Check size={16} aria-hidden />
          ) : (
            <Link2 size={16} aria-hidden />
          )}
          <span>{t('copy')}</span>
        </button>

        <button
          type="button"
          className={`button secondary share-action-btn${open ? ' is-active' : ''}`}
          onClick={showQr}
          disabled={busy}
          aria-expanded={open}
          aria-controls={qrPanelId}
        >
          <QrCode size={16} aria-hidden />
          <span>{t(busy ? 'qrLoading' : open ? 'hideQr' : 'showQr')}</span>
        </button>
      </div>

      {message && (
        <p
          role="status"
          aria-live="polite"
          className={`share-feedback${message === 'qrError' ? ' is-error' : ''}`}
        >
          {message === 'copied' && <Check size={15} aria-hidden />}
          <span>{t(message)}</span>
        </p>
      )}

      {link && (
        <div className="share-manual-copy">
          <input
            aria-label={t('copy')}
            readOnly
            value={link}
            dir="ltr"
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
      )}

      {open && (
        <div id={qrPanelId} className="profile-qr">
          <div className="profile-qr-frame">
            {/* eslint-disable-next-line @next/next/no-img-element -- Locally generated PNG, not remote image content. */}
            <img src={qr} width={220} height={220} alt={t('qrAlt', { username })} />
          </div>
          <div className="profile-qr-body">
            <h3>{t('qrTitle')}</h3>
            <p className="profile-qr-handle">
              <bdi>@{username}</bdi>
            </p>
            <p className="profile-qr-hint">{t('qrHint')}</p>
            <a
              className="button primary profile-qr-download"
              href={qr}
              download={`padelhub-${username}-qr.png`}
            >
              <Download size={16} aria-hidden />
              <span>{t('downloadQr')}</span>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
