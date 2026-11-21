import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchOwnerListing } from '@/features/listings/server';
import { serviceClient } from '@/server/supabase/clients';
import { authConfig, serviceConfig } from '@/server/supabase/config';
import { serverClient } from '@/server/supabase/server';
import {
  PhotoProcessingError,
  processListingPhoto,
  readBoundedBody,
  sha256Hex,
  type ProcessedPhotoOutput,
} from './processing';
import { PHOTO_LIMITS, type PhotoErrorCode, type PhotoManifest, type PhotoVariant } from './types';
import {
  checkPhotoSlotEligibility,
  mapPhotoSaveRpcError,
  parseDeliveryParams,
  parsePhotoManifest,
  parseUploadHeaders,
} from './validation';

const RESPONSE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};

let inFlightUploads = 0; // Bound memory in this Node process; no background queue.

function errorResponse(code: PhotoErrorCode, status: number): Response {
  return Response.json({ error: code }, { status, headers: RESPONSE_HEADERS });
}

async function authorizePhotoUpload(
  userClient: SupabaseClient,
  adminClient: SupabaseClient,
  listingId: string,
  expectedVersion: number,
  replacePhotoId: string | null,
): Promise<
  | { ok: true; ownerId: string }
  | { ok: false; code: PhotoErrorCode; status: number }
> {
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user?.email_confirmed_at) {
    return { ok: false, code: 'signin', status: 401 };
  }

  const draft = await fetchOwnerListing(userClient, listingId);
  if (draft.error || !draft.listing) {
    return { ok: false, code: 'notFound', status: 404 };
  }

  const slot = checkPhotoSlotEligibility(draft.listing, expectedVersion, replacePhotoId);
  if (!slot.ok) return slot;

  const { data: allowed, error: rateError } = await adminClient.rpc('consume_photo_upload', {
    p_owner: user.id,
  });
  if (rateError) return { ok: false, code: 'unavailable', status: 503 };
  if (!allowed) return { ok: false, code: 'rateLimited', status: 429 };

  return { ok: true, ownerId: user.id };
}

async function storePhotoVariants(
  adminClient: SupabaseClient,
  variants: ProcessedPhotoOutput['variants'],
): Promise<void> {
  for (const item of variants) {
    const { error } = await adminClient.storage
      .from(PHOTO_LIMITS.bucket)
      .upload(item.key, item.bytes, { contentType: 'image/webp', upsert: false });
    if (error) {
      throw new PhotoProcessingError('unavailable', 503);
    }
  }
}

async function attachPhotoRecord(
  adminClient: SupabaseClient,
  ownerId: string,
  listingId: string,
  expectedVersion: number,
  replacePhotoId: string | null,
  processed: ProcessedPhotoOutput,
): Promise<unknown> {
  const { data, error } = await adminClient.rpc('save_listing_photo', {
    p_owner: ownerId,
    p_listing: listingId,
    p_version: expectedVersion,
    p_asset: processed.assetId,
    p_attempt: processed.attemptId,
    p_mime: processed.inputMime,
    p_bytes: processed.storedBytes,
    p_width: processed.width,
    p_height: processed.height,
    p_hash: processed.fullHash,
    p_manifest: processed.manifest,
    p_replace: replacePhotoId,
  });

  // Do not delete on ambiguous failure: the transaction may have committed.
  // Unattached private leftovers can be inspected manually; existing photos remain.
  if (error) {
    const mapped = mapPhotoSaveRpcError(error);
    throw new PhotoProcessingError(mapped.code, mapped.status);
  }
  return data;
}

export async function uploadPhoto(request: Request, listing: string) {
  const config = authConfig();
  const parsed = parseUploadHeaders(listing, request.headers, config?.origin ?? null);
  if (!parsed.ok) return errorResponse(parsed.code, parsed.status);

  const userClient = await serverClient();
  const adminClient = serviceClient(PHOTO_LIMITS.storageTimeoutMs);
  if (!userClient || !adminClient) return errorResponse('unavailable', 503);

  const auth = await authorizePhotoUpload(
    userClient,
    adminClient,
    parsed.listingId,
    parsed.version,
    parsed.replacePhotoId,
  );
  if (!auth.ok) return errorResponse(auth.code, auth.status);

  if (inFlightUploads >= PHOTO_LIMITS.maxConcurrent) {
    return errorResponse('unavailable', 503);
  }

  inFlightUploads++;
  try {
    const bytes = await readBoundedBody(request.body);
    const processed = await processListingPhoto(bytes);
    await storePhotoVariants(adminClient, processed.variants);
    const saved = await attachPhotoRecord(
      adminClient,
      auth.ownerId,
      parsed.listingId,
      parsed.version,
      parsed.replacePhotoId,
      processed,
    );
    return Response.json(saved, { status: 201, headers: RESPONSE_HEADERS });
  } catch (error) {
    return error instanceof PhotoProcessingError
      ? errorResponse(error.code, error.status)
      : errorResponse('unavailable', 503);
  } finally {
    inFlightUploads--;
  }
}

type AuthorizedManifestResult =
  | { status: 'ok'; manifest: PhotoManifest; serialized: string }
  | { status: 'not_found' }
  | { status: 'unavailable' };

async function readAuthorizedManifest(
  userClient: SupabaseClient | null,
  adminClient: SupabaseClient,
  assetId: string,
  viewerId: string | null,
  listingId: string | null,
  reviewListing?: string,
): Promise<AuthorizedManifestResult> {
  const response = reviewListing
    ? await userClient?.rpc('admin_photo_delivery', {
        p_listing: reviewListing,
        p_asset: assetId,
      })
    : await adminClient.rpc('get_photo_delivery', {
        p_asset: assetId,
        p_viewer: viewerId,
        p_listing: listingId,
      });

  if (!response) return { status: 'not_found' };
  if (response.error) return { status: 'unavailable' };
  if (!response.data) return { status: 'not_found' };

  const manifest = parsePhotoManifest(response.data);
  if (!manifest) return { status: 'unavailable' };

  return { status: 'ok', manifest, serialized: JSON.stringify(response.data) };
}

async function downloadVerifiedVariant(
  supabaseUrl: string,
  serviceKey: string,
  manifest: PhotoManifest,
  variant: PhotoVariant,
): Promise<Buffer | null> {
  const selected = manifest[variant];
  const object = await fetch(
    `${supabaseUrl}/storage/v1/object/authenticated/${PHOTO_LIMITS.bucket}/${selected.key}`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(PHOTO_LIMITS.storageTimeoutMs),
    },
  );
  if (!object.ok) return null;

  const bytes = await readBoundedBody(object.body);
  if (bytes.length !== selected.bytes || sha256Hex(bytes) !== selected.sha256) {
    return null;
  }
  return bytes;
}

export async function deliverPhoto(request: Request, asset: string, reviewListing?: string) {
  const parsed = parseDeliveryParams(asset, request.url, reviewListing);
  if (!parsed.ok) return errorResponse(parsed.code, parsed.status);

  const adminClient = serviceClient(PHOTO_LIMITS.storageTimeoutMs);
  const service = serviceConfig();
  if (!adminClient || !service) return errorResponse('unavailable', 503);

  try {
    const userClient = await serverClient();
    const user = userClient ? (await userClient.auth.getUser()).data.user : null;
    const viewerId = user?.email_confirmed_at ? user.id : null;

    const first = await readAuthorizedManifest(
      userClient,
      adminClient,
      parsed.assetId,
      viewerId,
      parsed.listingId,
      reviewListing,
    );
    if (first.status === 'not_found') return errorResponse('notFound', 404);
    if (first.status === 'unavailable') return errorResponse('unavailable', 503);

    if (request.headers.has('range')) return errorResponse('rangeUnsupported', 416);

    const bytes = await downloadVerifiedVariant(
      service.url,
      service.key,
      first.manifest,
      parsed.variant,
    );
    if (!bytes) return errorResponse('unavailable', 503);

    // Re-check authorization and manifest identity after fetching bytes to guard against revocation races.
    const second = await readAuthorizedManifest(
      userClient,
      adminClient,
      parsed.assetId,
      viewerId,
      parsed.listingId,
      reviewListing,
    );
    if (second.status === 'unavailable') return errorResponse('unavailable', 503);
    if (second.status === 'not_found' || second.serialized !== first.serialized) {
      return errorResponse('notFound', 404);
    }

    return new Response(request.method === 'HEAD' ? null : new Uint8Array(bytes), {
      headers: {
        ...RESPONSE_HEADERS,
        'Content-Type': 'image/webp',
        'Content-Length': String(bytes.length),
      },
    });
  } catch {
    return errorResponse('unavailable', 503);
  }
}
