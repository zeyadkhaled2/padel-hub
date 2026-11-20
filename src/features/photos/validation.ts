import { z } from 'zod';
import { isListingEditable, type ListingStatus } from '@/lib/domain/equipment';
import { classifyRpcError, type RpcErrorLike } from '@/lib/errors/domain';
import { uuidSchema } from '@/lib/validation/shared';
import {
  PHOTO_ALLOWED_FORMATS,
  PHOTO_LIMITS,
  PHOTO_VARIANTS,
  type PhotoErrorCode,
  type PhotoInputFormat,
  type PhotoManifest,
  type PhotoVariant,
} from './types';

export const photoVariantSchema = z.enum(PHOTO_VARIANTS);

export const photoVariantEntrySchema = z.object({
  key: z.string().regex(/^[A-Za-z0-9/_-]+\.webp$/),
  bytes: z.number().int().min(1).max(PHOTO_LIMITS.maxBytes),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export const photoManifestSchema = z.object({
  thumb: photoVariantEntrySchema,
  card: photoVariantEntrySchema,
  full: photoVariantEntrySchema,
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
  if (
    !Number.isSafeInteger(version) ||
    version < 1 ||
    (replacePhotoId !== null && !uuidSchema.safeParse(replacePhotoId).success)
  ) {
    return { ok: false, code: 'invalidFile', status: 400 };
  }

  if (Number(headers.get('content-length')) > PHOTO_LIMITS.maxBytes) {
    return { ok: false, code: 'tooLarge', status: 413 };
  }

  return { ok: true, listingId, version, replacePhotoId };
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
