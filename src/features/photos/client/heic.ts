import type { LibheifBundle, LibheifImage } from 'libheif-js/wasm-bundle.js';
import { ClientImagePrepError } from './constants';
import { validateClientSourceDimensions } from './format';

export type DecodedHeicPixels = {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  hasAlpha: boolean;
};

/**
 * Unmodified upstream libheif-js ES module served separately from app bundles for
 * lazy on-demand loading and LGPL-3.0 §4(d)(1) standalone library replaceability.
 * See /licenses/libheif-js-NOTICE.txt and /licenses/libheif-js-LICENSE.txt.
 */
export const HEIC_DECODER_PUBLIC_URL = '/vendor/libheif/libheif-bundle.mjs';

let libheifPromise: Promise<LibheifBundle> | null = null;

function resolveBrowserDecoderUrl(): string | null {
  if (
    typeof self !== 'undefined' &&
    typeof self.location?.origin === 'string' &&
    self.location.origin !== 'null' &&
    /^https?:\/\//i.test(self.location.origin)
  ) {
    return new URL(HEIC_DECODER_PUBLIC_URL, self.location.origin).href;
  }
  return null;
}

async function importStandaloneLibheif(): Promise<unknown> {
  const browserUrl = resolveBrowserDecoderUrl();
  if (browserUrl) {
    // Dynamic runtime ES module import outside Webpack bundling.
    return import(/* webpackIgnore: true */ browserUrl);
  }
  // Node.js unit test fallback (never bundled by Webpack).
  const nodeModuleId = 'libheif-js/wasm-bundle.js';
  return import(/* webpackIgnore: true */ nodeModuleId);
}

async function loadLibheif(): Promise<LibheifBundle> {
  if (!libheifPromise) {
    libheifPromise = importStandaloneLibheif()
      .then((mod) => {
        const record = mod as { default?: unknown };
        const resolved = (record.default ?? mod) as unknown as
          | LibheifBundle
          | (() => LibheifBundle);
        const bundle = typeof resolved === 'function' ? resolved() : resolved;
        if (!bundle || typeof bundle.HeifDecoder !== 'function') {
          throw new Error('HEIF decoder module did not expose HeifDecoder');
        }
        return bundle;
      })
      .catch((error) => {
        libheifPromise = null;
        throw error;
      });
  }
  return libheifPromise;
}

/**
 * Lazily loads the unmodified standalone libheif-js WASM decoder (compiled with libde265
 * for real HEVC HEIC support) and decodes the primary still image into an RGBA buffer.
 *
 * Enforces decoded pixel safety bounds BEFORE allocating RGBA memory and always frees
 * libheif WASM handles in `finally` to avoid heap leaks across multi-photo batches.
 */
export async function decodeHeicBytes(
  bytes: Uint8Array,
  signal?: AbortSignal,
): Promise<DecodedHeicPixels> {
  if (signal?.aborted) {
    throw new ClientImagePrepError('cancelled');
  }

  let libheif: LibheifBundle;
  try {
    libheif = await loadLibheif();
  } catch {
    throw new ClientImagePrepError('heicDecodeFailed', 'Could not load HEIC decoder.');
  }

  if (signal?.aborted) {
    throw new ClientImagePrepError('cancelled');
  }

  let images: LibheifImage[] = [];
  try {
    const decoder = new libheif.HeifDecoder();
    images = decoder.decode(bytes);
  } catch {
    throw new ClientImagePrepError('heicDecodeFailed', 'Could not parse HEIC file.');
  }

  if (!Array.isArray(images) || images.length === 0) {
    throw new ClientImagePrepError('heicDecodeFailed', 'No image found in HEIC file.');
  }

  try {
    const primary =
      images.find((img) => {
        try {
          return img.is_primary();
        } catch {
          return false;
        }
      }) ?? images[0];

    const width = primary.get_width();
    const height = primary.get_height();
    if (!validateClientSourceDimensions(width, height)) {
      throw new ClientImagePrepError('invalidFile', 'HEIC dimensions out of bounds.');
    }

    if (signal?.aborted) {
      throw new ClientImagePrepError('cancelled');
    }

    const hasAlpha =
      typeof primary.has_alpha_channel === 'function'
        ? Boolean(primary.has_alpha_channel())
        : false;

    const rgba = new Uint8ClampedArray(width * height * 4);
    await new Promise<void>((resolve, reject) => {
      primary.display({ data: rgba, width, height }, (displayData) => {
        if (!displayData) {
          reject(new ClientImagePrepError('heicDecodeFailed', 'HEIC pixel decode failed.'));
          return;
        }
        resolve();
      });
    });

    if (signal?.aborted) {
      throw new ClientImagePrepError('cancelled');
    }

    return { width, height, rgba, hasAlpha };
  } finally {
    for (const img of images) {
      try {
        img.free();
      } catch {
        /* Best-effort WASM cleanup. */
      }
    }
  }
}
