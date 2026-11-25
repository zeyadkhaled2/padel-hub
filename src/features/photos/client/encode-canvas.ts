import {
  CLIENT_IMAGE_LIMITS,
  ClientImagePrepError,
  type ClientOutputMime,
} from './constants';
import { computeResizedDimensions } from './format';

export type DrawableImageSource = ImageBitmap | HTMLImageElement | HTMLCanvasElement | OffscreenCanvas;

type CanvasAdapter = {
  width: number;
  height: number;
  getContext2d(): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  encode(mimeType: 'image/webp' | 'image/jpeg', quality: number): Promise<Blob | null>;
  release(): void;
};

let cachedWebpEncodeSupport: Promise<boolean> | null = null;

function createCanvasAdapter(width: number, height: number): CanvasAdapter {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    return {
      get width() {
        return canvas.width;
      },
      set width(value: number) {
        canvas.width = value;
      },
      get height() {
        return canvas.height;
      },
      set height(value: number) {
        canvas.height = value;
      },
      getContext2d() {
        return canvas.getContext('2d', { alpha: true });
      },
      async encode(mimeType, quality) {
        try {
          return await canvas.convertToBlob({ type: mimeType, quality });
        } catch {
          return null;
        }
      },
      release() {
        canvas.width = 0;
        canvas.height = 0;
      },
    };
  }

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return {
      get width() {
        return canvas.width;
      },
      set width(value: number) {
        canvas.width = value;
      },
      get height() {
        return canvas.height;
      },
      set height(value: number) {
        canvas.height = value;
      },
      getContext2d() {
        return canvas.getContext('2d', { alpha: true });
      },
      encode(mimeType, quality) {
        return new Promise((resolve) => {
          try {
            canvas.toBlob((blob) => resolve(blob), mimeType, quality);
          } catch {
            resolve(null);
          }
        });
      },
      release() {
        canvas.width = 0;
        canvas.height = 0;
      },
    };
  }

  throw new ClientImagePrepError('unsupportedBrowser', 'No canvas API available.');
}

/**
 * Verifies actual browser WebP encoding support by encoding a tiny 2x2 canvas and checking
 * the resulting Blob's MIME type (browsers lacking WebP encoding silently emit image/png).
 */
export async function supportsWebpEncoding(): Promise<boolean> {
  if (!cachedWebpEncodeSupport) {
    cachedWebpEncodeSupport = (async () => {
      let adapter: CanvasAdapter | null = null;
      try {
        adapter = createCanvasAdapter(2, 2);
        const ctx = adapter.getContext2d();
        if (!ctx) return false;
        ctx.fillStyle = '#14533c';
        ctx.fillRect(0, 0, 2, 2);
        const blob = await adapter.encode('image/webp', 0.8);
        return Boolean(blob && blob.size > 0 && blob.type === 'image/webp');
      } catch {
        return false;
      } finally {
        adapter?.release();
      }
    })();
  }
  return cachedWebpEncodeSupport;
}

function drawSourceToCanvas(
  adapter: CanvasAdapter,
  source: DrawableImageSource,
  targetWidth: number,
  targetHeight: number,
  targetMime: 'image/webp' | 'image/jpeg',
  hasAlpha: boolean,
): void {
  adapter.width = targetWidth;
  adapter.height = targetHeight;
  const ctx = adapter.getContext2d();
  if (!ctx) {
    throw new ClientImagePrepError('unsupportedBrowser', 'Could not obtain 2D canvas context.');
  }

  if (targetMime === 'image/jpeg' && hasAlpha) {
    // Composite transparent PNG/WebP/HEIC onto white before JPEG encoding to prevent black fill.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
  } else {
    ctx.clearRect(0, 0, targetWidth, targetHeight);
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, targetWidth, targetHeight);
}

export type AdaptiveEncodeOutput = {
  blob: Blob;
  mimeType: ClientOutputMime;
  width: number;
  height: number;
  qualityUsed: number;
};

/**
 * Adaptively resizes and compresses a decoded image source using the approved quality/dimension
 * ladder:
 * - Starts at max 2000 px (never enlarging) and quality 0.90 in WebP (or JPEG fallback).
 * - Stops immediately once within targetMaxBytes (1 MB) without forcing below 300 KB.
 * - Gradually lowers quality, then moderately lowers dimensions only if still above target/cap.
 * - Guarantees final Blob size <= 4,000,000 bytes and verified MIME type.
 */
export async function encodeImageAdaptively(params: {
  source: DrawableImageSource;
  sourceWidth: number;
  sourceHeight: number;
  hasAlpha: boolean;
  signal?: AbortSignal;
}): Promise<AdaptiveEncodeOutput> {
  const { source, sourceWidth, sourceHeight, hasAlpha, signal } = params;
  if (signal?.aborted) {
    throw new ClientImagePrepError('cancelled');
  }

  const webpOk = await supportsWebpEncoding();
  const preferredMime: 'image/webp' | 'image/jpeg' = webpOk
    ? CLIENT_IMAGE_LIMITS.preferredOutputMime
    : CLIENT_IMAGE_LIMITS.fallbackOutputMime;

  const initialDims = computeResizedDimensions(
    sourceWidth,
    sourceHeight,
    CLIENT_IMAGE_LIMITS.maxOutputDimension,
  );

  let adapter: CanvasAdapter | null = null;
  try {
    adapter = createCanvasAdapter(initialDims.width, initialDims.height);
    let currentWidth = 0;
    let currentHeight = 0;
    let currentMime: 'image/webp' | 'image/jpeg' = preferredMime;
    let bestUnderHardCap: AdaptiveEncodeOutput | null = null;

    const tryEncode = async (
      maxEdge: number,
      qualities: readonly number[],
      stopAtTarget: boolean,
    ): Promise<AdaptiveEncodeOutput | null> => {
      const dims = computeResizedDimensions(sourceWidth, sourceHeight, maxEdge);
      if (
        dims.width < CLIENT_IMAGE_LIMITS.minDimension ||
        dims.height < CLIENT_IMAGE_LIMITS.minDimension
      ) {
        return null;
      }

      const encodeAtMime = async (mime: 'image/webp' | 'image/jpeg') => {
        if (currentWidth !== dims.width || currentHeight !== dims.height || currentMime !== mime) {
          drawSourceToCanvas(adapter!, source, dims.width, dims.height, mime, hasAlpha);
          currentWidth = dims.width;
          currentHeight = dims.height;
          currentMime = mime;
        }

        for (const quality of qualities) {
          if (signal?.aborted) {
            throw new ClientImagePrepError('cancelled');
          }
          const blob = await adapter!.encode(mime, quality);
          if (!blob || blob.size === 0 || blob.type !== mime) {
            // Encoder failed or silently fell back to an unexpected MIME (e.g., PNG).
            return 'unsupported_mime' as const;
          }

          const candidate: AdaptiveEncodeOutput = {
            blob,
            mimeType: mime,
            width: dims.width,
            height: dims.height,
            qualityUsed: quality,
          };

          if (blob.size <= CLIENT_IMAGE_LIMITS.hardMaxUploadBytes) {
            if (!bestUnderHardCap || blob.size < bestUnderHardCap.blob.size) {
              bestUnderHardCap = candidate;
            }
          }

          const threshold = stopAtTarget
            ? CLIENT_IMAGE_LIMITS.targetMaxBytes
            : CLIENT_IMAGE_LIMITS.hardMaxUploadBytes;
          if (blob.size <= threshold) {
            return candidate;
          }
        }
        return null;
      };

      const firstAttempt = await encodeAtMime(preferredMime);
      if (firstAttempt === 'unsupported_mime' && preferredMime === 'image/webp') {
        const jpegAttempt = await encodeAtMime('image/jpeg');
        return jpegAttempt === 'unsupported_mime' ? null : jpegAttempt;
      }
      return firstAttempt === 'unsupported_mime' ? null : firstAttempt;
    };

    // Pass 1: Max 2000 px, gentle high-quality ladder (0.90 -> 0.84 -> 0.78 -> 0.72).
    const pass1 = await tryEncode(
      CLIENT_IMAGE_LIMITS.maxOutputDimension,
      CLIENT_IMAGE_LIMITS.qualitySteps,
      true,
    );
    if (pass1) return pass1;

    // Pass 2: Moderate dimension reduction (1800 -> 1600 px) while staying >= server full bound.
    for (const edge of CLIENT_IMAGE_LIMITS.downscaleDimensionSteps) {
      const pass2 = await tryEncode(edge, CLIENT_IMAGE_LIMITS.downscaleQualitySteps, true);
      if (pass2) return pass2;
    }

    // If we already have a high-detail candidate safely within the 4 MB hard payload cap,
    // prefer keeping detail over aggressive downscaling.
    if (bestUnderHardCap) {
      return bestUnderHardCap;
    }

    // Pass 3: Emergency cap-only reduction if image is still > 4,000,000 bytes.
    for (const edge of CLIENT_IMAGE_LIMITS.emergencyDimensionSteps) {
      const pass3 = await tryEncode(edge, CLIENT_IMAGE_LIMITS.emergencyQualitySteps, false);
      if (pass3) return pass3;
    }

    if (bestUnderHardCap) {
      return bestUnderHardCap;
    }

    throw new ClientImagePrepError(
      'payloadTooLarge',
      'Prepared image exceeds the 4,000,000 byte upload limit.',
    );
  } finally {
    adapter?.release();
  }
}

/**
 * Converts decoded RGBA pixels (e.g., from libheif-js) into a drawable ImageBitmap (using
 * decode-time resize when supported) or Canvas without keeping duplicate full-res buffers.
 */
export async function createDrawableFromRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  maxLongestEdge = CLIENT_IMAGE_LIMITS.maxOutputDimension,
): Promise<{ source: DrawableImageSource; width: number; height: number; release: () => void }> {
  const safeRgba = new Uint8ClampedArray(rgba);
  const imageData = new ImageData(safeRgba, width, height);
  const target = computeResizedDimensions(width, height, maxLongestEdge);

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap =
        target.width < width || target.height < height
          ? await createImageBitmap(imageData, {
              resizeWidth: target.width,
              resizeHeight: target.height,
              resizeQuality: 'high',
            })
          : await createImageBitmap(imageData);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Fall through to canvas path if resize options are unsupported.
      try {
        const bitmap = await createImageBitmap(imageData);
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          release: () => bitmap.close(),
        };
      } catch {
        /* Fall through to 2D canvas putImageData. */
      }
    }
  }

  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new ClientImagePrepError('unsupportedBrowser');
    ctx.putImageData(imageData, 0, 0);
    return {
      source: canvas,
      width,
      height,
      release: () => {
        canvas.width = 0;
        canvas.height = 0;
      },
    };
  }

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new ClientImagePrepError('unsupportedBrowser');
    ctx.putImageData(imageData, 0, 0);
    return {
      source: canvas,
      width,
      height,
      release: () => {
        canvas.width = 0;
        canvas.height = 0;
      },
    };
  }

  throw new ClientImagePrepError('unsupportedBrowser');
}
