import {
  CLIENT_IMAGE_LIMITS,
  ClientImagePrepError,
  type ClientSourceFormat,
  type PreparedPhotoResult,
} from './constants';
import {
  createDrawableFromRgba,
  encodeImageAdaptively,
  type DrawableImageSource,
} from './encode-canvas';
import {
  canFallbackToOriginalOnPrepFailure,
  canPassthroughOriginal,
  computeResizedDimensions,
  formatToMime,
  inspectImageHeader,
  isSwappedOrientation,
  shouldPreferOriginalOverReencoded,
  validateClientSourceDimensions,
  type ImageHeaderInspection,
} from './format';
import { decodeHeicBytes } from './heic';
import type { WorkerPrepRequest, WorkerPrepResponse } from './worker';

export type PreparePhotoOptions = {
  signal?: AbortSignal;
  /** Force main-thread execution (useful in fallback paths or testing). */
  forceMainThread?: boolean;
  /** Force lazy WASM HEIC decoder even if browser natively decodes HEIC (testing only). */
  forceHeicFallback?: boolean;
};

const INITIAL_HEADER_SNIFF_BYTES = 128 * 1024;
const EXTENDED_HEADER_SNIFF_BYTES = 512 * 1024;

let sharedWorker: Worker | null = null;
let workerJobSeq = 0;

export function terminateImagePrepWorker(): void {
  if (sharedWorker) {
    sharedWorker.terminate();
    sharedWorker = null;
  }
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function canUseDedicatedWorker(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof createImageBitmap === 'function'
  );
}

async function sniffFileHeader(file: File): Promise<ImageHeaderInspection> {
  const firstSlice = new Uint8Array(
    await file.slice(0, Math.min(file.size, INITIAL_HEADER_SNIFF_BYTES)).arrayBuffer(),
  );
  const first = inspectImageHeader(firstSlice);

  // JPEGs with large ICC/XMP profiles may place SOF0/SOF2 past 128 KB; inspect up to 512 KB.
  if (
    first.format === 'jpeg' &&
    first.rawWidth === null &&
    file.size > INITIAL_HEADER_SNIFF_BYTES
  ) {
    const extendedSlice = new Uint8Array(
      await file.slice(0, Math.min(file.size, EXTENDED_HEADER_SNIFF_BYTES)).arrayBuffer(),
    );
    return inspectImageHeader(extendedSlice);
  }
  return first;
}

function runInWorker(
  file: File,
  inspection: ImageHeaderInspection,
  options: PreparePhotoOptions,
): Promise<Omit<PreparedPhotoResult, 'originalBytes' | 'preparedBytes' | 'durationMs' | 'workerUsed'>> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new ClientImagePrepError('cancelled'));
      return;
    }

    let worker: Worker;
    try {
      if (!sharedWorker) {
        sharedWorker = new Worker(new URL('./worker.ts', import.meta.url));
      }
      worker = sharedWorker;
    } catch {
      reject(new Error('Worker creation failed'));
      return;
    }

    const jobId = ++workerJobSeq;

    const cleanup = () => {
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      options.signal?.removeEventListener('abort', handleAbort);
    };

    const handleAbort = () => {
      cleanup();
      terminateImagePrepWorker();
      reject(new ClientImagePrepError('cancelled'));
    };

    const handleError = () => {
      cleanup();
      terminateImagePrepWorker();
      reject(new Error('Worker runtime error'));
    };

    const handleMessage = (event: MessageEvent<WorkerPrepResponse>) => {
      if (!event.data || event.data.id !== jobId) return;
      cleanup();
      if (event.data.ok) {
        const {
          blob,
          mimeType,
          sourceFormat,
          originalWidth,
          originalHeight,
          width,
          height,
          passedThrough,
          heicFallbackUsed,
          qualityUsed,
        } = event.data;
        resolve({
          blob,
          mimeType,
          sourceFormat,
          originalWidth,
          originalHeight,
          width,
          height,
          passedThrough,
          heicFallbackUsed,
          qualityUsed,
        });
      } else {
        reject(new ClientImagePrepError(event.data.code));
      }
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);
    options.signal?.addEventListener('abort', handleAbort, { once: true });

    const payload: WorkerPrepRequest = {
      id: jobId,
      file,
      inspection,
      forceHeicFallback: options.forceHeicFallback,
    };
    worker.postMessage(payload);
  });
}

async function loadHtmlImage(
  file: Blob,
  signal?: AbortSignal,
): Promise<{ source: HTMLImageElement; width: number; height: number; release: () => void }> {
  if (typeof Image === 'undefined' || typeof URL === 'undefined') {
    throw new ClientImagePrepError('unsupportedBrowser');
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.decoding = 'async';
      const onAbort = () => reject(new ClientImagePrepError('cancelled'));
      signal?.addEventListener('abort', onAbort, { once: true });
      el.onload = () => {
        signal?.removeEventListener('abort', onAbort);
        resolve(el);
      };
      el.onerror = () => {
        signal?.removeEventListener('abort', onAbort);
        reject(new ClientImagePrepError('invalidFile'));
      };
      el.src = objectUrl;
    });

    if (typeof img.decode === 'function') {
      try {
        await img.decode();
      } catch {
        /* Some browsers reject decode() even after onload; naturalWidth check validates below. */
      }
    }

    const width = img.naturalWidth;
    const height = img.naturalHeight;
    if (!validateClientSourceDimensions(width, height)) {
      URL.revokeObjectURL(objectUrl);
      throw new ClientImagePrepError('invalidFile');
    }

    return {
      source: img,
      width,
      height,
      release: () => {
        img.src = '';
        URL.revokeObjectURL(objectUrl);
      },
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

async function decodeNativelyOnMainThread(
  file: Blob,
  inspection: ImageHeaderInspection,
  signal?: AbortSignal,
): Promise<{
  source: DrawableImageSource;
  originalWidth: number;
  originalHeight: number;
  sourceWidth: number;
  sourceHeight: number;
  release: () => void;
}> {
  const knownW = inspection.orientedWidth;
  const knownH = inspection.orientedHeight;

  if (knownW !== null && knownH !== null && !validateClientSourceDimensions(knownW, knownH)) {
    throw new ClientImagePrepError('invalidFile');
  }

  if (typeof createImageBitmap === 'function') {
    if (
      knownW !== null &&
      knownH !== null &&
      !isSwappedOrientation(inspection.orientation) &&
      Math.max(knownW, knownH) > CLIENT_IMAGE_LIMITS.maxOutputDimension
    ) {
      const target = computeResizedDimensions(
        knownW,
        knownH,
        CLIENT_IMAGE_LIMITS.maxOutputDimension,
      );
      try {
        const resized = await createImageBitmap(file, {
          imageOrientation: 'from-image',
          resizeWidth: target.width,
          resizeHeight: target.height,
          resizeQuality: 'high',
        });
        if (
          resized.width >= CLIENT_IMAGE_LIMITS.minDimension &&
          resized.height >= CLIENT_IMAGE_LIMITS.minDimension
        ) {
          return {
            source: resized,
            originalWidth: knownW,
            originalHeight: knownH,
            sourceWidth: resized.width,
            sourceHeight: resized.height,
            release: () => resized.close(),
          };
        }
        resized.close();
      } catch {
        /* Fall back to standard createImageBitmap. */
      }
    }

    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const origW = knownW ?? bitmap.width;
      const origH = knownH ?? bitmap.height;
      if (!validateClientSourceDimensions(bitmap.width, bitmap.height)) {
        bitmap.close();
        throw new ClientImagePrepError('invalidFile');
      }
      return {
        source: bitmap,
        originalWidth: origW,
        originalHeight: origH,
        sourceWidth: bitmap.width,
        sourceHeight: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch (err) {
      if (err instanceof ClientImagePrepError) throw err;
      /* Fall back to HTMLImageElement below. */
    }
  }

  const htmlImg = await loadHtmlImage(file, signal);
  return {
    source: htmlImg.source,
    originalWidth: knownW ?? htmlImg.width,
    originalHeight: knownH ?? htmlImg.height,
    sourceWidth: htmlImg.width,
    sourceHeight: htmlImg.height,
    release: htmlImg.release,
  };
}

async function runOnMainThread(
  file: File,
  inspection: ImageHeaderInspection,
  options: PreparePhotoOptions,
): Promise<Omit<PreparedPhotoResult, 'originalBytes' | 'preparedBytes' | 'durationMs' | 'workerUsed'>> {
  const sourceFormat = inspection.format as ClientSourceFormat;

  if (sourceFormat === 'heic') {
    if (!options.forceHeicFallback) {
      try {
        const native = await decodeNativelyOnMainThread(file, inspection, options.signal);
        try {
          const encoded = await encodeImageAdaptively({
            source: native.source,
            sourceWidth: native.sourceWidth,
            sourceHeight: native.sourceHeight,
            hasAlpha: true,
            signal: options.signal,
          });
          return {
            blob: encoded.blob,
            mimeType: encoded.mimeType,
            sourceFormat: 'heic',
            originalWidth: native.originalWidth,
            originalHeight: native.originalHeight,
            width: encoded.width,
            height: encoded.height,
            passedThrough: false,
            heicFallbackUsed: false,
            qualityUsed: encoded.qualityUsed,
          };
        } finally {
          native.release();
        }
      } catch (err) {
        if (err instanceof ClientImagePrepError && err.code === 'cancelled') throw err;
        /* Native HEIC decoding unsupported; fall back to lazy WASM decoder. */
      }
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const decoded = await decodeHeicBytes(bytes, options.signal);
    const drawable = await createDrawableFromRgba(decoded.rgba, decoded.width, decoded.height);
    try {
      const encoded = await encodeImageAdaptively({
        source: drawable.source,
        sourceWidth: drawable.width,
        sourceHeight: drawable.height,
        hasAlpha: decoded.hasAlpha,
        signal: options.signal,
      });
      return {
        blob: encoded.blob,
        mimeType: encoded.mimeType,
        sourceFormat: 'heic',
        originalWidth: decoded.width,
        originalHeight: decoded.height,
        width: encoded.width,
        height: encoded.height,
        passedThrough: false,
        heicFallbackUsed: true,
        qualityUsed: encoded.qualityUsed,
      };
    } finally {
      drawable.release();
    }
  }

  const native = await decodeNativelyOnMainThread(file, inspection, options.signal);
  try {
    const encoded = await encodeImageAdaptively({
      source: native.source,
      sourceWidth: native.sourceWidth,
      sourceHeight: native.sourceHeight,
      hasAlpha: inspection.hasAlpha,
      signal: options.signal,
    });

    const resolvedInspection: ImageHeaderInspection = {
      ...inspection,
      orientedWidth: native.originalWidth,
      orientedHeight: native.originalHeight,
    };
    if (
      shouldPreferOriginalOverReencoded({
        inspection: resolvedInspection,
        originalBytes: file.size,
        encodedBytes: encoded.blob.size,
      })
    ) {
      return {
        blob: file,
        mimeType: formatToMime(sourceFormat),
        sourceFormat,
        originalWidth: native.originalWidth,
        originalHeight: native.originalHeight,
        width: native.originalWidth,
        height: native.originalHeight,
        passedThrough: true,
        heicFallbackUsed: false,
        qualityUsed: null,
      };
    }

    return {
      blob: encoded.blob,
      mimeType: encoded.mimeType,
      sourceFormat,
      originalWidth: native.originalWidth,
      originalHeight: native.originalHeight,
      width: encoded.width,
      height: encoded.height,
      passedThrough: false,
      heicFallbackUsed: false,
      qualityUsed: encoded.qualityUsed,
    };
  } finally {
    native.release();
  }
}

/**
 * Prepares a single user-selected photo for upload to Raketna's authoritative server Sharp pipeline.
 *
 * - Validates source file safety limits and magic bytes (JPEG, PNG, WebP, HEIC/HEIF).
 * - Skips client re-encoding for already-suitable upright JPEG/PNG/WebP originals.
 * - Uses a dedicated Web Worker + OffscreenCanvas + decode-time resize when available,
 *   with automatic main-thread fallback.
 * - Lazily loads the libheif-js WASM decoder only when native HEIC decoding is unavailable.
 * - Guarantees every returned Blob is <= 4,000,000 bytes and in a server-supported format.
 */
export async function preparePhotoForUpload(
  file: File,
  options: PreparePhotoOptions = {},
): Promise<PreparedPhotoResult> {
  const startedAt = nowMs();

  if (options.signal?.aborted) {
    throw new ClientImagePrepError('cancelled');
  }
  if (!file || file.size <= 0) {
    throw new ClientImagePrepError('invalidFile');
  }
  if (file.size > CLIENT_IMAGE_LIMITS.maxSourceBytes) {
    throw new ClientImagePrepError('sourceTooLarge');
  }

  const inspection = await sniffFileHeader(file);

  if (options.signal?.aborted) {
    throw new ClientImagePrepError('cancelled');
  }

  if (inspection.format === 'unknown' || inspection.format === 'gif' || inspection.isAnimated) {
    throw new ClientImagePrepError('invalidFile');
  }

  // Validate known header dimensions early before allocating any decode buffers.
  if (
    inspection.orientedWidth !== null &&
    inspection.orientedHeight !== null &&
    !validateClientSourceDimensions(inspection.orientedWidth, inspection.orientedHeight)
  ) {
    throw new ClientImagePrepError('invalidFile');
  }

  // Skip unnecessary client re-encoding for already-suitable upright JPEG/PNG/WebP originals.
  if (canPassthroughOriginal(inspection, file.size)) {
    return {
      blob: file,
      mimeType: formatToMime(inspection.format),
      sourceFormat: inspection.format,
      originalBytes: file.size,
      preparedBytes: file.size,
      originalWidth: inspection.orientedWidth,
      originalHeight: inspection.orientedHeight,
      width: inspection.orientedWidth,
      height: inspection.orientedHeight,
      durationMs: Math.round(nowMs() - startedAt),
      passedThrough: true,
      heicFallbackUsed: false,
      workerUsed: false,
      qualityUsed: null,
    };
  }

  // Try off-main-thread Worker first when supported, falling back cleanly to main thread.
  if (!options.forceMainThread && canUseDedicatedWorker()) {
    try {
      const result = await runInWorker(file, inspection, options);
      if (result.blob.size > CLIENT_IMAGE_LIMITS.hardMaxUploadBytes) {
        throw new ClientImagePrepError('payloadTooLarge');
      }
      return {
        ...result,
        originalBytes: file.size,
        preparedBytes: result.blob.size,
        durationMs: Math.round(nowMs() - startedAt),
        workerUsed: true,
      };
    } catch (error) {
      if (
        error instanceof ClientImagePrepError &&
        (error.code === 'cancelled' ||
          error.code === 'invalidFile' ||
          error.code === 'heicDecodeFailed' ||
          error.code === 'payloadTooLarge')
      ) {
        throw error;
      }
      /* Worker failed to start or crashed; fall back to main thread below. */
    }
  }

  try {
    const result = await runOnMainThread(file, inspection, options);
    if (result.blob.size > CLIENT_IMAGE_LIMITS.hardMaxUploadBytes) {
      throw new ClientImagePrepError('payloadTooLarge');
    }
    return {
      ...result,
      originalBytes: file.size,
      preparedBytes: result.blob.size,
      durationMs: Math.round(nowMs() - startedAt),
      workerUsed: false,
    };
  } catch (error) {
    if (error instanceof ClientImagePrepError && error.code === 'cancelled') {
      throw error;
    }
    // Section 5C fallback: if optimization fails due to browser Canvas/capability limitations
    // on an otherwise valid, server-supported JPEG/PNG/WebP within the 4 MB upload cap,
    // allow uploading the original directly through the authoritative server Sharp pipeline.
    if (
      error instanceof ClientImagePrepError &&
      error.code === 'unsupportedBrowser' &&
      canFallbackToOriginalOnPrepFailure(inspection, file.size) &&
      (inspection.format === 'jpeg' ||
        inspection.format === 'png' ||
        inspection.format === 'webp')
    ) {
      return {
        blob: file,
        mimeType: formatToMime(inspection.format),
        sourceFormat: inspection.format,
        originalBytes: file.size,
        preparedBytes: file.size,
        originalWidth: inspection.orientedWidth ?? 0,
        originalHeight: inspection.orientedHeight ?? 0,
        width: inspection.orientedWidth ?? 0,
        height: inspection.orientedHeight ?? 0,
        durationMs: Math.round(nowMs() - startedAt),
        passedThrough: true,
        heicFallbackUsed: false,
        workerUsed: false,
        qualityUsed: null,
      };
    }

    if (error instanceof ClientImagePrepError) {
      throw error;
    }
    throw new ClientImagePrepError(
      inspection.format === 'heic' ? 'heicDecodeFailed' : 'invalidFile',
    );
  }
}
