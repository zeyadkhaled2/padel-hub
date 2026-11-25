/// <reference lib="webworker" />

import {
  CLIENT_IMAGE_LIMITS,
  ClientImagePrepError,
  type ClientImagePrepErrorCode,
  type ClientOutputMime,
  type ClientSourceFormat,
} from './constants';
import { createDrawableFromRgba, encodeImageAdaptively } from './encode-canvas';
import {
  computeResizedDimensions,
  formatToMime,
  isSwappedOrientation,
  shouldPreferOriginalOverReencoded,
  validateClientSourceDimensions,
  type ImageHeaderInspection,
} from './format';
import { decodeHeicBytes } from './heic';

export type WorkerPrepRequest = {
  id: number;
  file: Blob;
  inspection: ImageHeaderInspection;
  forceHeicFallback?: boolean;
};

export type WorkerPrepResponse =
  | {
      id: number;
      ok: true;
      blob: Blob;
      mimeType: ClientOutputMime;
      sourceFormat: ClientSourceFormat;
      originalWidth: number;
      originalHeight: number;
      width: number;
      height: number;
      passedThrough: boolean;
      heicFallbackUsed: boolean;
      qualityUsed: number | null;
    }
  | {
      id: number;
      ok: false;
      code: ClientImagePrepErrorCode;
    };

async function decodeWithImageBitmap(
  file: Blob,
  inspection: ImageHeaderInspection,
): Promise<{
  bitmap: ImageBitmap;
  originalWidth: number;
  originalHeight: number;
}> {
  const knownW = inspection.orientedWidth;
  const knownH = inspection.orientedHeight;

  if (knownW !== null && knownH !== null && !validateClientSourceDimensions(knownW, knownH)) {
    throw new ClientImagePrepError('invalidFile');
  }

  // Use decode-time resizing for upright images larger than 2000 px to keep peak mobile RAM low
  // (critical for 48 MP iPhone photos, avoiding full ~192 MB RGBA decode when supported).
  if (
    knownW !== null &&
    knownH !== null &&
    !isSwappedOrientation(inspection.orientation) &&
    Math.max(knownW, knownH) > CLIENT_IMAGE_LIMITS.maxOutputDimension
  ) {
    const target = computeResizedDimensions(knownW, knownH, CLIENT_IMAGE_LIMITS.maxOutputDimension);
    try {
      const resized = await createImageBitmap(file, {
        imageOrientation: 'from-image',
        resizeWidth: target.width,
        resizeHeight: target.height,
        resizeQuality: 'high',
      });
      if (resized.width >= CLIENT_IMAGE_LIMITS.minDimension && resized.height >= CLIENT_IMAGE_LIMITS.minDimension) {
        return { bitmap: resized, originalWidth: knownW, originalHeight: knownH };
      }
      resized.close();
    } catch {
      /* Fall back to standard createImageBitmap below. */
    }
  }

  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const originalWidth = knownW ?? bitmap.width;
  const originalHeight = knownH ?? bitmap.height;
  if (!validateClientSourceDimensions(bitmap.width, bitmap.height)) {
    bitmap.close();
    throw new ClientImagePrepError('invalidFile');
  }

  return { bitmap, originalWidth, originalHeight };
}

self.onmessage = async (event: MessageEvent<WorkerPrepRequest>) => {
  const { id, file, inspection, forceHeicFallback } = event.data;
  const sourceFormat = inspection.format as ClientSourceFormat;

  try {
    let heicFallbackUsed = false;

    if (sourceFormat === 'heic') {
      // Try native browser HEIC decoding first (Safari / iOS Safari), avoiding WASM download.
      let nativeBitmap: ImageBitmap | null = null;
      if (!forceHeicFallback) {
        try {
          const decoded = await createImageBitmap(file, { imageOrientation: 'from-image' });
          if (validateClientSourceDimensions(decoded.width, decoded.height)) {
            nativeBitmap = decoded;
          } else {
            decoded.close();
            throw new ClientImagePrepError('invalidFile');
          }
        } catch (err) {
          if (err instanceof ClientImagePrepError) throw err;
          nativeBitmap = null;
        }
      }

      if (nativeBitmap) {
        try {
          const encoded = await encodeImageAdaptively({
            source: nativeBitmap,
            sourceWidth: nativeBitmap.width,
            sourceHeight: nativeBitmap.height,
            hasAlpha: true,
          });
          const reply: WorkerPrepResponse = {
            id,
            ok: true,
            blob: encoded.blob,
            mimeType: encoded.mimeType,
            sourceFormat: 'heic',
            originalWidth: nativeBitmap.width,
            originalHeight: nativeBitmap.height,
            width: encoded.width,
            height: encoded.height,
            passedThrough: false,
            heicFallbackUsed: false,
            qualityUsed: encoded.qualityUsed,
          };
          self.postMessage(reply);
          return;
        } finally {
          nativeBitmap.close();
        }
      }

      // Lazy WASM HEIC/HEVC fallback.
      heicFallbackUsed = true;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const decoded = await decodeHeicBytes(bytes);
      const drawable = await createDrawableFromRgba(decoded.rgba, decoded.width, decoded.height);
      try {
        const encoded = await encodeImageAdaptively({
          source: drawable.source,
          sourceWidth: drawable.width,
          sourceHeight: drawable.height,
          hasAlpha: decoded.hasAlpha,
        });
        const reply: WorkerPrepResponse = {
          id,
          ok: true,
          blob: encoded.blob,
          mimeType: encoded.mimeType,
          sourceFormat: 'heic',
          originalWidth: decoded.width,
          originalHeight: decoded.height,
          width: encoded.width,
          height: encoded.height,
          passedThrough: false,
          heicFallbackUsed,
          qualityUsed: encoded.qualityUsed,
        };
        self.postMessage(reply);
        return;
      } finally {
        drawable.release();
      }
    }

    // Standard JPEG / PNG / WebP path.
    const { bitmap, originalWidth, originalHeight } = await decodeWithImageBitmap(file, inspection);
    try {
      const encoded = await encodeImageAdaptively({
        source: bitmap,
        sourceWidth: bitmap.width,
        sourceHeight: bitmap.height,
        hasAlpha: inspection.hasAlpha,
      });

      const resolvedInspection: ImageHeaderInspection = {
        ...inspection,
        orientedWidth: originalWidth,
        orientedHeight: originalHeight,
      };
      if (
        shouldPreferOriginalOverReencoded({
          inspection: resolvedInspection,
          originalBytes: file.size,
          encodedBytes: encoded.blob.size,
        })
      ) {
        const reply: WorkerPrepResponse = {
          id,
          ok: true,
          blob: file,
          mimeType: formatToMime(sourceFormat),
          sourceFormat,
          originalWidth,
          originalHeight,
          width: originalWidth,
          height: originalHeight,
          passedThrough: true,
          heicFallbackUsed: false,
          qualityUsed: null,
        };
        self.postMessage(reply);
        return;
      }

      const reply: WorkerPrepResponse = {
        id,
        ok: true,
        blob: encoded.blob,
        mimeType: encoded.mimeType,
        sourceFormat,
        originalWidth,
        originalHeight,
        width: encoded.width,
        height: encoded.height,
        passedThrough: false,
        heicFallbackUsed: false,
        qualityUsed: encoded.qualityUsed,
      };
      self.postMessage(reply);
    } finally {
      bitmap.close();
    }
  } catch (error) {
    const code: ClientImagePrepErrorCode =
      error instanceof ClientImagePrepError ? error.code : 'invalidFile';
    const reply: WorkerPrepResponse = { id, ok: false, code };
    self.postMessage(reply);
  }
};
