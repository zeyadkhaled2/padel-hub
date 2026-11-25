import { MAX_LISTING_PHOTOS, MIN_LISTING_PHOTOS } from '@/lib/domain/equipment';

export const PHOTO_VARIANTS = ['thumb', 'card', 'full'] as const;
export type PhotoVariant = (typeof PHOTO_VARIANTS)[number];

export const PHOTO_ALLOWED_FORMATS = ['jpeg', 'png', 'webp'] as const;
export type PhotoInputFormat = (typeof PHOTO_ALLOWED_FORMATS)[number];

export const PHOTO_LIMITS = {
  bucket: 'media-private',
  maxBytes: 8 * 1024 * 1024,
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
