'use client';
/* eslint-disable @next/next/no-img-element -- Protected photos must bypass the shared optimizer. */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  ImagePlus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { detachListingPhoto } from './actions';
import { PHOTO_CLIENT_ERROR_CODES, PHOTO_LIMITS } from './types';

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PhotoForm({
  listing,
}: {
  listing: {
    id: string;
    version: number;
    media_ids: string[];
    title?: string | null;
  };
}) {
  const t = useTranslations('photos');
  const locale = useLocale();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [replace, setReplace] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [detachingId, setDetachingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [localSnapshot, setLocalSnapshot] = useState<{
    version: number;
    media_ids: string[];
  } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const effective =
    localSnapshot && localSnapshot.version > listing.version
      ? localSnapshot
      : { version: listing.version, media_ids: listing.media_ids };
  const version = effective.version;
  const mediaIds = effective.media_ids;

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const count = mediaIds.length;
  const minPhotos = PHOTO_LIMITS.minPerListing;
  const maxPhotos = PHOTO_LIMITS.maxPerListing;
  const remainingRequired = Math.max(0, minPhotos - count);
  const atMaximum = count >= maxPhotos;
  const exceedsMax = count > maxPhotos;
  const emptySlotsCount = Math.max(0, maxPhotos - count);
  const replacingIndex = replace ? mediaIds.indexOf(replace) : -1;

  function clearSelectedFile() {
    setFile(null);
    setPreview('');
    if (fileInput.current) fileInput.current.value = '';
  }

  function upload() {
    if (!file) return;
    if (file.size > PHOTO_LIMITS.maxBytes) {
      setMessage('tooLarge');
      return;
    }
    setProgress(0);
    setMessage('');
    const currentMediaIds = mediaIds;
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/listings/${listing.id}/photos`);
    xhr.timeout = 60000;
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('X-Listing-Version', String(version));
    if (replace) xhr.setRequestHeader('X-Replace-Photo', replace);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        setProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      setProgress(null);
      if (xhr.status === 201) {
        try {
          const saved = JSON.parse(xhr.responseText) as { id?: string; version?: number };
          if (typeof saved.version === 'number' && typeof saved.id === 'string') {
            const nextMediaIds = replace
              ? currentMediaIds.map((item) => (item === replace ? saved.id! : item))
              : [...currentMediaIds, saved.id];
            setLocalSnapshot({ version: saved.version, media_ids: nextMediaIds });
          }
        } catch {
          /* Server refresh below will sync state. */
        }
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

  async function handleDetach(mediaId: string) {
    if (progress !== null || detachingId !== null) return;
    setDetachingId(mediaId);
    setMessage('');
    try {
      const result = await detachListingPhoto(locale, listing.id, version, mediaId);
      if (result.ok) {
        setLocalSnapshot({ version: result.version, media_ids: result.media_ids });
        if (replace === mediaId) setReplace(null);
        setMessage('detached');
        router.refresh();
      } else {
        setMessage(result.error);
      }
    } catch {
      setMessage('unavailable');
    } finally {
      setDetachingId(null);
    }
  }

  const busy = progress !== null || detachingId !== null;
  const uploading = progress !== null;
  const isSuccess = message === 'saved' || message === 'detached';
  const excessPhotos = Math.max(0, count - maxPhotos);

  return (
    <section aria-label={t('gallery')} className="photo-manager-workspace">
      {/* Photo Counter & Requirement Progress Banner */}
      <div className="seller-card photo-status-card">
        <div className="photo-status-top">
          <div>
            <p className="photo-counter-heading">
              {t('counter', { count, max: maxPhotos })}
            </p>
            <p className="field-hint">
              {exceedsMax
                ? t('legacyOverLimit', { count, max: maxPhotos, excess: excessPhotos })
                : remainingRequired > 0
                  ? t('needMore', { remaining: remainingRequired, min: minPhotos, max: maxPhotos })
                  : atMaximum
                    ? t('maxReached', { max: maxPhotos })
                    : t('readyToSubmit', { count, max: maxPhotos })}
            </p>
          </div>
          <span
            className={`seller-pill ${
              count >= minPhotos && count <= maxPhotos
                ? 'is-ready'
                : 'is-warn'
            }`}
          >
            {count >= minPhotos && count <= maxPhotos ? (
              <CheckCircle2 size={14} aria-hidden />
            ) : (
              <Camera size={14} aria-hidden />
            )}
            <span>
              {t('requirementSummary', { min: minPhotos, max: maxPhotos })}
            </span>
          </span>
        </div>

        <div className="photo-slot-meter" aria-hidden="true">
          {Array.from({ length: maxPhotos }, (_, slotIndex) => (
            <span
              key={slotIndex}
              className={`photo-slot-segment${slotIndex < count ? ' is-filled' : ''}${
                slotIndex < minPhotos ? ' is-required-slot' : ''
              }`}
            />
          ))}
        </div>
      </div>

      {/* Responsive Photo Grid (saved photos + empty visual slots up to 4) */}
      <div className="photo-grid">
        {mediaIds.map((id, index) => {
          const isBeingReplaced = replace === id;
          return (
            <figure
              key={id}
              className={`photo-slot-card${isBeingReplaced ? ' is-replacing' : ''}`}
            >
              <div className="photo-slot-stage">
                <img
                  src={`/api/media/${id}?variant=card`}
                  alt={t('photoAlt', { number: index + 1 })}
                  width={320}
                  height={240}
                />
                <div className="photo-slot-badges">
                  <span className="photo-slot-index" dir="ltr">
                    {index + 1} / {Math.max(maxPhotos, count)}
                  </span>
                  {index === 0 && <span className="photo-cover-badge">{t('coverLabel')}</span>}
                </div>
              </div>
              <figcaption className="photo-slot-footer">
                <span className="photo-slot-caption">{t('photoAlt', { number: index + 1 })}</span>
                <div className="photo-slot-actions">
                  <button
                    type="button"
                    className={`button ${isBeingReplaced ? 'primary' : 'secondary'} photo-slot-action`}
                    disabled={busy}
                    aria-pressed={isBeingReplaced}
                    onClick={() => {
                      setReplace(id);
                      setMessage('');
                      fileInput.current?.focus();
                    }}
                  >
                    <RefreshCw size={14} aria-hidden />
                    <span>{t('replace')}</span>
                  </button>
                  <button
                    type="button"
                    className="button secondary photo-slot-action photo-detach-btn"
                    disabled={busy}
                    aria-label={t('detachAria', { number: index + 1 })}
                    onClick={() => handleDetach(id)}
                  >
                    <Trash2 size={14} aria-hidden />
                    <span>{detachingId === id ? t('detaching') : t('detach')}</span>
                  </button>
                </div>
              </figcaption>
            </figure>
          );
        })}

        {Array.from({ length: emptySlotsCount }, (_, offset) => {
          const slotNumber = count + offset + 1;
          const isRequiredSlot = slotNumber <= minPhotos;
          return (
            <div key={`empty-${slotNumber}`} className="photo-empty-slot" aria-hidden="true">
              <span className="photo-empty-slot-icon">
                <ImagePlus size={22} />
              </span>
              <strong>{t('slotNumber', { number: slotNumber })}</strong>
              <span className={`field-badge ${isRequiredSlot ? 'is-required' : 'is-optional'}`}>
                {t(isRequiredSlot ? 'slotRequired' : 'slotOptional')}
              </span>
            </div>
          );
        })}
      </div>

      {count === 0 && (
        <p className="seller-feedback-banner is-info">
          <Camera size={16} aria-hidden />
          <span>{t('empty')}</span>
        </p>
      )}

      {/* Upload & Replace Controls Card */}
      <div className="seller-card account-form photo-upload-card">
        <div className="detail-panel-head">
          <span className="detail-panel-icon" aria-hidden>
            <Upload size={18} />
          </span>
          <div>
            <h2>{replace ? t('replaceHeading', { number: replacingIndex + 1 }) : t('uploadHeading')}</h2>
            <p className="detail-panel-subtitle">{t('limits')}</p>
          </div>
        </div>

        {replace && (
          <div className="photo-replace-banner">
            <div className="photo-replace-copy">
              <strong>{t('replaceHeading', { number: replacingIndex + 1 })}</strong>
              <p className="field-hint">{t('replacement')}</p>
            </div>
            <button
              type="button"
              className="button secondary seller-compact-btn"
              disabled={busy}
              onClick={() => setReplace(null)}
            >
              <X size={14} aria-hidden />
              <span>{t('cancel')}</span>
            </button>
          </div>
        )}

        {!replace && atMaximum && (
          <div className="seller-feedback-banner is-info">
            <ShieldCheck size={16} aria-hidden />
            <span>{t('photoLimit')}</span>
          </div>
        )}

        <div className="photo-picker-box">
          <label htmlFor="equipment-photo" className="photo-picker-label">
            {t('choose')}
          </label>
          <input
            ref={fileInput}
            id="equipment-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy || (!replace && atMaximum)}
            onChange={(event) => {
              const next = event.target.files?.[0] ?? null;
              setFile(next);
              setPreview(next ? URL.createObjectURL(next) : '');
              setMessage('');
            }}
          />
          <p className="field-hint photo-privacy-note">
            <ShieldCheck size={14} aria-hidden />
            <span>{t('privacyNote')}</span>
          </p>
        </div>

        {file && preview && (
          <figure className="photo-preview photo-local-preview">
            <div className="photo-slot-stage">
              <img src={preview} alt={t('unsaved')} width={320} height={240} />
            </div>
            <figcaption className="photo-preview-meta">
              <div>
                <strong>{t('unsaved')}</strong>
                <p className="field-hint" dir="ltr">
                  {file.name} · {formatFileSize(file.size)}
                </p>
              </div>
              <button
                type="button"
                className="button secondary seller-compact-btn"
                disabled={busy}
                onClick={clearSelectedFile}
              >
                <X size={14} aria-hidden />
                <span>{t('clearSelection')}</span>
              </button>
            </figcaption>
          </figure>
        )}

        {uploading && (
          <div className="photo-progress-box">
            <div className="photo-progress-head">
              <p role="status">{progress === 100 ? t('processing') : t('uploading')}</p>
              <span className="photo-progress-pct" dir="ltr">
                {progress}%
              </span>
            </div>
            <progress max={100} value={progress} aria-label={t('uploading')} />
          </div>
        )}

        {!uploading && message && (
          <div
            role="status"
            aria-live="polite"
            className={`seller-feedback-banner ${isSuccess ? 'is-success' : 'is-error'}`}
          >
            {isSuccess ? (
              <CheckCircle2 size={16} aria-hidden />
            ) : (
              <AlertTriangle size={16} aria-hidden />
            )}
            <span>{t(message)}</span>
          </div>
        )}

        {message === 'conflict' && (
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              setLocalSnapshot(null);
              setMessage('');
              router.refresh();
            }}
          >
            {t('reload')}
          </button>
        )}

        <div className="photo-upload-actions">
          <button
            type="button"
            className="button primary"
            disabled={!file || busy || message === 'conflict' || (!replace && atMaximum)}
            onClick={upload}
          >
            <Upload size={16} aria-hidden />
            <span>{t(replace ? 'replace' : 'upload')}</span>
          </button>

          <Link href={`/account/listings/${listing.id}`} className="button secondary">
            <span>{t('returnToEditor')}</span>
            <ArrowRight size={16} className="icon-directional" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
