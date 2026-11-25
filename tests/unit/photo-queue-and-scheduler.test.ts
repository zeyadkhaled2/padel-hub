import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import {
  ClientImagePrepError,
  type PreparedPhotoResult,
} from '@/features/photos/client/constants';
import { createPreparationScheduler } from '@/features/photos/client/prep-scheduler';
import {
  createUploadQueueController,
  type ListingPhotoSnapshot,
  type PhotoQueueItem,
  type QueueBanner,
  type ReconcileResultLike,
} from '@/features/photos/client/queue-controller';
import type { UploadTransportResult } from '@/features/photos/client/upload-transport';

const TEST_LISTING_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function makeReconcileOk(data: {
  version: number;
  status: string;
  media_ids: string[];
  matchedUpload: {
    id: string;
    version: number;
    expected_version: number;
    replace_photo_id: string | null;
  } | null;
}): ReconcileResultLike {
  return {
    ok: true,
    data: {
      id: TEST_LISTING_ID,
      ...data,
    },
  };
}

function makePrepared(bytes = 250_000): PreparedPhotoResult {
  return {
    blob: new Blob([new Uint8Array(16)], { type: 'image/webp' }),
    mimeType: 'image/webp',
    sourceFormat: 'jpeg',
    originalBytes: 8_000_000,
    preparedBytes: bytes,
    originalWidth: 8064,
    originalHeight: 6048,
    width: 2000,
    height: 1500,
    durationMs: 42,
    passedThrough: false,
    heicFallbackUsed: false,
    workerUsed: true,
    qualityUsed: 0.9,
  };
}

function makeQueueItem(overrides: Partial<PhotoQueueItem> = {}): PhotoQueueItem {
  return {
    localId: overrides.localId ?? 'local-1',
    uploadKey: overrides.uploadKey ?? '11111111-1111-4111-8111-111111111111',
    replaceTargetId: overrides.replaceTargetId ?? null,
    file: overrides.file ?? null,
    fileName: overrides.fileName ?? 'photo.jpg',
    originalBytes: overrides.originalBytes ?? 8_000_000,
    status: overrides.status ?? 'ready',
    progress: overrides.progress ?? 0,
    previewUrl: overrides.previewUrl ?? 'blob:preview-1',
    prepared: overrides.prepared === undefined ? makePrepared() : overrides.prepared,
    errorCode: overrides.errorCode ?? null,
    retryAfterSeconds: overrides.retryAfterSeconds ?? null,
    retryAvailableAtMs: overrides.retryAvailableAtMs ?? null,
    canRetry: overrides.canRetry ?? false,
    needsReconcile: overrides.needsReconcile ?? false,
    lastSentVersion: overrides.lastSentVersion ?? null,
  };
}

function createHarness(opts: {
  initialSnapshot?: ListingPhotoSnapshot;
  initialQueue?: PhotoQueueItem[];
  initialConflict?: boolean;
  initialRateLimitUntilMs?: number | null;
  nowMs?: number;
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
  sleep?: (ms: number, signal?: AbortSignal) => Promise<boolean>;
  waitForPrepared?: (localId: string) => Promise<PreparedPhotoResult | null>;
}) {
  let snapshot: ListingPhotoSnapshot = opts.initialSnapshot ?? { version: 1, media_ids: [] };
  let queue: PhotoQueueItem[] = opts.initialQueue ?? [];
  let hasConflict = opts.initialConflict ?? false;
  let rateLimitUntilMs: number | null = opts.initialRateLimitUntilMs ?? null;
  let banner: QueueBanner = null;
  let nowMs = opts.nowMs ?? 10_000;
  let replaceClearedCount = 0;
  const revokedUrls: string[] = [];
  const activeAbortMap = new Map<string, AbortController>();

  const controller = createUploadQueueController({
    listingId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    maxPhotos: 4,
    maxAutoTransientRetries: 1,
    transientRetryBackoffMs: 1200,
    now: () => nowMs,
    sleep: opts.sleep,
    isMounted: () => true,
    getSnapshot: () => snapshot,
    setSnapshot: (next) => {
      snapshot = next;
    },
    getQueue: () => queue,
    updateQueue: (updater) => {
      queue = updater(queue);
    },
    getHasConflict: () => hasConflict,
    setHasConflict: (val) => {
      hasConflict = val;
    },
    getRateLimitUntilMs: () => rateLimitUntilMs,
    setRateLimitUntilMs: (val) => {
      rateLimitUntilMs = val;
    },
    setBanner: (next) => {
      banner = next;
    },
    onReplaceCleared: () => {
      replaceClearedCount++;
    },
    revokeUrl: (url) => {
      revokedUrls.push(url);
    },
    activeAbortMap,
    waitForPrepared: opts.waitForPrepared ?? (async () => null),
    sendUpload: opts.sendUpload,
    reconcile: opts.reconcile,
  });

  return {
    controller,
    activeAbortMap,
    getSnapshot: () => snapshot,
    getQueue: () => queue,
    getItem: (id: string) => queue.find((i) => i.localId === id),
    getHasConflict: () => hasConflict,
    getRateLimitUntilMs: () => rateLimitUntilMs,
    getBanner: () => banner,
    getRevokedUrls: () => revokedUrls,
    getReplaceClearedCount: () => replaceClearedCount,
    advanceNow: (deltaMs: number) => {
      nowMs += deltaMs;
    },
  };
}

test('PreparationScheduler enforces strict concurrency=1 across enqueue, waitFor promotion, and cancellation of large photos', async () => {
  let inFlight = 0;
  let maxConcurrent = 0;
  const startedOrder: string[] = [];
  const cancelledIds: string[] = [];
  const completedIds: string[] = [];
  const resolvers = new Map<string, { resolve: () => void; reject: (err: unknown) => void }>();

  const scheduler = createPreparationScheduler(
    (file, signal) =>
      new Promise<PreparedPhotoResult>((resolve, reject) => {
        inFlight++;
        maxConcurrent = Math.max(maxConcurrent, inFlight);
        startedOrder.push(file.name);

        const finish = (cb: () => void) => {
          inFlight--;
          cb();
        };

        signal.addEventListener(
          'abort',
          () => {
            finish(() => reject(new ClientImagePrepError('cancelled')));
          },
          { once: true },
        );

        resolvers.set(file.name, {
          resolve: () => finish(() => resolve(makePrepared())),
          reject: (err) => finish(() => reject(err)),
        });
      }),
    {
      onCancel: (id) => cancelledIds.push(id),
      onSuccess: (id) => completedIds.push(id),
    },
  );

  const f1 = new File([new Uint8Array(64)], 'iphone-48mp-1.jpg', { type: 'image/jpeg' });
  const f2 = new File([new Uint8Array(64)], 'iphone-48mp-2.jpg', { type: 'image/jpeg' });
  const f3 = new File([new Uint8Array(64)], 'iphone-48mp-3.jpg', { type: 'image/jpeg' });
  const f4 = new File([new Uint8Array(64)], 'iphone-48mp-4.jpg', { type: 'image/jpeg' });

  void scheduler.enqueue('p1', f1);
  void scheduler.enqueue('p2', f2);
  void scheduler.enqueue('p3', f3);
  void scheduler.enqueue('p4', f4);

  // Immediately calling waitFor on p3 while p1 is active must NEVER start p3 concurrently.
  const waitP3 = scheduler.waitFor('p3');
  assert.equal(scheduler.getActiveId(), 'p1');
  assert.deepEqual(scheduler.getPendingIds(), ['p3', 'p2', 'p4']);
  await Promise.resolve();
  assert.equal(inFlight, 1);

  // Cancel queued p2 before it ever starts -> zero runner invocation for p2!
  scheduler.cancel('p2');
  assert.deepEqual(scheduler.getPendingIds(), ['p3', 'p4']);
  assert.deepEqual(cancelledIds, ['p2']);

  // Cancel active p1 mid-decode -> aborts cleanly and advances to promoted p3 with concurrency=1!
  scheduler.cancel('p1');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(maxConcurrent, 1);
  assert.equal(scheduler.getActiveId(), 'p3');
  assert.deepEqual(cancelledIds, ['p2', 'p1']);

  // Complete p3 and p4 serially.
  resolvers.get('iphone-48mp-3.jpg')!.resolve();
  const resP3 = await waitP3;
  assert.ok(resP3);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(scheduler.getActiveId(), 'p4');

  resolvers.get('iphone-48mp-4.jpg')!.resolve();
  await scheduler.waitFor('p4');

  assert.equal(maxConcurrent, 1);
  assert.deepEqual(startedOrder, ['iphone-48mp-1.jpg', 'iphone-48mp-3.jpg', 'iphone-48mp-4.jpg']);
  assert.deepEqual(completedIds, ['p3', 'p4']);
});

test('cancelled upload retry reconciles first and uploads cleanly when server did NOT commit', async () => {
  const reconcileCalls: Array<{ listingId: string; uploadKey?: string }> = [];
  const postCalls: Array<{ expectedVersion: number; uploadKey: string }> = [];
  let firstAbortTrigger: (() => void) | null = null;

  const h = createHarness({
    initialSnapshot: { version: 2, media_ids: ['m-existing'] },
    initialQueue: [makeQueueItem({ localId: 'p1', uploadKey: 'k-cancel-uncommitted' })],
    reconcile: async (listingId, uploadKey) => {
      reconcileCalls.push({ listingId, uploadKey });
      return makeReconcileOk({
        version: 2,
        status: 'draft',
        media_ids: ['m-existing'],
        matchedUpload: null,
      });
    },
    sendUpload: ({ expectedVersion, uploadKey, signal }) =>
      new Promise<UploadTransportResult>((resolve) => {
        postCalls.push({ expectedVersion, uploadKey });
        if (postCalls.length === 1) {
          signal?.addEventListener(
            'abort',
            () => resolve({ ok: false, kind: 'cancelled', code: 'unavailable', status: 0 }),
            { once: true },
          );
          firstAbortTrigger?.();
          return;
        }
        resolve({
          ok: true,
          id: 'm-new',
          version: 3,
          media_ids: ['m-existing', 'm-new'],
          idempotent: false,
        });
      }),
  });

  // Start upload #1 and cancel it mid-flight.
  const firstRun = h.controller.runSequentialUploadBatch({ fallbackReplaceId: null });
  await new Promise<void>((resolve) => {
    firstAbortTrigger = resolve;
    if (postCalls.length === 1) resolve();
  });
  h.activeAbortMap.get('p1')!.abort();
  const firstOutcome = await firstRun;

  assert.equal(firstOutcome.cancelledInRun, true);
  assert.equal(h.getItem('p1')?.status, 'cancelled');
  assert.equal(h.getItem('p1')?.canRetry, true);
  assert.equal(h.getItem('p1')?.needsReconcile, true);
  assert.equal(h.getItem('p1')?.previewUrl, 'blob:preview-1'); // Preview preserved for Retry!
  assert.equal(h.getRevokedUrls().length, 0);

  // Now click Retry on the cancelled item -> must reconcile first, then POST with same uploadKey!
  const retryOutcome = await h.controller.runSequentialUploadBatch({
    specificLocalId: 'p1',
    fallbackReplaceId: null,
  });

  assert.equal(retryOutcome.savedInRun, 1);
  assert.equal(reconcileCalls.length, 1);
  assert.equal(reconcileCalls[0].uploadKey, 'k-cancel-uncommitted');
  assert.equal(postCalls.length, 2);
  assert.equal(postCalls[1].uploadKey, 'k-cancel-uncommitted');
  assert.equal(postCalls[1].expectedVersion, 2);
  assert.equal(h.getItem('p1')?.status, 'saved');
  assert.deepEqual(h.getSnapshot(), { version: 3, media_ids: ['m-existing', 'm-new'] });
  assert.deepEqual(h.getRevokedUrls(), ['blob:preview-1']);
});

test('cancelled in-flight upload retry reconciles ambiguous server commit without sending a duplicate POST', async () => {
  let postCount = 0;
  let reconcileCount = 0;

  const h = createHarness({
    initialSnapshot: { version: 1, media_ids: [] },
    initialQueue: [
      makeQueueItem({
        localId: 'p1',
        uploadKey: 'k-cancelled-committed',
        status: 'cancelled',
        canRetry: true,
        needsReconcile: true,
        lastSentVersion: 1,
      }),
    ],
    reconcile: async (_listingId, uploadKey) => {
      reconcileCount++;
      assert.equal(uploadKey, 'k-cancelled-committed');
      return makeReconcileOk({
        version: 2,
        status: 'draft',
        media_ids: ['m-committed-before-abort'],
        matchedUpload: {
          id: 'm-committed-before-abort',
          version: 2,
          expected_version: 1,
          replace_photo_id: null,
        },
      });
    },
    sendUpload: async () => {
      postCount++;
      throw new Error('Should never send duplicate POST when reconcile finds matchedUpload');
    },
  });

  const result = await h.controller.runSequentialUploadBatch({
    specificLocalId: 'p1',
    fallbackReplaceId: null,
  });

  assert.equal(result.savedInRun, 1);
  assert.equal(reconcileCount, 1);
  assert.equal(postCount, 0);
  assert.equal(h.getItem('p1')?.status, 'saved');
  assert.deepEqual(h.getSnapshot(), { version: 2, media_ids: ['m-committed-before-abort'] });
});

test('cancelled replacement retry preserves replaceTargetId and reconciles ambiguous replacement commits with zero duplicate POSTs', async () => {
  // Case A: Server did NOT commit the cancelled replacement -> Retry reconciles and re-sends X-Replace-Photo!
  const sentReplaces: Array<string | null> = [];
  const hUncommitted = createHarness({
    initialSnapshot: { version: 4, media_ids: ['m1', 'm2', 'm3'] },
    initialQueue: [
      makeQueueItem({
        localId: 'rep-1',
        uploadKey: 'k-rep-uncommitted',
        replaceTargetId: 'm2',
        status: 'cancelled',
        canRetry: true,
        needsReconcile: true,
        lastSentVersion: 4,
      }),
    ],
    reconcile: async () =>
      makeReconcileOk({ version: 4, status: 'draft', media_ids: ['m1', 'm2', 'm3'], matchedUpload: null }),
    sendUpload: async ({ replacePhotoId }) => {
      sentReplaces.push(replacePhotoId);
      return { ok: true, id: 'm2-new', version: 5, media_ids: ['m1', 'm2-new', 'm3'], idempotent: false };
    },
  });

  const resA = await hUncommitted.controller.runSequentialUploadBatch({
    specificLocalId: 'rep-1',
    fallbackReplaceId: 'm2',
  });
  assert.equal(resA.savedInRun, 1);
  assert.deepEqual(sentReplaces, ['m2']);
  assert.equal(hUncommitted.getReplaceClearedCount(), 1);
  assert.deepEqual(hUncommitted.getSnapshot().media_ids, ['m1', 'm2-new', 'm3']);

  // Case B: Server DID commit the cancelled replacement before abort -> Retry resolves via reconcile with 0 POSTs!
  let duplicatePosts = 0;
  const hCommitted = createHarness({
    initialSnapshot: { version: 4, media_ids: ['m1', 'm2', 'm3'] },
    initialQueue: [
      makeQueueItem({
        localId: 'rep-2',
        uploadKey: 'k-rep-committed',
        replaceTargetId: 'm2',
        status: 'cancelled',
        canRetry: true,
        needsReconcile: true,
        lastSentVersion: 4,
      }),
    ],
    reconcile: async () =>
      makeReconcileOk({
        version: 5,
        status: 'draft',
        media_ids: ['m1', 'm2-replaced', 'm3'],
        matchedUpload: {
          id: 'm2-replaced',
          version: 5,
          expected_version: 4,
          replace_photo_id: 'm2',
        },
      }),
    sendUpload: async () => {
      duplicatePosts++;
      throw new Error('Must not POST duplicate replacement');
    },
  });

  const resB = await hCommitted.controller.runSequentialUploadBatch({
    specificLocalId: 'rep-2',
    fallbackReplaceId: 'm2',
  });
  assert.equal(resB.savedInRun, 1);
  assert.equal(duplicatePosts, 0);
  assert.equal(hCommitted.getReplaceClearedCount(), 1);
  assert.deepEqual(hCommitted.getSnapshot(), { version: 5, media_ids: ['m1', 'm2-replaced', 'm3'] });
});

test('cancellation during automatic retry backoff immediately aborts delay and prevents further automatic POST requests', async () => {
  let postCount = 0;
  let sleepEnteredResolve!: () => void;
  const sleepEntered = new Promise<void>((resolve) => {
    sleepEnteredResolve = resolve;
  });

  const h = createHarness({
    initialSnapshot: { version: 1, media_ids: [] },
    initialQueue: [makeQueueItem({ localId: 'p1', uploadKey: 'k-backoff' })],
    sendUpload: async () => {
      postCount++;
      return { ok: false, kind: 'ambiguous', code: 'unavailable', status: 503, retryAfterSeconds: 5 };
    },
    reconcile: async () =>
      makeReconcileOk({ version: 1, status: 'draft', media_ids: [], matchedUpload: null }),
    sleep: (_ms, signal) =>
      new Promise<boolean>((resolve) => {
        sleepEnteredResolve();
        if (signal?.aborted) {
          resolve(false);
          return;
        }
        signal?.addEventListener('abort', () => resolve(false), { once: true });
      }),
  });

  const runPromise = h.controller.runSequentialUploadBatch({ fallbackReplaceId: null });
  await sleepEntered;

  // Seller clicks Cancel during the 5s retry backoff delay!
  const controller = h.activeAbortMap.get('p1');
  assert.ok(controller, 'Active AbortController must remain registered during backoff sleep');
  controller.abort();

  const outcome = await runPromise;
  assert.equal(outcome.cancelledInRun, true);
  assert.equal(postCount, 1, 'No automatic retry POST may execute after Cancel during backoff');
  assert.equal(h.getItem('p1')?.status, 'cancelled');
  assert.equal(h.getItem('p1')?.canRetry, true);
  assert.equal(h.getItem('p1')?.previewUrl, 'blob:preview-1');
});

test('individual retry cannot bypass unresolved conflict reconciliation OR Retry-After cooldown restrictions', async () => {
  // Part A: Conflict gate blocks individual Retry until explicit reloadAfterConflict succeeds!
  let conflictPostCalls = 0;
  let reconcileMode: 'external_change' | 'reload_clean' = 'external_change';

  const hConflict = createHarness({
    initialSnapshot: { version: 1, media_ids: [] },
    initialQueue: [
      makeQueueItem({ localId: 'p1', uploadKey: 'k-c1' }),
      makeQueueItem({ localId: 'p2', uploadKey: 'k-c2', previewUrl: 'blob:preview-2' }),
    ],
    sendUpload: async ({ expectedVersion }) => {
      conflictPostCalls++;
      if (conflictPostCalls === 1) {
        return { ok: false, kind: 'conflict', code: 'conflict', status: 409 };
      }
      assert.equal(expectedVersion, 3, 'After reload, retry must use freshly reconciled version');
      return { ok: true, id: 'm-after-reload', version: 4, media_ids: ['m-ext', 'm-after-reload'], idempotent: false };
    },
    reconcile: async () =>
      makeReconcileOk({
        version: 3,
        status: 'draft',
        media_ids: ['m-ext'],
        matchedUpload: null,
      }),
  });

  // Trigger 409 conflict on p1.
  const firstConflict = await hConflict.controller.runSequentialUploadBatch({ fallbackReplaceId: null });
  assert.equal(firstConflict.encounteredError, true);
  assert.equal(hConflict.getHasConflict(), true);
  assert.equal(conflictPostCalls, 1);

  // Attempt individual Retry on p1 AND p2 without reloading -> BOTH must be blocked with 0 POSTs!
  const bypass1 = await hConflict.controller.runSequentialUploadBatch({
    specificLocalId: 'p1',
    fallbackReplaceId: null,
  });
  const bypass2 = await hConflict.controller.runSequentialUploadBatch({
    specificLocalId: 'p2',
    fallbackReplaceId: null,
  });
  assert.equal(bypass1.encounteredError, true);
  assert.equal(bypass2.encounteredError, true);
  assert.equal(conflictPostCalls, 1, 'Individual retries must NOT bypass conflict gate');
  assert.equal(hConflict.getHasConflict(), true);

  // Explicit Reload draft reconciles cleanly and unlocks upload with version 3.
  reconcileMode = 'reload_clean';
  assert.equal(reconcileMode, 'reload_clean');
  const reloaded = await hConflict.controller.reloadAfterConflict();
  assert.equal(reloaded.ok, true);
  assert.equal(hConflict.getHasConflict(), false);
  assert.equal(hConflict.getItem('p1')?.status, 'ready');

  const afterReload = await hConflict.controller.runSequentialUploadBatch({
    specificLocalId: 'p1',
    fallbackReplaceId: null,
  });
  assert.equal(afterReload.savedInRun, 1);
  assert.equal(conflictPostCalls, 2);

  // Part B: 429 Retry-After cooldown blocks individual Retry & batch Upload until cooldown elapses!
  let ratePosts = 0;
  const hRate = createHarness({
    nowMs: 100_000,
    initialSnapshot: { version: 1, media_ids: [] },
    initialQueue: [
      makeQueueItem({ localId: 'r1', uploadKey: 'k-r1' }),
      makeQueueItem({ localId: 'r2', uploadKey: 'k-r2', previewUrl: 'blob:preview-r2' }),
    ],
    sendUpload: async () => {
      ratePosts++;
      if (ratePosts === 1) {
        return {
          ok: false,
          kind: 'rate_limited',
          code: 'rateLimited',
          status: 429,
          retryAfterSeconds: 30,
        };
      }
      return { ok: true, id: 'm-after-cooldown', version: 2, media_ids: ['m-after-cooldown'], idempotent: false };
    },
    reconcile: async () =>
      makeReconcileOk({ version: 1, status: 'draft', media_ids: [], matchedUpload: null }),
  });

  const rateHit = await hRate.controller.runSequentialUploadBatch({ fallbackReplaceId: null });
  assert.equal(rateHit.encounteredError, true);
  assert.equal(hRate.getRateLimitUntilMs(), 130_000);
  assert.equal(hRate.getItem('r1')?.retryAvailableAtMs, 130_000);
  assert.equal(ratePosts, 1);

  // Advance only 10s (20s remaining): individual retry on r1, r2, and full batch MUST send 0 POSTs!
  hRate.advanceNow(10_000);
  await hRate.controller.runSequentialUploadBatch({ specificLocalId: 'r1', fallbackReplaceId: null });
  await hRate.controller.runSequentialUploadBatch({ specificLocalId: 'r2', fallbackReplaceId: null });
  await hRate.controller.runSequentialUploadBatch({ fallbackReplaceId: null });
  assert.equal(ratePosts, 1, 'Individual and batch retries must respect active Retry-After cooldown');

  // Advance remaining 20s -> Retry now executes and saves cleanly!
  hRate.advanceNow(20_000);
  const afterCooldown = await hRate.controller.runSequentialUploadBatch({
    specificLocalId: 'r1',
    fallbackReplaceId: null,
  });
  assert.equal(afterCooldown.savedInRun, 1);
  assert.equal(ratePosts, 2);
});

test('LGPL-3.0 third-party notice and verbatim GPL-3.0 / LGPL-3.0 license texts are present', async () => {
  const root = process.cwd();
  const rootNotices = await readFile(join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8');
  const publicNotice = await readFile(join(root, 'public', 'licenses', 'libheif-js-NOTICE.txt'), 'utf8');
  const publicLicense = await readFile(join(root, 'public', 'licenses', 'libheif-js-LICENSE.txt'), 'utf8');

  assert.match(rootNotices, /libheif-js@1\.23\.5/);
  assert.match(rootNotices, /LGPL-3\.0/);
  assert.match(rootNotices, /\/vendor\/libheif\/libheif-bundle\.mjs/);

  assert.match(publicNotice, /GNU Lesser General\s+Public License, Version 3/);
  assert.match(publicNotice, /\/licenses\/libheif-js-LICENSE\.txt/);
  assert.match(publicNotice, /https:\/\/github\.com\/strukturag\/libheif/);
  assert.match(publicNotice, /https:\/\/github\.com\/strukturag\/libde265/);

  assert.match(publicLicense, /GNU LESSER GENERAL PUBLIC LICENSE/);
  assert.match(publicLicense, /GNU GENERAL PUBLIC LICENSE/);
  assert.match(publicLicense, /Version 3, 29 June 2007/);
});
