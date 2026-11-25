import { z } from 'zod';
import { isListingEditable, type ListingStatus } from '@/lib/domain/equipment';
import { classifyRpcError, type RpcErrorLike } from '@/lib/errors/domain';
import { uuidSchema } from '@/lib/validation/shared';
import { parseClientTelemetryHints, type ClientTelemetryHints } from './telemetry';
import {
  PHOTO_ALLOWED_FORMATS,
  PHOTO_LIMITS,
  PHOTO_VARIANTS,
  type PhotoErrorCode,
  type PhotoInputFormat,
  type PhotoManifest,
  type PhotoUploadReceipt,
  type PhotoVariant,
} from './types';

export const photoVariantSchema = z.enum(PHOTO_VARIANTS);

export const photoVariantEntrySchema = z.object({
  key: z.string().regex(/^[A-Za-z0-9/_-]+\.webp$/),
  bytes: z.number().int().min(1).max(PHOTO_LIMITS.maxStoredBytes),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export const photoManifestSchema = z.object({
  thumb: photoVariantEntrySchema,
  card: photoVariantEntrySchema,
  full: photoVariantEntrySchema,
});

export const photoUploadReceiptSchema = z.object({
  id: uuidSchema,
  version: z.number().int().min(2),
  expected_version: z.number().int().min(1),
  replace_photo_id: uuidSchema.nullable(),
});

export type PhotoFailure = {
  ok: false;
  code: PhotoErrorCode;
  status: number;
};

export type ParsedUploadRequest =
  | {
      ok: true;
      listingId: string;
      version: number;
      replacePhotoId: string | null;
      uploadKey: string | null;
      clientHints: ClientTelemetryHints;
    }
  | PhotoFailure;

export type ParsedReconcileRequest =
  | {
      ok: true;
      listingId: string;
      uploadKey: string | null;
    }
  | PhotoFailure;

export type ParsedDeliveryRequest =
  | {
      ok: true;
      assetId: string;
      listingId: string | null;
      variant: PhotoVariant;
    }
  | PhotoFailure;

export function parsePhotoManifest(raw: unknown): PhotoManifest | null {
  const parsed = photoManifestSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function parsePhotoUploadReceipt(raw: unknown): PhotoUploadReceipt | null {
  const parsed = photoUploadReceiptSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function parseUploadHeaders(
  listingId: string,
  headers: Pick<Headers, 'get'>,
  expectedOrigin: string | null,
): ParsedUploadRequest {
  if (!expectedOrigin || headers.get('origin') !== expectedOrigin) {
    return { ok: false, code: 'notAllowed', status: 403 };
  }
  if (!uuidSchema.safeParse(listingId).success) {
    return { ok: false, code: 'notFound', status: 404 };
  }

  const version = Number(headers.get('x-listing-version'));
  const replacePhotoId = headers.get('x-replace-photo');
  const uploadKey = headers.get('x-upload-key');
  if (
    !Number.isSafeInteger(version) ||
    version < 1 ||
    (replacePhotoId !== null && !uuidSchema.safeParse(replacePhotoId).success) ||
    (uploadKey !== null && !uuidSchema.safeParse(uploadKey).success)
  ) {
    return { ok: false, code: 'invalidFile', status: 400 };
  }

  const rawLength = headers.get('content-length');
  if (rawLength !== null) {
    const parsedLength = Number(rawLength);
    if (Number.isFinite(parsedLength) && parsedLength > PHOTO_LIMITS.maxUploadBytes) {
      return { ok: false, code: 'tooLarge', status: 413 };
    }
  }

  return {
    ok: true,
    listingId,
    version,
    replacePhotoId,
    uploadKey,
    clientHints: parseClientTelemetryHints(headers),
  };
}

export function parseReconcileParams(
  listingId: string,
  requestUrl: string,
): ParsedReconcileRequest {
  if (!uuidSchema.safeParse(listingId).success) {
    return { ok: false, code: 'notFound', status: 404 };
  }
  const url = new URL(requestUrl);
  const uploadKey = url.searchParams.get('uploadKey');
  if (uploadKey !== null && !uuidSchema.safeParse(uploadKey).success) {
    return { ok: false, code: 'invalidFile', status: 400 };
  }
  return { ok: true, listingId, uploadKey };
}

export function parseDeliveryParams(
  assetId: string,
  requestUrl: string,
  reviewListing?: string,
): ParsedDeliveryRequest {
  if (!uuidSchema.safeParse(assetId).success) {
    return { ok: false, code: 'notFound', status: 404 };
  }

  const url = new URL(requestUrl);
  const listingId = reviewListing ?? url.searchParams.get('listing');
  const rawVariant = url.searchParams.get('variant') ?? 'card';
  const variant = photoVariantSchema.safeParse(rawVariant);

  if ((listingId && !uuidSchema.safeParse(listingId).success) || !variant.success) {
    return { ok: false, code: 'notFound', status: 404 };
  }

  return { ok: true, assetId, listingId, variant: variant.data };
}

export function formatPhotoEtag(sha256: string): string {
  return `"${sha256}"`;
}

/**
 * Evaluates RFC 9110 weak comparison for `If-None-Match` on GET/HEAD against a strong ETag.
 * Only call AFTER fresh database authorization has confirmed the asset is publicly eligible.
 */
export function matchesIfNoneMatch(headerValue: string | null, strongEtag: string): boolean {
  if (!headerValue) return false;
  const trimmed = headerValue.trim();
  if (!trimmed) return false;
  if (trimmed === '*') return true;

  // Split comma-separated entity-tags while respecting quoted strings.
  let pos = 0;
  while (pos < trimmed.length) {
    while (pos < trimmed.length && (trimmed[pos] === ',' || /\s/.test(trimmed[pos]))) {
      pos++;
    }
    if (pos >= trimmed.length) break;

    if (trimmed[pos] === '*') {
      const next = pos + 1;
      if (next >= trimmed.length || trimmed[next] === ',' || /\s/.test(trimmed[next])) {
        return true;
      }
      return false;
    }

    // Optional weak prefix W/ (case-sensitive per RFC 9110, accept w/ defensively).
    if (
      (trimmed[pos] === 'W' || trimmed[pos] === 'w') &&
      trimmed[pos + 1] === '/'
    ) {
      pos += 2;
    }

    if (trimmed[pos] !== '"') {
      // Skip malformed token up to next comma.
      const nextComma = trimmed.indexOf(',', pos);
      if (nextComma < 0) break;
      pos = nextComma + 1;
      continue;
    }

    const endQuote = trimmed.indexOf('"', pos + 1);
    if (endQuote < 0) break;
    const candidate = trimmed.slice(pos, endQuote + 1);
    if (candidate === strongEtag) return true;
    pos = endQuote + 1;
  }

  return false;
}

/**
 * Returns true if a Cookie header appears to carry a Supabase auth session token cookie.
 * Used only as a fast-path optimization to avoid unnecessary Auth calls on anonymous
 * requests after public photo authorization has already been denied.
 */
export function hasSupabaseAuthCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  return /(?:^|;\s*)sb-[A-Za-z0-9_-]+-auth-token(?:\.\d+)?=/.test(cookieHeader);
}

export function checkPhotoSlotEligibility(
  draft: { version: number; status: ListingStatus; media_ids: string[] },
  expectedVersion: number,
  replacePhotoId: string | null,
): { ok: true } | PhotoFailure {
  if (draft.version !== expectedVersion || !isListingEditable(draft.status)) {
    return { ok: false, code: 'conflict', status: 409 };
  }
  const slotInvalid = replacePhotoId
    ? !draft.media_ids.includes(replacePhotoId)
    : draft.media_ids.length >= PHOTO_LIMITS.maxPerListing;
  if (slotInvalid) {
    return { ok: false, code: 'photoLimit', status: 409 };
  }
  return { ok: true };
}

export function validateSourceImageMetadata(meta: {
  width?: number;
  height?: number;
  pages?: number;
  format?: string;
}): { ok: true; format: PhotoInputFormat } | { ok: false } {
  const { width, height, pages, format } = meta;
  if (
    !width ||
    !height ||
    width < PHOTO_LIMITS.minDimension ||
    height < PHOTO_LIMITS.minDimension ||
    width > PHOTO_LIMITS.maxDimension ||
    height > PHOTO_LIMITS.maxDimension ||
    width * height > PHOTO_LIMITS.maxPixels ||
    (pages ?? 1) !== 1 ||
    !format ||
    !(PHOTO_ALLOWED_FORMATS as readonly string[]).includes(format)
  ) {
    return { ok: false };
  }
  return { ok: true, format: format as PhotoInputFormat };
}

export function mapPhotoSaveRpcError(error: RpcErrorLike): PhotoFailure {
  return classifyRpcError(error) === 'conflict'
    ? { ok: false, code: 'conflict', status: 409 }
    : { ok: false, code: 'unavailable', status: 503 };
}
