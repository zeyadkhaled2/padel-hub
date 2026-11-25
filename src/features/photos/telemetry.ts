import type { PhotoVariant } from './types';

export type ClientTelemetryHints = {
  originalBytes: number | null;
  prepMs: number | null;
  heicFallbackUsed: boolean;
  sourceFormat: 'jpeg' | 'png' | 'webp' | 'heic' | 'unknown';
};

export type UploadFailureCategory =
  | 'none'
  | 'auth'
  | 'origin'
  | 'validation'
  | 'payload_too_large'
  | 'conflict'
  | 'photo_limit'
  | 'rate_limit'
  | 'busy'
  | 'storage'
  | 'database'
  | 'processing';

export type PhotoUploadTelemetryEvent = {
  event: 'media.upload';
  outcome: 'saved' | 'idempotent_replay' | 'rejected' | 'error';
  failureCategory: UploadFailureCategory;
  httpStatus: number;
  incomingBytes: number;
  storedBytes: number | null;
  thumbBytes: number | null;
  cardBytes: number | null;
  fullBytes: number | null;
  readMs: number;
  sharpMs: number;
  storageMs: number;
  dbMs: number;
  totalMs: number;
  isReplacement: boolean;
  clientOriginalBytes: number | null;
  clientPrepMs: number | null;
  clientHeicFallback: boolean;
  clientSourceFormat: ClientTelemetryHints['sourceFormat'];
};

export type PhotoDeliveryTelemetryEvent = {
  event: 'media.delivery';
  accessPath: 'public_anonymous' | 'owner_authenticated' | 'admin_review' | 'denied' | 'error';
  variant: PhotoVariant | 'invalid';
  httpStatus: number;
  conditionalMatch: boolean;
  storageDownloaded: boolean;
  authChecked: boolean;
  authRpcCount: number;
  responseBytes: number;
  totalMs: number;
};

const ALLOWED_SOURCE_FORMATS = new Set(['jpeg', 'png', 'webp', 'heic']);

function parseBoundedIntHeader(raw: string | null, min: number, max: number): number | null {
  if (!raw || !/^\d+$/.test(raw.trim())) return null;
  const parsed = Number(raw.trim());
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

/**
 * Extracts strictly bounded, non-PII numeric/enum telemetry hints from request headers.
 * Never trusted for authorization, format validation, or quota enforcement.
 */
export function parseClientTelemetryHints(headers: Pick<Headers, 'get'>): ClientTelemetryHints {
  const rawFormat = headers.get('x-client-source-format')?.trim().toLowerCase() ?? '';
  return {
    originalBytes: parseBoundedIntHeader(headers.get('x-client-original-bytes'), 1, 200_000_000),
    prepMs: parseBoundedIntHeader(headers.get('x-client-prep-ms'), 0, 300_000),
    heicFallbackUsed: headers.get('x-client-heic-fallback') === '1',
    sourceFormat: ALLOWED_SOURCE_FORMATS.has(rawFormat)
      ? (rawFormat as ClientTelemetryHints['sourceFormat'])
      : 'unknown',
  };
}

function shouldEmitMediaTelemetry(): boolean {
  return process.env.NODE_ENV !== 'test' && process.env.PADELHUB_SILENCE_MEDIA_TELEMETRY !== '1';
}

/**
 * Emits a privacy-safe structured JSON telemetry record.
 * Strictly contains numeric/enum operational measurements only — zero raw bytes,
 * filenames, EXIF, storage keys, tokens, signed URLs, or personal identifiers.
 */
export function recordPhotoUploadMetric(metric: PhotoUploadTelemetryEvent): void {
  if (!shouldEmitMediaTelemetry()) return;
  console.info(JSON.stringify(metric));
}

export function recordPhotoDeliveryMetric(metric: PhotoDeliveryTelemetryEvent): void {
  if (!shouldEmitMediaTelemetry()) return;
  console.info(JSON.stringify(metric));
}
