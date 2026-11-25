import { ClientImagePrepError, type PreparedPhotoResult } from './constants';

export type PreparationRunner = (
  file: File,
  signal: AbortSignal,
) => Promise<PreparedPhotoResult>;

export type PreparationSchedulerHooks = {
  onStart?: (id: string) => void;
  onSuccess?: (id: string, result: PreparedPhotoResult) => void;
  onError?: (id: string, error: unknown) => void;
  onCancel?: (id: string) => void;
};

type PendingTask = {
  id: string;
  file: File;
  promise: Promise<PreparedPhotoResult>;
  resolve: (value: PreparedPhotoResult) => void;
  reject: (reason: unknown) => void;
};

type ActiveTask = PendingTask & {
  controller: AbortController;
  settled: boolean;
};

export type PreparationScheduler = {
  /** Enqueue a photo for serial preparation (deduplicated by id). */
  enqueue: (id: string, file: File) => Promise<PreparedPhotoResult>;
  /**
   * Wait for an active or queued photo to finish preparing without ever starting a
   * second concurrent preparation job. If queued behind other items, promotes `id`
   * to run next once the currently active job finishes.
   */
  waitFor: (id: string) => Promise<PreparedPhotoResult | null>;
  /**
   * Cancel a pending or actively preparing photo. Pending items reject immediately
   * without decoding; active items abort their AbortSignal and release the slot
   * cleanly before any subsequent job starts.
   */
  cancel: (id: string) => void;
  /** Cancel all pending and active jobs. */
  cancelAll: () => void;
  /** True while a job is currently executing. */
  isBusy: () => boolean;
  /** Currently executing job id, or null. */
  getActiveId: () => string | null;
  /** Ordered ids of jobs waiting to run. */
  getPendingIds: () => string[];
};

/**
 * Single-flight client image preparation scheduler.
 *
 * Guarantees strictly <= 1 photo decode/resize/encode operation at any instant across
 * file selection, upload start, cancellation, and retries so large mobile photos
 * (including 48 MP iPhone captures) never compete for decoded RGBA memory or the
 * shared preparation Web Worker.
 */
export function createPreparationScheduler(
  runner: PreparationRunner,
  hooks: PreparationSchedulerHooks = {},
): PreparationScheduler {
  let active: ActiveTask | null = null;
  const pending: PendingTask[] = [];
  const tasksById = new Map<string, PendingTask | ActiveTask>();

  const pump = () => {
    if (active !== null) return;
    const next = pending.shift();
    if (!next) return;

    const controller = new AbortController();
    const current: ActiveTask = {
      ...next,
      controller,
      settled: false,
    };
    active = current;
    tasksById.set(current.id, current);

    hooks.onStart?.(current.id);

    Promise.resolve()
      .then(() => runner(current.file, controller.signal))
      .then(
        (result) => {
          if (current.settled) return;
          current.settled = true;
          if (active === current) active = null;
          tasksById.delete(current.id);
          if (controller.signal.aborted) {
            const err = new ClientImagePrepError('cancelled');
            hooks.onCancel?.(current.id);
            current.reject(err);
          } else {
            hooks.onSuccess?.(current.id, result);
            current.resolve(result);
          }
        },
        (error) => {
          if (current.settled) return;
          current.settled = true;
          if (active === current) active = null;
          tasksById.delete(current.id);
          const isCancelled =
            controller.signal.aborted ||
            (error instanceof ClientImagePrepError && error.code === 'cancelled');
          if (isCancelled) {
            const err =
              error instanceof ClientImagePrepError && error.code === 'cancelled'
                ? error
                : new ClientImagePrepError('cancelled');
            hooks.onCancel?.(current.id);
            current.reject(err);
          } else {
            hooks.onError?.(current.id, error);
            current.reject(error);
          }
        },
      )
      .finally(() => {
        if (active === current) active = null;
        tasksById.delete(current.id);
        pump();
      });
  };

  function enqueue(id: string, file: File): Promise<PreparedPhotoResult> {
    const existing = tasksById.get(id);
    if (existing) {
      return existing.promise;
    }

    let resolveFn!: (value: PreparedPhotoResult) => void;
    let rejectFn!: (reason: unknown) => void;
    const promise = new Promise<PreparedPhotoResult>((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });
    // Prevent unhandled rejection warnings when callers listen via hooks rather than awaiting enqueue().
    promise.catch(() => {});

    const task: PendingTask = {
      id,
      file,
      promise,
      resolve: resolveFn,
      reject: rejectFn,
    };

    pending.push(task);
    tasksById.set(id, task);
    pump();
    return promise;
  }

  async function waitFor(id: string): Promise<PreparedPhotoResult | null> {
    const existing = tasksById.get(id);
    if (!existing) return null;

    // If queued behind other pending items, promote it to run next after the active job finishes
    // without ever violating concurrency = 1.
    const pendingIdx = pending.findIndex((entry) => entry.id === id);
    if (pendingIdx > 0) {
      const [promoted] = pending.splice(pendingIdx, 1);
      pending.unshift(promoted);
    }

    try {
      return await existing.promise;
    } catch {
      return null;
    }
  }

  function cancel(id: string): void {
    const pendingIdx = pending.findIndex((entry) => entry.id === id);
    if (pendingIdx !== -1) {
      const [removed] = pending.splice(pendingIdx, 1);
      tasksById.delete(id);
      hooks.onCancel?.(id);
      removed.reject(new ClientImagePrepError('cancelled'));
      return;
    }

    if (active && active.id === id) {
      active.controller.abort();
    }
  }

  function cancelAll(): void {
    const queued = pending.splice(0, pending.length);
    for (const item of queued) {
      tasksById.delete(item.id);
      hooks.onCancel?.(item.id);
      item.reject(new ClientImagePrepError('cancelled'));
    }
    if (active) {
      active.controller.abort();
    }
  }

  return {
    enqueue,
    waitFor,
    cancel,
    cancelAll,
    isBusy: () => active !== null,
    getActiveId: () => active?.id ?? null,
    getPendingIds: () => pending.map((entry) => entry.id),
  };
}
