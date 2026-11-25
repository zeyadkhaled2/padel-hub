import { isListingEditable, type ListingStatus } from '@/lib/domain/equipment';
import type { PhotoErrorCode, PhotoReconcileResponse } from '../types';
import type { PreparedPhotoResult } from './constants';
import type { UploadTransportResult } from './upload-transport';

export type QueueItemStatus =
  | 'selected'
  | 'preparing'
  | 'ready'
  | 'uploading'
  | 'saving'
  | 'saved'
  | 'failed'
  | 'cancelled';

export type PhotoQueueItem = {
  localId: string;
  uploadKey: string;
  replaceTargetId: string | null;
  file: File | null;
  fileName: string;
  originalBytes: number;
  status: QueueItemStatus;
  progress: number;
  previewUrl: string;
  prepared: PreparedPhotoResult | null;
  errorCode: string | null;
  retryAfterSeconds: number | null;
  retryAvailableAtMs: number | null;
  canRetry: boolean;
  /** True whenever an upload attempt was dispatched and may have committed on the server. */
  needsReconcile: boolean;
  /** Expected version sent on the most recent upload attempt. */
  lastSentVersion: number | null;
};

export type ListingPhotoSnapshot = {
  version: number;
  media_ids: string[];
};

export type QueueBanner =
  | { kind: 'success' | 'error' | 'info'; key: string; values?: Record<string, number> }
  | null;

export type SingleItemOutcome =
  | 'saved'
  | 'skipped'
  | 'pause_conflict'
  | 'pause_rate_limit'
  | 'pause_auth'
  | 'pause_network'
  | 'item_failed'
  | 'cancelled';

export type RetryBlockReason =
  | { blocked: false }
  | { blocked: true; reason: 'conflict' }
  | { blocked: true; reason: 'cooldown'; remainingSeconds: number }
  | { blocked: true; reason: 'not_retryable' };

export const DEFAULT_MAX_AUTO_TRANSIENT_RETRIES = 1;
export const DEFAULT_TRANSIENT_RETRY_BACKOFF_MS = 1200;
export const DEFAULT_RATE_LIMIT_FALLBACK_SECONDS = 60;

export function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<boolean> {
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

export function getEffectiveCooldownUntilMs(
  rateLimitUntilMs: number | null,
  item: Pick<PhotoQueueItem, 'retryAvailableAtMs'> | null,
): number | null {
  const queueUntil = rateLimitUntilMs ?? 0;
  const itemUntil = item?.retryAvailableAtMs ?? 0;
  const maxUntil = Math.max(queueUntil, itemUntil);
  return maxUntil > 0 ? maxUntil : null;
}

export function getRetryBlockReason(params: {
  item: PhotoQueueItem | null;
  hasConflict: boolean;
  rateLimitUntilMs: number | null;
  nowMs: number;
}): RetryBlockReason {
  const { item, hasConflict, rateLimitUntilMs, nowMs } = params;

  if (hasConflict) {
    return { blocked: true, reason: 'conflict' };
  }

  const cooldownUntil = getEffectiveCooldownUntilMs(rateLimitUntilMs, item);
  if (cooldownUntil !== null && cooldownUntil > nowMs) {
    return {
      blocked: true,
      reason: 'cooldown',
      remainingSeconds: Math.max(1, Math.ceil((cooldownUntil - nowMs) / 1000)),
    };
  }

  if (
    item &&
    (item.status === 'failed' || item.status === 'cancelled') &&
    (!item.canRetry || !item.prepared)
  ) {
    return { blocked: true, reason: 'not_retryable' };
  }

  return { blocked: false };
}

export type ReconcileResultLike =
  | { ok: true; data: PhotoReconcileResponse }
  | { ok: false; code: PhotoErrorCode; aborted?: boolean };

export type UploadQueueControllerDeps = {
  listingId: string;
  maxPhotos: number;
  maxAutoTransientRetries?: number;
  transientRetryBackoffMs?: number;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<boolean>;
  isMounted: () => boolean;
  getSnapshot: () => ListingPhotoSnapshot;
  setSnapshot: (next: ListingPhotoSnapshot) => void;
  getQueue: () => PhotoQueueItem[];
  updateQueue: (updater: (prev: PhotoQueueItem[]) => PhotoQueueItem[]) => void;
  getHasConflict: () => boolean;
  setHasConflict: (value: boolean) => void;
  getRateLimitUntilMs: () => number | null;
  setRateLimitUntilMs: (value: number | null) => void;
  setBanner: (banner: QueueBanner) => void;
  onReplaceCleared: () => void;
  revokeUrl: (url: string) => void;
  activeAbortMap: Map<string, AbortController>;
  waitForPrepared: (localId: string) => Promise<PreparedPhotoResult | null>;
  sendUpload: (params: {
    listingId: string;
    expectedVersion: number;
    uploadKey: string;
    replacePhotoId: string | null;
    prepared: PreparedPhotoResult;
    signal?: AbortSignal;
    onProgress?: (percent: number, phase: 'uploading' | 'saving') => void;
  }) => Promise<UploadTransportResult>;
  reconcile: (
    listingId: string,
    uploadKey?: string,
    signal?: AbortSignal,
  ) => Promise<ReconcileResultLike>;
};

export function createUploadQueueController(deps: UploadQueueControllerDeps) {
  const maxAutoRetries = deps.maxAutoTransientRetries ?? DEFAULT_MAX_AUTO_TRANSIENT_RETRIES;
  const backoffMs = deps.transientRetryBackoffMs ?? DEFAULT_TRANSIENT_RETRY_BACKOFF_MS;
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? sleepWithSignal;

  const getItem = (localId: string): PhotoQueueItem | undefined =>
    deps.getQueue().find((entry) => entry.localId === localId);

  function isConsistentReconcileData(data: PhotoReconcileResponse): boolean {
    return data.matchedUpload === null || data.version >= data.matchedUpload.version;
  }

  function applyAuthoritativeSnapshot(next: ListingPhotoSnapshot): ListingPhotoSnapshot {
    const current = deps.getSnapshot();
    if (next.version < current.version) {
      // Never regress the client's confirmed listing version or discard newer attached photos.
      return current;
    }
    deps.setSnapshot(next);
    return next;
  }

  function markItemSaved(params: {
    localId: string;
    targetReplaceId: string | null;
    savedId: string;
    savedVersion: number;
    authoritativeMediaIds?: string[];
  }) {
    const { localId, targetReplaceId, savedId, savedVersion, authoritativeMediaIds } = params;
    const prevSnapshot = deps.getSnapshot();

    // Only advance the confirmed snapshot when savedVersion is at least as new as our
    // current confirmed version so delayed idempotent replays can never regress version or media_ids.
    if (savedVersion >= prevSnapshot.version) {
      const nextMediaIds =
        authoritativeMediaIds ??
        (targetReplaceId
          ? prevSnapshot.media_ids.map((id) => (id === targetReplaceId ? savedId : id))
          : prevSnapshot.media_ids.includes(savedId)
            ? prevSnapshot.media_ids
            : [...prevSnapshot.media_ids, savedId]);

      applyAuthoritativeSnapshot({ version: savedVersion, media_ids: nextMediaIds });
    }

    deps.updateQueue((prev) =>
      prev.map((entry) => {
        if (entry.localId !== localId) return entry;
        if (entry.previewUrl) deps.revokeUrl(entry.previewUrl);
        return {
          ...entry,
          status: 'saved',
          progress: 100,
          previewUrl: '',
          prepared: null,
          errorCode: null,
          retryAfterSeconds: null,
          retryAvailableAtMs: null,
          canRetry: false,
          needsReconcile: false,
        };
      }),
    );

    if (targetReplaceId) {
      deps.onReplaceCleared();
    }
  }

  function markItemCancelledPreservingPrepared(localId: string, needsReconcile: boolean) {
    deps.updateQueue((prev) =>
      prev.map((entry) => {
        if (entry.localId !== localId) return entry;
        return {
          ...entry,
          status: 'cancelled',
          progress: 0,
          errorCode: null,
          canRetry: entry.prepared !== null,
          needsReconcile: entry.needsReconcile || needsReconcile,
        };
      }),
    );
  }

  function evaluateEditableAndSlot(
    data: PhotoReconcileResponse,
    targetReplaceId: string | null,
  ): { editable: boolean; replaceTargetMissing: boolean; slotsFull: boolean; canRetry: boolean } {
    const editable = isListingEditable(data.status as ListingStatus);
    const replaceTargetMissing =
      targetReplaceId !== null && !data.media_ids.includes(targetReplaceId);
    const slotsFull = targetReplaceId === null && data.media_ids.length >= deps.maxPhotos;
    return {
      editable,
      replaceTargetMissing,
      slotsFull,
      canRetry: editable && !replaceTargetMissing && !slotsFull,
    };
  }

  /**
   * Explicitly reloads and reconciles listing state after a conflict.
   * Only clears `hasConflict` when authoritative reconciliation succeeds.
   */
  async function reloadAfterConflict(): Promise<ReconcileResultLike> {
    const rec = await deps.reconcile(deps.listingId);
    if (!deps.isMounted()) return rec;
    if (!rec.ok) {
      deps.setBanner({ kind: 'error', key: rec.code });
      return rec;
    }

    applyAuthoritativeSnapshot({ version: rec.data.version, media_ids: rec.data.media_ids });

    deps.updateQueue((prev) =>
      prev.map((entry) => {
        if (entry.status === 'saved') return entry;
        const evalResult = evaluateEditableAndSlot(rec.data, entry.replaceTargetId);
        if (entry.errorCode === 'conflict') {
          if (evalResult.canRetry && entry.prepared) {
            return {
              ...entry,
              status: 'ready',
              errorCode: null,
              canRetry: false,
            };
          }
          return {
            ...entry,
            errorCode: evalResult.slotsFull ? 'photoLimit' : 'conflict',
            canRetry: false,
          };
        }
        if (!evalResult.canRetry && (entry.status === 'failed' || entry.status === 'cancelled')) {
          return {
            ...entry,
            canRetry: false,
          };
        }
        return entry;
      }),
    );

    deps.setHasConflict(false);
    deps.setBanner(null);
    return rec;
  }

  async function uploadSingleQueueItem(
    localId: string,
    fallbackReplaceId: string | null,
  ): Promise<SingleItemOutcome> {
    let item = getItem(localId);
    if (!item || !deps.isMounted()) return 'skipped';
    if (item.status === 'saved') return 'skipped';

    // Enforce conflict & Retry-After cooldown gates on EVERY entry point (including single-item Retry).
    const block = getRetryBlockReason({
      item,
      hasConflict: deps.getHasConflict(),
      rateLimitUntilMs: deps.getRateLimitUntilMs(),
      nowMs: now(),
    });
    if (block.blocked) {
      if (block.reason === 'conflict') {
        deps.setBanner({ kind: 'error', key: 'conflict' });
        return 'pause_conflict';
      }
      if (block.reason === 'cooldown') {
        deps.setBanner({ kind: 'error', key: 'rateLimited' });
        return 'pause_rate_limit';
      }
      if (item.status === 'cancelled') return 'cancelled';
      if (item.errorCode) {
        deps.setBanner({ kind: 'error', key: item.errorCode });
      }
      return 'item_failed';
    }

    // If preparation is still pending or running, wait cleanly on the single preparation scheduler.
    if (item.status === 'selected' || item.status === 'preparing') {
      await deps.waitForPrepared(localId);
      if (!deps.isMounted()) return 'cancelled';
      item = getItem(localId);
      if (!item) return 'skipped';
      if (item.status === 'cancelled') return 'cancelled';
      if (!item.prepared) {
        if (item.errorCode) {
          deps.setBanner({ kind: 'error', key: item.errorCode });
        }
        return 'item_failed';
      }
    }

    if (!item.prepared) {
      if (item.errorCode) {
        deps.setBanner({ kind: 'error', key: item.errorCode });
      }
      return 'item_failed';
    }

    const prepared = item.prepared;
    const uploadKey = item.uploadKey;
    const targetReplaceId = item.replaceTargetId ?? fallbackReplaceId;

    // One AbortController owns this entire upload/reconcile/backoff lifecycle so cancelling
    // during XHR, reconciliation, or retry backoff immediately stops all further work.
    const itemController = new AbortController();
    deps.activeAbortMap.set(localId, itemController);

    const wasAbortedThisRun = () =>
      !deps.isMounted() || itemController.signal.aborted || !getItem(localId);

    try {
      // Transition out of 'ready' / 'failed' / 'cancelled' into active 'uploading' state immediately.
      deps.updateQueue((prev) =>
        prev.map((entry) =>
          entry.localId === localId
            ? {
                ...entry,
                status: 'uploading',
                progress: 0,
                errorCode: null,
                retryAfterSeconds: null,
                retryAvailableAtMs: null,
              }
            : entry,
        ),
      );

      // Step 1: If a prior upload attempt for this item was interrupted or cancelled in-flight,
      // reconcile the upload receipt & authoritative listing state BEFORE sending another POST.
      if (item.needsReconcile) {
        const preRec = await deps.reconcile(deps.listingId, uploadKey, itemController.signal);
        if (wasAbortedThisRun() || (!preRec.ok && preRec.aborted)) {
          markItemCancelledPreservingPrepared(localId, true);
          return 'cancelled';
        }

        if (!preRec.ok || !isConsistentReconcileData(preRec.data)) {
          if (!preRec.ok && preRec.code === 'signin') {
            deps.updateQueue((prev) =>
              prev.map((entry) =>
                entry.localId === localId
                  ? {
                      ...entry,
                      status: 'failed',
                      progress: 0,
                      errorCode: 'signin',
                      canRetry: true,
                      needsReconcile: true,
                    }
                  : entry,
              ),
            );
            deps.setBanner({ kind: 'error', key: 'signin' });
            return 'pause_auth';
          }
          deps.updateQueue((prev) =>
            prev.map((entry) =>
              entry.localId === localId
                ? {
                    ...entry,
                    status: 'failed',
                    progress: 0,
                    errorCode: 'unavailable',
                    canRetry: true,
                    needsReconcile: true,
                  }
                : entry,
            ),
          );
          deps.setBanner({ kind: 'error', key: 'unavailable' });
          return 'pause_network';
        }

        if (preRec.data.matchedUpload) {
          // Server already committed this exact uploadKey! Complete without sending a duplicate POST.
          markItemSaved({
            localId,
            targetReplaceId,
            savedId: preRec.data.matchedUpload.id,
            savedVersion: Math.max(preRec.data.version, preRec.data.matchedUpload.version),
            authoritativeMediaIds: preRec.data.media_ids,
          });
          return 'saved';
        }

        const knownVersionBeforeReconcile = deps.getSnapshot().version;
        applyAuthoritativeSnapshot({ version: preRec.data.version, media_ids: preRec.data.media_ids });

        const evalResult = evaluateEditableAndSlot(preRec.data, targetReplaceId);
        const externalVersionChanged = preRec.data.version !== knownVersionBeforeReconcile;

        if (!evalResult.editable || evalResult.replaceTargetMissing || externalVersionChanged) {
          deps.setHasConflict(true);
          deps.updateQueue((prev) =>
            prev.map((entry) =>
              entry.localId === localId
                ? {
                    ...entry,
                    status: 'failed',
                    progress: 0,
                    errorCode: 'conflict',
                    canRetry: evalResult.canRetry,
                    needsReconcile: false,
                  }
                : entry,
            ),
          );
          deps.setBanner({ kind: 'error', key: 'conflict' });
          return 'pause_conflict';
        }

        if (evalResult.slotsFull) {
          deps.updateQueue((prev) =>
            prev.map((entry) =>
              entry.localId === localId
                ? {
                    ...entry,
                    status: 'failed',
                    progress: 0,
                    errorCode: 'photoLimit',
                    canRetry: false,
                    needsReconcile: false,
                  }
                : entry,
            ),
          );
          deps.setBanner({ kind: 'error', key: 'photoLimit' });
          return 'pause_conflict';
        }

        // Confirmed not committed and listing state matches; safe to upload with the same uploadKey.
        deps.updateQueue((prev) =>
          prev.map((entry) =>
            entry.localId === localId ? { ...entry, needsReconcile: false } : entry,
          ),
        );
      }

      // Step 2: Upload attempt loop with at most `maxAutoRetries` bounded transient retry.
      for (let attempt = 0; attempt <= maxAutoRetries; attempt++) {
        if (wasAbortedThisRun()) {
          markItemCancelledPreservingPrepared(localId, attempt > 0);
          return 'cancelled';
        }

        const sentVersion = deps.getSnapshot().version;

        // Mark `needsReconcile: true` BEFORE dispatching so any cancel or network drop treats
        // this in-flight request as potentially committed on the server.
        deps.updateQueue((prev) =>
          prev.map((entry) =>
            entry.localId === localId
              ? {
                  ...entry,
                  status: 'uploading',
                  progress: 0,
                  errorCode: null,
                  retryAfterSeconds: null,
                  retryAvailableAtMs: null,
                  needsReconcile: true,
                  lastSentVersion: sentVersion,
                }
              : entry,
          ),
        );

        const result = await deps.sendUpload({
          listingId: deps.listingId,
          expectedVersion: sentVersion,
          uploadKey,
          replacePhotoId: targetReplaceId,
          prepared,
          signal: itemController.signal,
          onProgress: (pct, phase) => {
            if (wasAbortedThisRun()) return;
            deps.updateQueue((prev) =>
              prev.map((entry) =>
                entry.localId === localId &&
                (entry.status === 'uploading' || entry.status === 'saving')
                  ? { ...entry, status: phase, progress: pct }
                  : entry,
              ),
            );
          },
        });

        if (result.ok) {
          if (deps.isMounted()) {
            markItemSaved({
              localId,
              targetReplaceId,
              savedId: result.id,
              savedVersion: result.version,
              authoritativeMediaIds: result.media_ids,
            });
          }
          return 'saved';
        }

        if (wasAbortedThisRun() || result.kind === 'cancelled') {
          markItemCancelledPreservingPrepared(localId, true);
          return 'cancelled';
        }

        if (result.kind === 'auth') {
          deps.updateQueue((prev) =>
            prev.map((entry) =>
              entry.localId === localId
                ? {
                    ...entry,
                    status: 'failed',
                    progress: 0,
                    errorCode: 'signin',
                    canRetry: true,
                    needsReconcile: false,
                  }
                : entry,
            ),
          );
          deps.setBanner({ kind: 'error', key: 'signin' });
          return 'pause_auth';
        }

        if (result.kind === 'rate_limited') {
          const waitSec = result.retryAfterSeconds ?? DEFAULT_RATE_LIMIT_FALLBACK_SECONDS;
          const untilMs = now() + waitSec * 1000;
          const prevUntil = deps.getRateLimitUntilMs() ?? 0;
          deps.setRateLimitUntilMs(Math.max(prevUntil, untilMs));

          deps.updateQueue((prev) =>
            prev.map((entry) =>
              entry.localId === localId
                ? {
                    ...entry,
                    status: 'failed',
                    progress: 0,
                    errorCode: 'rateLimited',
                    retryAfterSeconds: waitSec,
                    retryAvailableAtMs: untilMs,
                    canRetry: true,
                    needsReconcile: false,
                  }
                : entry,
            ),
          );
          deps.setBanner({ kind: 'error', key: 'rateLimited' });
          return 'pause_rate_limit';
        }

        if (result.kind === 'payload_too_large') {
          deps.updateQueue((prev) =>
            prev.map((entry) =>
              entry.localId === localId
                ? {
                    ...entry,
                    status: 'failed',
                    progress: 0,
                    errorCode: 'payloadTooLarge',
                    canRetry: false,
                    needsReconcile: false,
                  }
                : entry,
            ),
          );
          deps.setBanner({ kind: 'error', key: 'payloadTooLarge' });
          return 'item_failed';
        }

        if (result.kind === 'photo_limit') {
          const rec = await deps.reconcile(deps.listingId, undefined, itemController.signal);
          if (wasAbortedThisRun() || (!rec.ok && rec.aborted)) {
            markItemCancelledPreservingPrepared(localId, false);
            return 'cancelled';
          }
          if (rec.ok) {
            applyAuthoritativeSnapshot({ version: rec.data.version, media_ids: rec.data.media_ids });
          }
          deps.updateQueue((prev) =>
            prev.map((entry) =>
              entry.localId === localId
                ? {
                    ...entry,
                    status: 'failed',
                    progress: 0,
                    errorCode: 'photoLimit',
                    canRetry: false,
                    needsReconcile: false,
                  }
                : entry,
            ),
          );
          deps.setBanner({ kind: 'error', key: 'photoLimit' });
          return 'pause_conflict';
        }

        if (result.kind === 'validation') {
          deps.updateQueue((prev) =>
            prev.map((entry) =>
              entry.localId === localId
                ? {
                    ...entry,
                    status: 'failed',
                    progress: 0,
                    errorCode: result.code,
                    canRetry: false,
                    needsReconcile: false,
                  }
                : entry,
            ),
          );
          deps.setBanner({ kind: 'error', key: result.code });
          return 'item_failed';
        }

        if (result.kind === 'conflict') {
          const rec = await deps.reconcile(deps.listingId, uploadKey, itemController.signal);
          if (wasAbortedThisRun() || (!rec.ok && rec.aborted)) {
            markItemCancelledPreservingPrepared(localId, true);
            return 'cancelled';
          }
          const recConsistent = rec.ok && isConsistentReconcileData(rec.data);
          if (recConsistent && rec.data.matchedUpload) {
            markItemSaved({
              localId,
              targetReplaceId,
              savedId: rec.data.matchedUpload.id,
              savedVersion: Math.max(rec.data.version, rec.data.matchedUpload.version),
              authoritativeMediaIds: rec.data.media_ids,
            });
            return 'saved';
          }
          if (recConsistent) {
            applyAuthoritativeSnapshot({ version: rec.data.version, media_ids: rec.data.media_ids });
          }
          const evalResult = recConsistent
            ? evaluateEditableAndSlot(rec.data, targetReplaceId)
            : { canRetry: false };
          deps.setHasConflict(true);
          deps.updateQueue((prev) =>
            prev.map((entry) =>
              entry.localId === localId
                ? {
                    ...entry,
                    status: 'failed',
                    progress: 0,
                    errorCode: 'conflict',
                    canRetry: evalResult.canRetry,
                    needsReconcile: !recConsistent,
                  }
                : entry,
            ),
          );
          deps.setBanner({ kind: 'error', key: 'conflict' });
          return 'pause_conflict';
        }

        // Ambiguous network/timeout/5xx failure: ALWAYS reconcile before retrying!
        const rec = await deps.reconcile(deps.listingId, uploadKey, itemController.signal);
        if (wasAbortedThisRun() || (!rec.ok && rec.aborted)) {
          markItemCancelledPreservingPrepared(localId, true);
          return 'cancelled';
        }

        const recConsistent = rec.ok && isConsistentReconcileData(rec.data);
        if (recConsistent && rec.data.matchedUpload) {
          markItemSaved({
            localId,
            targetReplaceId,
            savedId: rec.data.matchedUpload.id,
            savedVersion: Math.max(rec.data.version, rec.data.matchedUpload.version),
            authoritativeMediaIds: rec.data.media_ids,
          });
          return 'saved';
        }

        if (recConsistent && rec.data.version !== sentVersion) {
          applyAuthoritativeSnapshot({ version: rec.data.version, media_ids: rec.data.media_ids });
          const evalResult = evaluateEditableAndSlot(rec.data, targetReplaceId);
          deps.setHasConflict(true);
          deps.updateQueue((prev) =>
            prev.map((entry) =>
              entry.localId === localId
                ? {
                    ...entry,
                    status: 'failed',
                    progress: 0,
                    errorCode: 'conflict',
                    canRetry: evalResult.canRetry,
                    needsReconcile: false,
                  }
                : entry,
            ),
          );
          deps.setBanner({ kind: 'error', key: 'conflict' });
          return 'pause_conflict';
        }

        if (recConsistent) {
          applyAuthoritativeSnapshot({ version: rec.data.version, media_ids: rec.data.media_ids });
        }

        // Reconciliation confirmed our upload did NOT commit and version is unchanged.
        // Wait through bounded backoff WITH itemController.signal so Cancel immediately aborts!
        if (recConsistent && attempt < maxAutoRetries) {
          const waitMs =
            result.retryAfterSeconds && result.retryAfterSeconds <= 10
              ? result.retryAfterSeconds * 1000
              : backoffMs;
          const okToContinue = await sleep(waitMs, itemController.signal);
          if (!okToContinue || wasAbortedThisRun()) {
            // Reconcile already confirmed this attempt did NOT commit on the server.
            markItemCancelledPreservingPrepared(localId, false);
            return 'cancelled';
          }
          continue;
        }

        const retryAfterSec =
          result.retryAfterSeconds && result.retryAfterSeconds > 0
            ? result.retryAfterSeconds
            : null;
        const retryUntilMs = retryAfterSec ? now() + retryAfterSec * 1000 : null;

        deps.updateQueue((prev) =>
          prev.map((entry) =>
            entry.localId === localId
              ? {
                  ...entry,
                  status: 'failed',
                  progress: 0,
                  errorCode: 'unavailable',
                  retryAfterSeconds: retryAfterSec,
                  retryAvailableAtMs: retryUntilMs,
                  canRetry: true,
                  needsReconcile: !recConsistent,
                }
              : entry,
          ),
        );
        deps.setBanner({ kind: 'error', key: 'unavailable' });
        return 'pause_network';
      }

      return 'pause_network';
    } finally {
      if (deps.activeAbortMap.get(localId) === itemController) {
        deps.activeAbortMap.delete(localId);
      }
    }
  }

  async function runSequentialUploadBatch(params: {
    specificLocalId?: string;
    fallbackReplaceId: string | null;
  }): Promise<{ savedInRun: number; encounteredError: boolean; cancelledInRun: boolean }> {
    const { specificLocalId, fallbackReplaceId } = params;

    // Enforce global conflict & cooldown gates before clearing banner or touching network.
    const specificItem = specificLocalId ? getItem(specificLocalId) ?? null : null;
    const preBlock = getRetryBlockReason({
      item: specificItem,
      hasConflict: deps.getHasConflict(),
      rateLimitUntilMs: deps.getRateLimitUntilMs(),
      nowMs: now(),
    });
    if (preBlock.blocked) {
      if (preBlock.reason === 'conflict') {
        deps.setBanner({ kind: 'error', key: 'conflict' });
      } else if (preBlock.reason === 'cooldown') {
        deps.setBanner({ kind: 'error', key: 'rateLimited' });
      }
      return { savedInRun: 0, encounteredError: true, cancelledInRun: false };
    }

    deps.setBanner(null);

    const targetIds = specificLocalId
      ? [specificLocalId]
      : deps
          .getQueue()
          .filter(
            (item) =>
              item.status === 'selected' ||
              item.status === 'preparing' ||
              item.status === 'ready' ||
              (item.status === 'failed' && item.canRetry) ||
              (item.status === 'cancelled' && item.canRetry),
          )
          .map((item) => item.localId);

    if (targetIds.length === 0) {
      const firstPrepError = deps
        .getQueue()
        .find((item) => item.status === 'failed' && item.errorCode);
      if (firstPrepError?.errorCode) {
        deps.setBanner({ kind: 'error', key: firstPrepError.errorCode });
      }
      return { savedInRun: 0, encounteredError: false, cancelledInRun: false };
    }

    let savedInRun = 0;
    let encounteredError = false;
    let cancelledInRun = false;

    for (const localId of targetIds) {
      if (!deps.isMounted()) break;
      const curItem = getItem(localId);
      if (!curItem) continue;

      const effectiveReplace = curItem.replaceTargetId ?? fallbackReplaceId;
      if (!effectiveReplace && deps.getSnapshot().media_ids.length >= deps.maxPhotos) {
        deps.setBanner({ kind: 'info', key: 'photoLimit' });
        break;
      }

      const outcome = await uploadSingleQueueItem(localId, fallbackReplaceId);
      if (outcome === 'saved') {
        savedInRun++;
        if (effectiveReplace) break;
      } else if (outcome === 'skipped') {
        continue;
      } else if (outcome === 'cancelled') {
        cancelledInRun = true;
        break;
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

    return { savedInRun, encounteredError, cancelledInRun };
  }

  return {
    uploadSingleQueueItem,
    runSequentialUploadBatch,
    reloadAfterConflict,
  };
}
