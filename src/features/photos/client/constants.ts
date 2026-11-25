import { PHOTO_LIMITS } from '../types';

export type ClientSourceFormat = 'jpeg' | 'png' | 'webp' | 'heic';
export type ClientOutputMime = 'image/webp' | 'image/jpeg' | 'image/png';

/**
 * Client-side preparation bounds and initial adaptive encoding parameters.
 *
 * Distinct from server storage limits:
 * - maxSourceBytes: accepts large modern camera originals (including 48 MP iPhone photos)
 *   so sellers are never blocked at the old 8 MiB server cap before browser preparation.
 * - maxDecodedPixels: bounds peak RGBA decode memory (~260 MB worst case at 65 MP) while
 *   supporting 48 MP iPhone (8064x6048) and 50–64 MP Android camera outputs.
 * - hardMaxUploadBytes: guarantees every outgoing upload stays safely below Vercel's
 *   standard 4.5 MB request-body limit without beta or paid overrides.
 */
export const CLIENT_IMAGE_LIMITS = {
  maxSourceBytes: 50 * 1024 * 1024,
  maxSourceDimension: 12_000,
  maxDecodedPixels: 65_000_000,
  minDimension: PHOTO_LIMITS.minDimension,
  serverMaxDimension: PHOTO_LIMITS.maxDimension,
  serverMaxPixels: PHOTO_LIMITS.maxPixels,
  serverFullBound: 1600,
  maxOutputDimension: 2000,
  targetMinBytes: 300_000,
  targetMaxBytes: 1_000_000,
  passthroughMaxBytes: 1_000_000,
  hardMaxUploadBytes: 4_000_000,
  initialQuality: 0.9,
  qualitySteps: [0.9, 0.84, 0.78, 0.72] as const,
  downscaleDimensionSteps: [1800, 1600] as const,
  downscaleQualitySteps: [0.82, 0.76, 0.7] as const,
  emergencyDimensionSteps: [1400, 1200] as const,
  emergencyQualitySteps: [0.76, 0.68, 0.6] as const,
  preferredOutputMime: 'image/webp' as const,
  fallbackOutputMime: 'image/jpeg' as const,
  acceptAttribute: 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif',
} as const;

export type ClientImagePrepErrorCode =
  | 'sourceTooLarge'
  | 'invalidFile'
  | 'heicDecodeFailed'
  | 'payloadTooLarge'
  | 'cancelled'
  | 'unsupportedBrowser';

export class ClientImagePrepError extends Error {
  constructor(
    public readonly code: ClientImagePrepErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'ClientImagePrepError';
  }
}

export type PreparedPhotoResult = {
  blob: Blob;
  mimeType: ClientOutputMime;
  sourceFormat: ClientSourceFormat;
  originalBytes: number;
  preparedBytes: number;
  originalWidth: number;
  originalHeight: number;
  width: number;
  height: number;
  durationMs: number;
  passedThrough: boolean;
  heicFallbackUsed: boolean;
  workerUsed: boolean;
  qualityUsed: number | null;
};
