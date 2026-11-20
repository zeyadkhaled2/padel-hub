import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import sharp, { type Metadata } from 'sharp';
import {
  PHOTO_LIMITS,
  type PhotoErrorCode,
  type PhotoManifest,
} from './types';
import { validateSourceImageMetadata } from './validation';

export class PhotoProcessingError extends Error {
  constructor(
    public readonly code: PhotoErrorCode,
    public readonly status: number,
  ) {
    super(code);
  }
}

export type ProcessedPhotoOutput = {
  assetId: string;
  attemptId: string;
  inputMime: string;
  width: number;
  height: number;
  storedBytes: number;
  fullHash: string;
  manifest: PhotoManifest;
  variants: { key: string; bytes: Buffer }[];
};

export function sha256Hex(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function readBoundedBody(
  stream: ReadableStream<Uint8Array> | null,
  maxBytes = PHOTO_LIMITS.maxBytes,
  timeoutMs = PHOTO_LIMITS.streamTimeoutMs,
): Promise<Buffer> {
  if (!stream) {
    throw new PhotoProcessingError('invalidFile', 400);
  }

  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void reader.cancel();
  }, timeoutMs);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        if (timedOut) {
          throw new PhotoProcessingError('unavailable', 503);
        }
        break;
      }
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new PhotoProcessingError('tooLarge', 413);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }

  return Buffer.concat(chunks);
}

export async function processListingPhoto(bytes: Buffer): Promise<ProcessedPhotoOutput> {
  let metadata: Metadata;
  try {
    metadata = await sharp(bytes, {
      limitInputPixels: PHOTO_LIMITS.maxPixels,
      failOn: 'warning',
    }).metadata();
  } catch {
    throw new PhotoProcessingError('invalidFile', 400);
  }

  const validMeta = validateSourceImageMetadata(metadata);
  if (!validMeta.ok) {
    throw new PhotoProcessingError('invalidFile', 400);
  }

  const assetId = randomUUID();
  const attemptId = randomUUID();
  const manifest = {} as PhotoManifest;
  const variants: { key: string; bytes: Buffer }[] = [];
  let width = 0;
  let height = 0;

  for (const [variant, size] of PHOTO_LIMITS.variantBounds) {
    // Default sharp output strips metadata. Never preserve originals/EXIF.
    const { data, info } = await sharp(bytes, {
      limitInputPixels: PHOTO_LIMITS.maxPixels,
      failOn: 'warning',
    })
      .rotate()
      .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: PHOTO_LIMITS.webpQuality })
      .timeout({ seconds: PHOTO_LIMITS.sharpTimeoutSeconds })
      .toBuffer({ resolveWithObject: true });

    if (variant === 'full') {
      width = info.width;
      height = info.height;
    }

    const key = `processed/${assetId}/${attemptId}/${variant}.webp`;
    manifest[variant] = { key, bytes: data.length, sha256: sha256Hex(data) };
    variants.push({ key, bytes: data });
  }

  const storedBytes = variants.reduce((sum, item) => sum + item.bytes.length, 0);
  if (width < PHOTO_LIMITS.minDimension || height < PHOTO_LIMITS.minDimension) {
    throw new PhotoProcessingError('invalidFile', 400);
  }
  if (storedBytes > PHOTO_LIMITS.maxBytes) {
    throw new PhotoProcessingError('tooLarge', 413);
  }

  return {
    assetId,
    attemptId,
    inputMime: `image/${validMeta.format}`,
    width,
    height,
    storedBytes,
    fullHash: manifest.full.sha256,
    manifest,
    variants,
  };
}
