import { MAX_LISTING_PHOTOS, MIN_LISTING_PHOTOS } from '@/lib/domain/equipment';

export const PHOTO_VARIANTS = ['thumb', 'card', 'full'] as const;
export type PhotoVariant = (typeof PHOTO_VARIANTS)[number];

export const PHOTO_ALLOWED_FORMATS = ['jpeg', 'png', 'webp'] as const;
export type PhotoInputFormat = (typeof PHOTO_ALLOWED_FORMATS)[number];

export const PHOTO_LIMITS = {
  bucket: 'media-private',
  /** Hard incoming request body cap aligned safely below Vercel's standard 4.5 MB limit. */
  maxUploadBytes: 4_000_000,
  /** Maximum combined/individual stored WebP bytes matching DB constraint & media-private bucket. */
  maxStoredBytes: 8 * 1024 * 1024,
  /** Alias preserved for upload payload validation compatibility. */
  maxBytes: 4_000_000,
  minPerListing: MIN_LISTING_PHOTOS,
  maxPerListing: MAX_LISTING_PHOTOS,
  minDimension: 64,
  maxDimension: 8000,
  maxPixels: 25_000_000,
  maxConcurrent: 2,
  streamTimeoutMs: 30_000,
  storageTimeoutMs: 15_000,
  sharpTimeoutSeconds: 10,
  webpQuality: 80,
  variantBounds: [
    ['thumb', 320],
    ['card', 800],
    ['full', 1600],
  ] as const,
} as const;

export type PhotoVariantEntry = {
  key: string;
  bytes: number;
  sha256: string;
};

export type PhotoManifest = Record<PhotoVariant, PhotoVariantEntry>;

export const PHOTO_CLIENT_ERROR_CODES = [
  'invalidFile',
  'tooLarge',
  'payloadTooLarge',
  'sourceTooLarge',
  'heicDecodeFailed',
  'conflict',
  'photoLimit',
  'rateLimited',
  'signin',
  'notAllowed',
  'notFound',
] as const;

export type PhotoErrorCode =
  | (typeof PHOTO_CLIENT_ERROR_CODES)[number]
  | 'rangeUnsupported'
  | 'unavailable';

export type PhotoUploadReceipt = {
  id: string;
  version: number;
  expected_version: number;
  replace_photo_id: string | null;
};

export type PhotoReconcileResponse = {
  id: string;
  status: string;
  version: number;
  media_ids: string[];
  matchedUpload: PhotoUploadReceipt | null;
};
