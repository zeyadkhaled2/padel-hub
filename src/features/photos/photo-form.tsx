'use client';
/* eslint-disable @next/next/no-img-element -- Protected photos must bypass the shared optimizer. */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { PHOTO_CLIENT_ERROR_CODES, PHOTO_LIMITS } from './types';

export function PhotoForm({
  listing,
}: {
  listing: { id: string; version: number; media_ids: string[] };
}) {
  const t = useTranslations('photos');
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [replace, setReplace] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function upload() {
    if (!file) return;
    if (file.size > PHOTO_LIMITS.maxBytes) {
      setMessage('tooLarge');
      return;
    }
    setProgress(0);
    setMessage('');
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/listings/${listing.id}/photos`);
    xhr.timeout = 60000;
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('X-Listing-Version', String(listing.version));
    if (replace) xhr.setRequestHeader('X-Replace-Photo', replace);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        setProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      setProgress(null);
      if (xhr.status === 201) {
        setFile(null);
        setPreview('');
        setReplace(null);
        if (fileInput.current) fileInput.current.value = '';
        setMessage('saved');
        router.refresh();
      } else {
        let code = 'unavailable';
        try {
          code = JSON.parse(xhr.responseText).error;
        } catch {
          /* Generic retry message. */
        }
        setMessage(
          (PHOTO_CLIENT_ERROR_CODES as readonly string[]).includes(code) ? code : 'unavailable',
        );
      }
    };
    xhr.onerror = xhr.ontimeout = () => {
      setProgress(null);
      setMessage('unavailable');
    };
    xhr.send(file);
  }

  const busy = progress !== null;
  return (
    <section aria-label={t('gallery')}>
      <p className="field-hint">{t('limits')}</p>
      <div className="photo-grid">
        {listing.media_ids.map((id, index) => (
          <figure key={id}>
            <img
              src={`/api/media/${id}?variant=card`}
              alt={t('photoAlt', { number: index + 1 })}
              width={320}
              height={240}
            />
            <figcaption>{t('photoAlt', { number: index + 1 })}</figcaption>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => {
                setReplace(id);
                setMessage('');
              }}
            >
              {t('replace')}
            </button>
          </figure>
        ))}
      </div>
      {listing.media_ids.length === 0 && <p className="form-notice">{t('empty')}</p>}
      <div className="account-form">
        {replace && (
          <p>
            {t('replacement')}{' '}
            <button className="button secondary" disabled={busy} onClick={() => setReplace(null)}>
              {t('cancel')}
            </button>
          </p>
        )}
        <label htmlFor="equipment-photo">{t('choose')}</label>
        <input
          ref={fileInput}
          id="equipment-photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(event) => {
            const next = event.target.files?.[0] ?? null;
            setFile(next);
            setPreview(next ? URL.createObjectURL(next) : '');
            setMessage('');
          }}
        />
        {file && preview && (
          <figure className="photo-preview">
            <img src={preview} alt={t('unsaved')} width={320} height={240} />
            <figcaption>{t('unsaved')}</figcaption>
          </figure>
        )}
        {busy && (
          <>
            <progress max={100} value={progress} aria-label={t('uploading')} />
            <p role="status">{progress === 100 ? t('processing') : t('uploading')}</p>
          </>
        )}
        {!busy && message && (
          <p role="status" className="form-notice">
            {t(message)}
          </p>
        )}
        {message === 'conflict' && (
          <button
            className="button secondary"
            onClick={() => {
              setMessage('');
              router.refresh();
            }}
          >
            {t('reload')}
          </button>
        )}
        <button
          className="button primary"
          disabled={
            !file ||
            busy ||
            message === 'conflict' ||
            (!replace && listing.media_ids.length >= PHOTO_LIMITS.maxPerListing)
          }
          onClick={upload}
        >
          {t(replace ? 'replace' : 'upload')}
        </button>
      </div>
    </section>
  );
}
