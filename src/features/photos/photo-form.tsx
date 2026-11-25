'use client';
/* eslint-disable @next/next/no-img-element -- Protected photos must bypass the shared optimizer. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  ImagePlus,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { detachListingPhoto } from './actions';
import { CLIENT_IMAGE_LIMITS, ClientImagePrepError } from './client/constants';
import {
  createPreparationScheduler,
  type PreparationScheduler,
} from './client/prep-scheduler';
import {
  preparePhotoForUpload,
  terminateImagePrepWorker,
} from './client/prepare-image';
import {
  createUploadQueueController,
  getEffectiveCooldownUntilMs,
  getRetryBlockReason,
  type PhotoQueueItem,
  type QueueBanner,
} from './client/queue-controller';
import {
  formatFileSize,
  generateUploadKey,
  reconcileListingPhotoState,
  sendPreparedPhotoUpload,
} from './client/upload-transport';
import { PHOTO_LIMITS } from './types';

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

  const [queue, setQueue] = useState<PhotoQueueItem[]>([]);
  const [replace, setReplace] = useState<string | null>(null);
  const [detachingId, setDetachingId] = useState<string | null>(null);
  const [isUploadingQueue, setIsUploadingQueue] = useState(false);
  const [banner, setBanner] = useState<QueueBanner>(null);
  const [hasConflict, setHasConflict] = useState(false);
  const [rateLimitUntilMs, setRateLimitUntilMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [localSnapshot, setLocalSnapshot] = useState<{
    version: number;
    media_ids: string[];
  } | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
  const queueRef = useRef<PhotoQueueItem[]>([]);
  const mountedRef = useRef(true);
  const uploadRunningRef = useRef(false);
  const hasConflictRef = useRef(false);
  const rateLimitUntilRef = useRef<number | null>(null);
  const activeAbortRef = useRef<Map<string, AbortController>>(new Map());
  const previewUrlsRef = useRef<Set<string>>(new Set());
  const prepSchedulerRef = useRef<PreparationScheduler | null>(null);

  const effective =
    localSnapshot && localSnapshot.version >= listing.version
      ? localSnapshot
      : { version: listing.version, media_ids: listing.media_ids };
  const version = effective.version;
  const mediaIds = effective.media_ids;

  const latestSnapshotRef = useRef(effective);
  useEffect(() => {
    latestSnapshotRef.current = { version, media_ids: mediaIds };
  }, [version, mediaIds]);

  const updateQueue = useCallback((updater: (prev: PhotoQueueItem[]) => PhotoQueueItem[]) => {
    const next = updater(queueRef.current);
    queueRef.current = next;
    setQueue(next);
  }, []);

  const updateHasConflict = useCallback((value: boolean) => {
    hasConflictRef.current = value;
    setHasConflict(value);
  }, []);

  const updateRateLimitUntilMs = useCallback((value: number | null) => {
    rateLimitUntilRef.current = value;
    setRateLimitUntilMs(value);
    if (value !== null) {
      setNowMs(Date.now());
    }
  }, []);

  const revokeUrl = useCallback((url: string) => {
    if (!url) return;
    previewUrlsRef.current.delete(url);
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* Ignore already-revoked URLs. */
    }
  }, []);

  const trackPreviewUrl = useCallback((blob: Blob): string => {
    const url = URL.createObjectURL(blob);
    previewUrlsRef.current.add(url);
    return url;
  }, []);

  const getPreparationScheduler = useCallback((): PreparationScheduler => {
    if (!prepSchedulerRef.current) {
      prepSchedulerRef.current = createPreparationScheduler(
        (file, signal) => preparePhotoForUpload(file, { signal }),
        {
          onStart: (localId) => {
            if (!mountedRef.current) return;
            updateQueue((prev) =>
              prev.map((item) =>
                item.localId === localId
                  ? { ...item, status: 'preparing', errorCode: null }
                  : item,
              ),
            );
          },
          onSuccess: (localId, prepared) => {
            if (!mountedRef.current) return;
            const previewUrl = trackPreviewUrl(prepared.blob);
            let assigned = false;
            updateQueue((prev) =>
              prev.map((item) => {
                if (item.localId !== localId) return item;
                assigned = true;
                if (item.previewUrl) revokeUrl(item.previewUrl);
                return {
                  ...item,
                  file: null, // Drop original File reference once optimized Blob is ready.
                  status: 'ready',
                  prepared,
                  previewUrl,
                  errorCode: null,
                  canRetry: false,
                };
              }),
            );
            if (!assigned) {
              revokeUrl(previewUrl);
            }
          },
          onCancel: (localId) => {
            if (!mountedRef.current) return;
            updateQueue((prev) =>
              prev.map((item) => {
                if (item.localId !== localId) return item;
                if (item.previewUrl) revokeUrl(item.previewUrl);
                return {
                  ...item,
                  file: null,
                  previewUrl: '',
                  status: 'cancelled',
                  prepared: null,
                  errorCode: null,
                  canRetry: false,
                };
              }),
            );
          },
          onError: (localId, error) => {
            if (!mountedRef.current) return;
            const code =
              error instanceof ClientImagePrepError ? error.code : 'invalidFile';
            updateQueue((prev) =>
              prev.map((item) =>
                item.localId === localId
                  ? {
                      ...item,
                      file: null,
                      status: 'failed',
                      prepared: null,
                      errorCode: code,
                      canRetry: false,
                    }
                  : item,
              ),
            );
          },
        },
      );
    }
    return prepSchedulerRef.current;
  }, [revokeUrl, trackPreviewUrl, updateQueue]);

  // Release ObjectURLs, cancel pending preparation, abort in-flight uploads, and terminate worker on unmount.
  useEffect(() => {
    mountedRef.current = true;
    const controllers = activeAbortRef.current;
    const trackedUrls = previewUrlsRef.current;
    return () => {
      mountedRef.current = false;
      prepSchedulerRef.current?.cancelAll();
      prepSchedulerRef.current = null;
      for (const controller of controllers.values()) {
        controller.abort();
      }
      controllers.clear();
      for (const url of trackedUrls) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* Ignore cleanup failures. */
        }
      }
      trackedUrls.clear();
      terminateImagePrepWorker();
    };
  }, []);

  // Live countdown ticker only while a Retry-After cooldown is active.
  const maxActiveCooldownUntil = queue.reduce<number>(
    (acc, item) => Math.max(acc, item.retryAvailableAtMs ?? 0),
    rateLimitUntilMs ?? 0,
  );
  const isCooldownActive = maxActiveCooldownUntil > nowMs;

  useEffect(() => {
    if (!isCooldownActive) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNowMs(current);
      if (rateLimitUntilRef.current !== null && current >= rateLimitUntilRef.current) {
        rateLimitUntilRef.current = null;
        setRateLimitUntilMs(null);
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [isCooldownActive]);

  // Warn before accidental navigation only while an upload is actively in flight.
  useEffect(() => {
    if (!isUploadingQueue) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isUploadingQueue]);

  const count = mediaIds.length;
  const minPhotos = PHOTO_LIMITS.minPerListing;
  const maxPhotos = PHOTO_LIMITS.maxPerListing;
  const remainingRequired = Math.max(0, minPhotos - count);
  const atMaximum = count >= maxPhotos;
  const exceedsMax = count > maxPhotos;
  const emptySlotsCount = Math.max(0, maxPhotos - count);
  const replacingIndex = replace ? mediaIds.indexOf(replace) : -1;

  function buildQueueController() {
    const scheduler = getPreparationScheduler();
    return createUploadQueueController({
      listingId: listing.id,
      maxPhotos,
      isMounted: () => mountedRef.current,
      getSnapshot: () => latestSnapshotRef.current,
      setSnapshot: (next) => {
        if (next.version < latestSnapshotRef.current.version) return;
        latestSnapshotRef.current = next;
        setLocalSnapshot(next);
      },
      getQueue: () => queueRef.current,
      updateQueue,
      getHasConflict: () => hasConflictRef.current,
      setHasConflict: updateHasConflict,
      getRateLimitUntilMs: () => rateLimitUntilRef.current,
      setRateLimitUntilMs: updateRateLimitUntilMs,
      setBanner,
      onReplaceCleared: () => setReplace(null),
      revokeUrl,
      activeAbortMap: activeAbortRef.current,
      waitForPrepared: (localId) => scheduler.waitFor(localId),
      sendUpload: sendPreparedPhotoUpload,
      reconcile: reconcileListingPhotoState,
    });
  }

  function clearQueue() {
    prepSchedulerRef.current?.cancelAll();
    for (const item of queueRef.current) {
      activeAbortRef.current.get(item.localId)?.abort();
      if (item.previewUrl) revokeUrl(item.previewUrl);
    }
    updateQueue(() => []);
    setBanner(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  function removeOrCancelItem(localId: string) {
    prepSchedulerRef.current?.cancel(localId);
    const controller = activeAbortRef.current.get(localId);
    if (controller) {
      controller.abort();
    }
    updateQueue((prev) => {
      const target = prev.find((item) => item.localId === localId);
      if (!target) return prev;

      // Cancelled mid-upload / saving / retry-backoff: preserve prepared blob & preview for Retry,
      // and require reconciliation before retrying since the server may have committed.
      if (target.status === 'uploading' || target.status === 'saving') {
        return prev.map((item) =>
          item.localId === localId
            ? {
                ...item,
                status: 'cancelled',
                progress: 0,
                errorCode: null,
                canRetry: item.prepared !== null,
                needsReconcile: true,
              }
            : item,
        );
      }

      // Cancelled mid-preparation: drop original File immediately to free mobile memory.
      if (target.status === 'preparing') {
        if (target.previewUrl) revokeUrl(target.previewUrl);
        return prev.map((item) =>
          item.localId === localId
            ? {
                ...item,
                file: null,
                previewUrl: '',
                status: 'cancelled',
                prepared: null,
                progress: 0,
                errorCode: null,
                canRetry: false,
                needsReconcile: false,
              }
            : item,
        );
      }

      // Removing a queued/ready/failed/cancelled row frees its preview URL cleanly.
      if (target.previewUrl) revokeUrl(target.previewUrl);
      return prev.filter((item) => item.localId !== localId);
    });
    if (fileInput.current && queueRef.current.length <= 1) {
      fileInput.current.value = '';
    }
  }

  function handleFileSelection(files: FileList | null) {
    if (!files || files.length === 0) return;
    const picked = Array.from(files);
    const scheduler = getPreparationScheduler();

    if (replace) {
      // Replacement targets one slot without consuming an additional photo slot.
      scheduler.cancelAll();
      for (const existing of queueRef.current) {
        activeAbortRef.current.get(existing.localId)?.abort();
        if (existing.previewUrl) revokeUrl(existing.previewUrl);
      }
      const single = picked[0];
      const item: PhotoQueueItem = {
        localId: generateUploadKey(),
        uploadKey: generateUploadKey(),
        replaceTargetId: replace,
        file: single,
        fileName: single.name,
        originalBytes: single.size,
        status: 'selected',
        progress: 0,
        previewUrl: '',
        prepared: null,
        errorCode: null,
        retryAfterSeconds: null,
        retryAvailableAtMs: null,
        canRetry: false,
        needsReconcile: false,
        lastSentVersion: null,
      };
      updateQueue(() => [item]);
      if (!hasConflictRef.current) setBanner(null);
      if (fileInput.current) fileInput.current.value = '';
      void scheduler.enqueue(item.localId, single);
      return;
    }

    // Normal mode: prune completed/cancelled rows, then allow selection only within available slots.
    const existingActive = queueRef.current.filter(
      (item) =>
        item.status === 'selected' ||
        item.status === 'preparing' ||
        item.status === 'ready' ||
        item.status === 'uploading' ||
        item.status === 'saving',
    );
    const availableSlots = Math.max(0, maxPhotos - count - existingActive.length);
    if (availableSlots <= 0) {
      setBanner({ kind: 'info', key: 'photoLimit' });
      if (fileInput.current) fileInput.current.value = '';
      return;
    }

    const accepted = picked.slice(0, availableSlots);
    const newItems: PhotoQueueItem[] = accepted.map((file) => ({
      localId: generateUploadKey(),
      uploadKey: generateUploadKey(),
      replaceTargetId: null,
      file,
      fileName: file.name,
      originalBytes: file.size,
      status: 'selected',
      progress: 0,
      previewUrl: '',
      prepared: null,
      errorCode: null,
      retryAfterSeconds: null,
      retryAvailableAtMs: null,
      canRetry: false,
      needsReconcile: false,
      lastSentVersion: null,
    }));

    updateQueue((prev) => {
      const kept = prev.filter((item) => item.status !== 'saved' && item.status !== 'cancelled');
      for (const dropped of prev) {
        if ((dropped.status === 'saved' || dropped.status === 'cancelled') && dropped.previewUrl) {
          revokeUrl(dropped.previewUrl);
        }
      }
      return [...kept, ...newItems];
    });

    if (picked.length > accepted.length) {
      setBanner({
        kind: 'info',
        key: 'slotsCapped',
        values: { accepted: accepted.length, selected: picked.length, max: maxPhotos },
      });
    } else if (!hasConflictRef.current) {
      setBanner(null);
    }

    if (fileInput.current) fileInput.current.value = '';

    // Enqueue strictly through the single-flight preparation scheduler.
    for (const item of newItems) {
      if (item.file) {
        void scheduler.enqueue(item.localId, item.file);
      }
    }
  }

  async function runSequentialUpload(specificLocalId?: string) {
    if (uploadRunningRef.current || detachingId !== null) return;

    const controller = buildQueueController();
    uploadRunningRef.current = true;
    setIsUploadingQueue(true);

    try {
      const { savedInRun, encounteredError, cancelledInRun } =
        await controller.runSequentialUploadBatch({
          specificLocalId,
          fallbackReplaceId: replace,
        });

      if (mountedRef.current && savedInRun > 0) {
        if (!encounteredError && !cancelledInRun) {
          setBanner(
            savedInRun === 1
              ? { kind: 'success', key: 'saved' }
              : { kind: 'success', key: 'savedBatch', values: { count: savedInRun } },
          );
          // Clear saved rows from the working queue once the batch completes cleanly.
          updateQueue((prev) => prev.filter((item) => item.status !== 'saved'));
          if (fileInput.current) fileInput.current.value = '';
        }
        // Single server refresh after the sequential batch settles (no per-photo refresh).
        router.refresh();
      }
    } finally {
      uploadRunningRef.current = false;
      if (mountedRef.current) {
        setIsUploadingQueue(false);
      }
    }
  }

  async function handleReloadAfterConflict() {
    if (uploadRunningRef.current || detachingId !== null) return;
    const controller = buildQueueController();
    const rec = await controller.reloadAfterConflict();
    if (rec.ok) {
      router.refresh();
    }
  }

  async function handleDetach(mediaId: string) {
    if (isUploadingQueue || detachingId !== null) return;
    setDetachingId(mediaId);
    setBanner(null);
    updateHasConflict(false);
    try {
      const result = await detachListingPhoto(locale, listing.id, version, mediaId);
      if (result.ok) {
        const next = { version: result.version, media_ids: result.media_ids };
        latestSnapshotRef.current = next;
        setLocalSnapshot(next);
        if (replace === mediaId) setReplace(null);
        setBanner({ kind: 'success', key: 'detached' });
        router.refresh();
      } else {
        if (result.error === 'conflict') updateHasConflict(true);
        setBanner({ kind: 'error', key: result.error });
      }
    } catch {
      setBanner({ kind: 'error', key: 'unavailable' });
    } finally {
      setDetachingId(null);
    }
  }

  const busy = isUploadingQueue || detachingId !== null;
  const excessPhotos = Math.max(0, count - maxPhotos);
  const uploadableItems = queue.filter(
    (item) =>
      item.status === 'selected' ||
      item.status === 'preparing' ||
      item.status === 'ready' ||
      (item.status === 'failed' && item.canRetry) ||
      (item.status === 'cancelled' && item.canRetry),
  );
  const uploadableCount = uploadableItems.length;
  const hasUnsavedItems = queue.some((item) => item.status !== 'saved');
  const hasAnyQueueItems = queue.length > 0;
  const isPreparingAny = queue.some(
    (item) => item.status === 'selected' || item.status === 'preparing',
  );

  const globalRateLimited = rateLimitUntilMs !== null && rateLimitUntilMs > nowMs;
  const allUploadablesCoolingDown =
    uploadableItems.length > 0 &&
    uploadableItems.every((item) => {
      const until = getEffectiveCooldownUntilMs(rateLimitUntilMs, item);
      return until !== null && until > nowMs;
    });

  const primaryButtonLabel = replace
    ? t('replace')
    : uploadableCount > 1
      ? t('uploadBatch', { count: uploadableCount })
      : t('upload');

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
              count >= minPhotos && count <= maxPhotos ? 'is-ready' : 'is-warn'
            }`}
          >
            {count >= minPhotos && count <= maxPhotos ? (
              <CheckCircle2 size={14} aria-hidden />
            ) : (
              <Camera size={14} aria-hidden />
            )}
            <span>{t('requirementSummary', { min: minPhotos, max: maxPhotos })}</span>
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
                  decoding="async"
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
                      if (replace !== id && queueRef.current.length > 0) {
                        clearQueue();
                      }
                      setReplace(id);
                      if (!hasConflictRef.current) setBanner(null);
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

      {/* Upload & Multi-Photo Queue Card */}
      <div className="seller-card account-form photo-upload-card">
        <div className="detail-panel-head">
          <span className="detail-panel-icon" aria-hidden>
            <Upload size={18} />
          </span>
          <div>
            <h2>
              {replace
                ? t('replaceHeading', { number: replacingIndex + 1 })
                : t('uploadHeading')}
            </h2>
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
              onClick={() => {
                setReplace(null);
                clearQueue();
              }}
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
            {replace ? t('chooseSingle') : t('choose')}
          </label>
          <input
            ref={fileInput}
            id="equipment-photo"
            type="file"
            accept={CLIENT_IMAGE_LIMITS.acceptAttribute}
            multiple={!replace}
            disabled={busy || (!replace && atMaximum)}
            onChange={(event) => handleFileSelection(event.target.files)}
          />
          <p className="field-hint photo-privacy-note">
            <ShieldCheck size={14} aria-hidden />
            <span>{t('privacyNote')}</span>
          </p>
        </div>

        {hasAnyQueueItems && (
          <div className="photo-queue-panel" aria-label={t('queueHeading')}>
            <div className="photo-queue-header">
              <strong>{t('queueHeading')}</strong>
              <button
                type="button"
                className="button secondary seller-compact-btn"
                disabled={isUploadingQueue}
                onClick={clearQueue}
              >
                <X size={14} aria-hidden />
                <span>{t('clearSelection')}</span>
              </button>
            </div>

            <ul className="photo-queue-list">
              {queue.map((item) => {
                const isActive =
                  item.status === 'preparing' ||
                  item.status === 'uploading' ||
                  item.status === 'saving';
                const showOptimizedSize =
                  item.prepared &&
                  !item.prepared.passedThrough &&
                  item.prepared.preparedBytes < item.originalBytes;
                const retryBlock = getRetryBlockReason({
                  item,
                  hasConflict,
                  rateLimitUntilMs,
                  nowMs,
                });
                const liveRetryAfterSeconds =
                  retryBlock.blocked && retryBlock.reason === 'cooldown'
                    ? retryBlock.remainingSeconds
                    : item.retryAvailableAtMs && item.retryAvailableAtMs > nowMs
                      ? Math.max(1, Math.ceil((item.retryAvailableAtMs - nowMs) / 1000))
                      : null;

                return (
                  <li
                    key={item.localId}
                    className={`photo-queue-item photo-local-preview is-${item.status}`}
                  >
                    <div className="photo-queue-thumb">
                      {item.previewUrl ? (
                        <img
                          src={item.previewUrl}
                          alt={t('unsaved')}
                          width={120}
                          height={90}
                        />
                      ) : (
                        <span className="photo-queue-thumb-placeholder" aria-hidden="true">
                          {item.status === 'preparing' ? (
                            <Loader2 size={20} className="photo-spin" />
                          ) : item.status === 'saved' ? (
                            <CheckCircle2 size={20} />
                          ) : item.status === 'failed' ? (
                            <AlertTriangle size={20} />
                          ) : (
                            <Camera size={20} />
                          )}
                        </span>
                      )}
                    </div>

                    <div className="photo-queue-body">
                      <div className="photo-queue-top">
                        <span className="photo-queue-name" dir="ltr">
                          {item.fileName}
                        </span>
                        <span className={`photo-queue-badge is-${item.status}`}>
                          {item.status === 'uploading'
                            ? t('stateUploadingPct', { percent: item.progress })
                            : t(`state_${item.status}`)}
                        </span>
                      </div>

                      <p className="field-hint photo-queue-size">
                        <span dir="ltr">
                          {showOptimizedSize
                            ? `${formatFileSize(item.originalBytes)} → ${formatFileSize(item.prepared!.preparedBytes)}`
                            : formatFileSize(item.prepared?.preparedBytes ?? item.originalBytes)}
                        </span>
                        {item.prepared?.heicFallbackUsed && (
                          <>
                            {' · '}
                            <span>{t('heicConvertedTag')}</span>
                          </>
                        )}
                      </p>

                      {(item.status === 'uploading' || item.status === 'saving') && (
                        <progress
                          className="photo-queue-progress"
                          max={100}
                          value={item.status === 'saving' ? 100 : item.progress}
                          aria-label={t(item.status === 'saving' ? 'processing' : 'uploading')}
                        />
                      )}

                      {item.status === 'failed' && item.errorCode && (
                        <p className="field-error photo-queue-error">
                          {t(item.errorCode)}
                          {liveRetryAfterSeconds !== null
                            ? ` (${t('retryAfterHint', { seconds: liveRetryAfterSeconds })})`
                            : ''}
                        </p>
                      )}
                    </div>

                    <div className="photo-queue-actions">
                      {(item.status === 'failed' || item.status === 'cancelled') &&
                        item.canRetry && (
                          <button
                            type="button"
                            className="button secondary seller-compact-btn"
                            disabled={busy || retryBlock.blocked}
                            onClick={() => void runSequentialUpload(item.localId)}
                          >
                            <RotateCcw size={14} aria-hidden />
                            <span>{t('retry')}</span>
                          </button>
                        )}
                      {item.status !== 'saved' && (
                        <button
                          type="button"
                          className="button secondary seller-compact-btn"
                          aria-label={
                            isActive
                              ? t('cancelItemAria', { name: item.fileName })
                              : t('removeItemAria', { name: item.fileName })
                          }
                          onClick={() => removeOrCancelItem(item.localId)}
                        >
                          <X size={14} aria-hidden />
                          <span>{isActive ? t('cancelItem') : t('removeItem')}</span>
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            {hasUnsavedItems && (
              <p className="field-hint photo-reload-note">{t('reloadNote')}</p>
            )}
          </div>
        )}

        {isUploadingQueue && (
          <div className="photo-progress-box" role="status" aria-live="polite">
            <div className="photo-progress-head">
              <p>{t('queueUploading')}</p>
            </div>
          </div>
        )}

        {!isUploadingQueue && banner && (
          <div
            role="status"
            aria-live="polite"
            className={`seller-feedback-banner ${
              banner.kind === 'success'
                ? 'is-success'
                : banner.kind === 'info'
                  ? 'is-info'
                  : 'is-error'
            }`}
          >
            {banner.kind === 'success' ? (
              <CheckCircle2 size={16} aria-hidden />
            ) : banner.kind === 'info' ? (
              <ShieldCheck size={16} aria-hidden />
            ) : (
              <AlertTriangle size={16} aria-hidden />
            )}
            <span>{t(banner.key, banner.values)}</span>
          </div>
        )}

        {hasConflict && (
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => void handleReloadAfterConflict()}
          >
            {t('reload')}
          </button>
        )}

        <div className="photo-upload-actions">
          <button
            type="button"
            className="button primary"
            disabled={
              !hasAnyQueueItems ||
              busy ||
              hasConflict ||
              globalRateLimited ||
              allUploadablesCoolingDown ||
              (!replace && atMaximum)
            }
            onClick={() => void runSequentialUpload()}
          >
            {isPreparingAny && !isUploadingQueue ? (
              <Loader2 size={16} className="photo-spin" aria-hidden />
            ) : (
              <Upload size={16} aria-hidden />
            )}
            <span>{primaryButtonLabel}</span>
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
