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
import { isListingEditable, type ListingStatus } from '@/lib/domain/equipment';
import { detachListingPhoto } from './actions';
import {
  CLIENT_IMAGE_LIMITS,
  ClientImagePrepError,
  type PreparedPhotoResult,
} from './client/constants';
import {
  preparePhotoForUpload,
  terminateImagePrepWorker,
} from './client/prepare-image';
import {
  formatFileSize,
  generateUploadKey,
  reconcileListingPhotoState,
  sendPreparedPhotoUpload,
} from './client/upload-transport';
import { PHOTO_LIMITS } from './types';

type QueueItemStatus =
  | 'selected'
  | 'preparing'
  | 'ready'
  | 'uploading'
  | 'saving'
  | 'saved'
  | 'failed'
  | 'cancelled';

type PhotoQueueItem = {
  localId: string;
  uploadKey: string;
  file: File | null;
  fileName: string;
  originalBytes: number;
  status: QueueItemStatus;
  progress: number;
  previewUrl: string;
  prepared: PreparedPhotoResult | null;
  errorCode: string | null;
  retryAfterSeconds: number | null;
  canRetry: boolean;
};

type BannerState =
  | { kind: 'success' | 'error' | 'info'; key: string; values?: Record<string, number> }
  | null;

const MAX_AUTO_TRANSIENT_RETRIES = 1;
const TRANSIENT_RETRY_BACKOFF_MS = 1200;

function sleep(ms: number, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(false);
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve(true);
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
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

  const [queue, setQueue] = useState<PhotoQueueItem[]>([]);
  const [replace, setReplace] = useState<string | null>(null);
  const [detachingId, setDetachingId] = useState<string | null>(null);
  const [isUploadingQueue, setIsUploadingQueue] = useState(false);
  const [banner, setBanner] = useState<BannerState>(null);
  const [hasConflict, setHasConflict] = useState(false);
  const [localSnapshot, setLocalSnapshot] = useState<{
    version: number;
    media_ids: string[];
  } | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
  const queueRef = useRef<PhotoQueueItem[]>([]);
  const mountedRef = useRef(true);
  const prepRunningRef = useRef(false);
  const uploadRunningRef = useRef(false);
  const activeAbortRef = useRef<Map<string, AbortController>>(new Map());
  const previewUrlsRef = useRef<Set<string>>(new Set());

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

  // Release ObjectURLs, abort in-flight requests/prep, and terminate worker on unmount.
  useEffect(() => {
    mountedRef.current = true;
    const controllers = activeAbortRef.current;
    const trackedUrls = previewUrlsRef.current;
    return () => {
      mountedRef.current = false;
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

  // Sequentially prepare one photo at a time to keep mobile memory bounded.
  const prepareItem = useCallback(
    async (localId: string): Promise<PhotoQueueItem | null> => {
      const current = queueRef.current.find((item) => item.localId === localId);
      if (!current || current.status !== 'selected' || !current.file) {
        return current ?? null;
      }

      const controller = new AbortController();
      activeAbortRef.current.set(localId, controller);
      const sourceFile = current.file;

      updateQueue((prev) =>
        prev.map((item) =>
          item.localId === localId
            ? { ...item, status: 'preparing', errorCode: null }
            : item,
        ),
      );

      try {
        const prepared = await preparePhotoForUpload(sourceFile, {
          signal: controller.signal,
        });
        if (!mountedRef.current || controller.signal.aborted) {
          return null;
        }
        const previewUrl = trackPreviewUrl(prepared.blob);
        let updatedItem: PhotoQueueItem | null = null;
        updateQueue((prev) =>
          prev.map((item) => {
            if (item.localId !== localId) return item;
            if (item.previewUrl) revokeUrl(item.previewUrl);
            updatedItem = {
              ...item,
              file: null, // Drop original File reference once optimized Blob is ready.
              status: 'ready',
              prepared,
              previewUrl,
              errorCode: null,
              canRetry: false,
            };
            return updatedItem;
          }),
        );
        return updatedItem;
      } catch (error) {
        if (!mountedRef.current) return null;
        if (error instanceof ClientImagePrepError && error.code === 'cancelled') {
          updateQueue((prev) =>
            prev.map((item) =>
              item.localId === localId
                ? { ...item, file: null, status: 'cancelled', errorCode: null, canRetry: false }
                : item,
            ),
          );
          return null;
        }

        const code =
          error instanceof ClientImagePrepError ? error.code : 'invalidFile';
        let failedItem: PhotoQueueItem | null = null;
        updateQueue((prev) =>
          prev.map((item) => {
            if (item.localId !== localId) return item;
            failedItem = {
              ...item,
              file: null,
              status: 'failed',
              prepared: null,
              errorCode: code,
              canRetry: false,
            };
            return failedItem;
          }),
        );
        return failedItem;
      } finally {
        activeAbortRef.current.delete(localId);
      }
    },
    [revokeUrl, trackPreviewUrl, updateQueue],
  );

  const drainPreparationQueue = useCallback(async () => {
    if (prepRunningRef.current) return;
    prepRunningRef.current = true;
    try {
      while (mountedRef.current) {
        const nextSelected = queueRef.current.find((item) => item.status === 'selected');
        if (!nextSelected) break;
        await prepareItem(nextSelected.localId);
      }
    } finally {
      prepRunningRef.current = false;
    }
  }, [prepareItem]);

  function clearQueue() {
    for (const item of queueRef.current) {
      activeAbortRef.current.get(item.localId)?.abort();
      if (item.previewUrl) revokeUrl(item.previewUrl);
    }
    updateQueue(() => []);
    setBanner(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  function removeOrCancelItem(localId: string) {
    const controller = activeAbortRef.current.get(localId);
    if (controller) {
      controller.abort();
    }
    updateQueue((prev) => {
      const target = prev.find((item) => item.localId === localId);
      if (target?.previewUrl) revokeUrl(target.previewUrl);
      // Keep an explicit cancelled badge if cancelled mid-upload/prep; otherwise remove from list.
      if (
        target &&
        (target.status === 'uploading' ||
          target.status === 'saving' ||
          target.status === 'preparing')
      ) {
        return prev.map((item) =>
          item.localId === localId
            ? {
                ...item,
                file: null,
                previewUrl: '',
                status: 'cancelled',
                progress: 0,
                canRetry: item.prepared !== null,
              }
            : item,
        );
      }
      return prev.filter((item) => item.localId !== localId);
    });
    if (fileInput.current && queueRef.current.length <= 1) {
      fileInput.current.value = '';
    }
  }

  function handleFileSelection(files: FileList | null) {
    if (!files || files.length === 0) return;
    const picked = Array.from(files);
    setHasConflict(false);

    if (replace) {
      // Replacement targets one slot without consuming an additional photo slot.
      for (const existing of queueRef.current) {
        activeAbortRef.current.get(existing.localId)?.abort();
        if (existing.previewUrl) revokeUrl(existing.previewUrl);
      }
      const single = picked[0];
      const item: PhotoQueueItem = {
        localId: generateUploadKey(),
        uploadKey: generateUploadKey(),
        file: single,
        fileName: single.name,
        originalBytes: single.size,
        status: 'selected',
        progress: 0,
        previewUrl: '',
        prepared: null,
        errorCode: null,
        retryAfterSeconds: null,
        canRetry: false,
      };
      updateQueue(() => [item]);
      setBanner(null);
      void drainPreparationQueue();
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
      file,
      fileName: file.name,
      originalBytes: file.size,
      status: 'selected',
      progress: 0,
      previewUrl: '',
      prepared: null,
      errorCode: null,
      retryAfterSeconds: null,
      canRetry: false,
    }));

    updateQueue((prev) => {
      const kept = prev.filter((item) => item.status !== 'saved' && item.status !== 'cancelled');
      return [...kept, ...newItems];
    });

    if (picked.length > accepted.length) {
      setBanner({
        kind: 'info',
        key: 'slotsCapped',
        values: { accepted: accepted.length, selected: picked.length, max: maxPhotos },
      });
    } else {
      setBanner(null);
    }

    if (fileInput.current) fileInput.current.value = '';
    void drainPreparationQueue();
  }

  async function applyAuthoritativeReconcile(listingId: string, uploadKey?: string) {
    const rec = await reconcileListingPhotoState(listingId, uploadKey);
    if (!rec.ok) return rec;
    const synced = { version: rec.data.version, media_ids: rec.data.media_ids };
    latestSnapshotRef.current = synced;
    setLocalSnapshot(synced);
    return rec;
  }

  async function uploadSingleQueueItem(
    localId: string,
    targetReplaceId: string | null,
  ): Promise<'saved' | 'pause_conflict' | 'pause_rate_limit' | 'pause_auth' | 'pause_network' | 'item_failed' | 'cancelled'> {
    // Ensure preparation finished if this item was still waiting/preparing.
    let item = queueRef.current.find((entry) => entry.localId === localId);
    if (!item) return 'cancelled';

    if (item.status === 'selected') {
      await prepareItem(localId);
      item = queueRef.current.find((entry) => entry.localId === localId);
    } else if (item.status === 'preparing') {
      // Wait cleanly while in-flight preparation finishes.
      while (mountedRef.current) {
        const cur = queueRef.current.find((entry) => entry.localId === localId);
        if (!cur || cur.status !== 'preparing') {
          item = cur;
          break;
        }
        await sleep(50);
      }
    }

    if (!item || !mountedRef.current) return 'cancelled';
    if (item.status === 'cancelled') return 'cancelled';
    if (!item.prepared) {
      if (item.errorCode) {
        setBanner({ kind: 'error', key: item.errorCode });
      }
      return 'item_failed';
    }

    const prepared = item.prepared;
    const uploadKey = item.uploadKey;

    const markItemSaved = (
      savedId: string,
      savedVersion: number,
      authoritativeMediaIds?: string[],
    ) => {
      const prevSnapshot = latestSnapshotRef.current;
      const nextMediaIds =
        authoritativeMediaIds ??
        (targetReplaceId
          ? prevSnapshot.media_ids.map((id) => (id === targetReplaceId ? savedId : id))
          : prevSnapshot.media_ids.includes(savedId)
            ? prevSnapshot.media_ids
            : [...prevSnapshot.media_ids, savedId]);
      const nextSnapshot = { version: savedVersion, media_ids: nextMediaIds };
      latestSnapshotRef.current = nextSnapshot;
      setLocalSnapshot(nextSnapshot);

      updateQueue((prev) =>
        prev.map((entry) => {
          if (entry.localId !== localId) return entry;
          if (entry.previewUrl) revokeUrl(entry.previewUrl);
          return {
            ...entry,
            status: 'saved',
            progress: 100,
            previewUrl: '',
            prepared: null,
            errorCode: null,
            retryAfterSeconds: null,
            canRetry: false,
          };
        }),
      );
      if (targetReplaceId) {
        setReplace(null);
      }
    };

    for (let attempt = 0; attempt <= MAX_AUTO_TRANSIENT_RETRIES; attempt++) {
      if (!mountedRef.current) return 'cancelled';

      const sentVersion = latestSnapshotRef.current.version;
      const controller = new AbortController();
      activeAbortRef.current.set(localId, controller);

      updateQueue((prev) =>
        prev.map((entry) =>
          entry.localId === localId
            ? {
                ...entry,
                status: 'uploading',
                progress: 0,
                errorCode: null,
                retryAfterSeconds: null,
              }
            : entry,
        ),
      );

      const result = await sendPreparedPhotoUpload({
        listingId: listing.id,
        expectedVersion: sentVersion,
        uploadKey,
        replacePhotoId: targetReplaceId,
        prepared,
        signal: controller.signal,
        onProgress: (pct, phase) => {
          if (!mountedRef.current) return;
          updateQueue((prev) =>
            prev.map((entry) =>
              entry.localId === localId &&
              (entry.status === 'uploading' || entry.status === 'saving')
                ? { ...entry, status: phase, progress: pct }
                : entry,
            ),
          );
        },
      });

      activeAbortRef.current.delete(localId);
      if (!mountedRef.current) return 'cancelled';

      if (result.ok) {
        markItemSaved(result.id, result.version, result.media_ids);
        return 'saved';
      }

      if (result.kind === 'cancelled') {
        updateQueue((prev) =>
          prev.map((entry) =>
            entry.localId === localId
              ? { ...entry, status: 'cancelled', progress: 0, canRetry: true }
              : entry,
          ),
        );
        return 'cancelled';
      }

      if (result.kind === 'auth') {
        updateQueue((prev) =>
          prev.map((entry) =>
            entry.localId === localId
              ? { ...entry, status: 'failed', progress: 0, errorCode: 'signin', canRetry: true }
              : entry,
          ),
        );
        setBanner({ kind: 'error', key: 'signin' });
        return 'pause_auth';
      }

      if (result.kind === 'rate_limited') {
        updateQueue((prev) =>
          prev.map((entry) =>
            entry.localId === localId
              ? {
                  ...entry,
                  status: 'failed',
                  progress: 0,
                  errorCode: 'rateLimited',
                  retryAfterSeconds: result.retryAfterSeconds ?? null,
                  canRetry: true,
                }
              : entry,
          ),
        );
        setBanner({ kind: 'error', key: 'rateLimited' });
        return 'pause_rate_limit';
      }

      if (result.kind === 'payload_too_large') {
        updateQueue((prev) =>
          prev.map((entry) =>
            entry.localId === localId
              ? {
                  ...entry,
                  status: 'failed',
                  progress: 0,
                  errorCode: 'payloadTooLarge',
                  canRetry: false,
                }
              : entry,
          ),
        );
        setBanner({ kind: 'error', key: 'payloadTooLarge' });
        return 'item_failed';
      }

      if (result.kind === 'photo_limit') {
        await applyAuthoritativeReconcile(listing.id);
        updateQueue((prev) =>
          prev.map((entry) =>
            entry.localId === localId
              ? {
                  ...entry,
                  status: 'failed',
                  progress: 0,
                  errorCode: 'photoLimit',
                  canRetry: false,
                }
              : entry,
          ),
        );
        setBanner({ kind: 'error', key: 'photoLimit' });
        return 'pause_conflict';
      }

      if (result.kind === 'validation') {
        updateQueue((prev) =>
          prev.map((entry) =>
            entry.localId === localId
              ? {
                  ...entry,
                  status: 'failed',
                  progress: 0,
                  errorCode: result.code,
                  canRetry: false,
                }
              : entry,
          ),
        );
        setBanner({ kind: 'error', key: result.code });
        return 'item_failed';
      }

      if (result.kind === 'conflict') {
        // Pause queue and reconcile authoritative server listing state + upload receipt.
        const reconciled = await applyAuthoritativeReconcile(listing.id, uploadKey);
        if (reconciled.ok && reconciled.data.matchedUpload) {
          markItemSaved(
            reconciled.data.matchedUpload.id,
            reconciled.data.version,
            reconciled.data.media_ids,
          );
          return 'saved';
        }
        const stillEditable =
          reconciled.ok &&
          isListingEditable(reconciled.data.status as ListingStatus) &&
          (targetReplaceId
            ? reconciled.data.media_ids.includes(targetReplaceId)
            : reconciled.data.media_ids.length < maxPhotos);
        setHasConflict(true);
        updateQueue((prev) =>
          prev.map((entry) =>
            entry.localId === localId
              ? {
                  ...entry,
                  status: 'failed',
                  progress: 0,
                  errorCode: 'conflict',
                  canRetry: stillEditable,
                }
              : entry,
          ),
        );
        setBanner({ kind: 'error', key: 'conflict' });
        return 'pause_conflict';
      }

      // Ambiguous network/timeout/5xx failure: ALWAYS reconcile before retrying!
      const reconciled = await applyAuthoritativeReconcile(listing.id, uploadKey);
      if (!mountedRef.current) return 'cancelled';

      if (reconciled.ok && reconciled.data.matchedUpload) {
        // Server actually committed the upload before the response dropped!
        markItemSaved(
          reconciled.data.matchedUpload.id,
          reconciled.data.version,
          reconciled.data.media_ids,
        );
        return 'saved';
      }

      if (reconciled.ok && reconciled.data.version !== sentVersion) {
        // Listing changed elsewhere while our request failed. Pause and explain conflict.
        setHasConflict(true);
        updateQueue((prev) =>
          prev.map((entry) =>
            entry.localId === localId
              ? {
                  ...entry,
                  status: 'failed',
                  progress: 0,
                  errorCode: 'conflict',
                  canRetry:
                    isListingEditable(reconciled.data.status as ListingStatus) &&
                    (targetReplaceId
                      ? reconciled.data.media_ids.includes(targetReplaceId)
                      : reconciled.data.media_ids.length < maxPhotos),
                }
              : entry,
          ),
        );
        setBanner({ kind: 'error', key: 'conflict' });
        return 'pause_conflict';
      }

      // Reconciliation confirmed our upload did NOT commit and version is unchanged.
      // Perform at most one bounded automatic retry after backoff, keeping the same uploadKey.
      if (reconciled.ok && attempt < MAX_AUTO_TRANSIENT_RETRIES) {
        const waitMs =
          result.retryAfterSeconds && result.retryAfterSeconds <= 10
            ? result.retryAfterSeconds * 1000
            : TRANSIENT_RETRY_BACKOFF_MS;
        const okToContinue = await sleep(waitMs);
        if (okToContinue && mountedRef.current) {
          continue;
        }
      }

      updateQueue((prev) =>
        prev.map((entry) =>
          entry.localId === localId
            ? {
                ...entry,
                status: 'failed',
                progress: 0,
                errorCode: 'unavailable',
                canRetry: true,
              }
            : entry,
        ),
      );
      setBanner({ kind: 'error', key: 'unavailable' });
      return 'pause_network';
    }

    return 'pause_network';
  }

  async function runSequentialUpload(specificLocalId?: string) {
    if (uploadRunningRef.current || detachingId !== null) return;
    uploadRunningRef.current = true;
    setIsUploadingQueue(true);
    setHasConflict(false);
    setBanner(null);

    let savedInRun = 0;
    let encounteredError = false;
    const targetReplaceId = replace;

    try {
      const targetIds = specificLocalId
        ? [specificLocalId]
        : queueRef.current
            .filter(
              (item) =>
                item.status === 'selected' ||
                item.status === 'preparing' ||
                item.status === 'ready' ||
                (item.status === 'failed' && item.canRetry) ||
                (item.status === 'cancelled' && item.canRetry),
            )
            .map((item) => item.localId);

      // If seller clicked Upload/Replace when the only queued item failed preparation
      // (for example a corrupted file), surface that exact error clearly in status.
      if (targetIds.length === 0) {
        const firstPrepError = queueRef.current.find(
          (item) => item.status === 'failed' && item.errorCode,
        );
        if (firstPrepError?.errorCode) {
          setBanner({ kind: 'error', key: firstPrepError.errorCode });
        }
        return;
      }

      for (const localId of targetIds) {
        if (!mountedRef.current) break;

        // If replacing, stop after replacing the single target slot.
        if (!targetReplaceId && latestSnapshotRef.current.media_ids.length >= maxPhotos) {
          setBanner({ kind: 'info', key: 'photoLimit' });
          break;
        }

        const outcome = await uploadSingleQueueItem(localId, targetReplaceId);
        if (outcome === 'saved') {
          savedInRun++;
          if (targetReplaceId) break;
        } else if (
          outcome === 'pause_conflict' ||
          outcome === 'pause_rate_limit' ||
          outcome === 'pause_auth' ||
          outcome === 'pause_network'
        ) {
          encounteredError = true;
          break;
        } else if (outcome === 'item_failed') {
          encounteredError = true;
        }
      }

      if (mountedRef.current && savedInRun > 0) {
        if (!encounteredError) {
          setBanner(
            savedInRun === 1
              ? { kind: 'success', key: 'saved' }
              : { kind: 'success', key: 'savedBatch', values: { count: savedInRun } },
          );
          // Clear saved rows from the working queue once the batch completes cleanly.
          updateQueue((prev) => prev.filter((item) => item.status !== 'saved'));
          if (fileInput.current) fileInput.current.value = '';
        }
        // Single server refresh after the sequential batch completes (no per-photo refresh).
        router.refresh();
      }
    } finally {
      uploadRunningRef.current = false;
      if (mountedRef.current) {
        setIsUploadingQueue(false);
      }
    }
  }

  async function handleDetach(mediaId: string) {
    if (isUploadingQueue || detachingId !== null) return;
    setDetachingId(mediaId);
    setBanner(null);
    setHasConflict(false);
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
        if (result.error === 'conflict') setHasConflict(true);
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
  const uploadableCount = queue.filter(
    (item) =>
      item.status === 'selected' ||
      item.status === 'preparing' ||
      item.status === 'ready' ||
      (item.status === 'failed' && item.canRetry) ||
      (item.status === 'cancelled' && item.canRetry),
  ).length;
  const hasUnsavedItems = queue.some((item) => item.status !== 'saved');
  const hasAnyQueueItems = queue.length > 0;
  const isPreparingAny = queue.some(
    (item) => item.status === 'selected' || item.status === 'preparing',
  );

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
                      setReplace(id);
                      setBanner(null);
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
                          {item.retryAfterSeconds
                            ? ` (${t('retryAfterHint', { seconds: item.retryAfterSeconds })})`
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
                            disabled={busy}
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
            onClick={async () => {
              setHasConflict(false);
              setBanner(null);
              await applyAuthoritativeReconcile(listing.id);
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
            disabled={
              !hasAnyQueueItems ||
              busy ||
              hasConflict ||
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
