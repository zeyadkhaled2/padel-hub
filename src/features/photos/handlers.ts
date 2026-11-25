import type { SupabaseClient } from '@supabase/supabase-js';
import type { ListingStatus } from '@/lib/domain/equipment';
import {
  recordPhotoDeliveryMetric,
  recordPhotoUploadMetric,
  type UploadFailureCategory,
} from './telemetry';
import {
  PHOTO_LIMITS,
  type PhotoErrorCode,
  type PhotoManifest,
  type PhotoReconcileResponse,
  type PhotoUploadReceipt,
  type PhotoVariant,
} from './types';
import {
  checkPhotoSlotEligibility,
  formatPhotoEtag,
  hasSupabaseAuthCookie,
  mapPhotoSaveRpcError,
  matchesIfNoneMatch,
  parseDeliveryParams,
  parsePhotoManifest,
  parsePhotoUploadReceipt,
  parseReconcileParams,
  parseUploadHeaders,
} from './validation';

export const PRIVATE_NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
} as const;

export const PUBLIC_REVALIDATE_HEADERS = {
  'Cache-Control': 'private, no-cache',
  'X-Content-Type-Options': 'nosniff',
} as const;

export type ProcessedPhotoOutputLike = {
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

export type PhotoErrorLike = Error & {
  code: PhotoErrorCode;
  status: number;
};

export function isPhotoErrorLike(error: unknown): error is PhotoErrorLike {
  return (
    error instanceof Error &&
    typeof (error as Partial<PhotoErrorLike>).code === 'string' &&
    typeof (error as Partial<PhotoErrorLike>).status === 'number'
  );
}

type VerifiedSessionLike = {
  client: SupabaseClient;
  user: { id: string };
};

type OwnerListingDraftLike = {
  id: string;
  version: number;
  status: ListingStatus;
  media_ids: string[];
};

export type PhotoHandlerDeps = {
  getAuthConfig: () => { origin: string } | null;
  getServiceConfig: () => { url: string; key: string } | null;
  getServiceClient: (timeoutMs: number) => SupabaseClient | null;
  getVerifiedUserClient: () => Promise<VerifiedSessionLike | null>;
  loadOwnerListing: (
    userClient: SupabaseClient,
    listingId: string,
  ) => Promise<{ listing: OwnerListingDraftLike | null; error?: unknown }>;
  readBody: (
    stream: ReadableStream<Uint8Array> | null,
    maxBytes?: number,
  ) => Promise<Buffer>;
  processPhoto: (bytes: Buffer) => Promise<ProcessedPhotoOutputLike>;
  downloadVariant: (
    supabaseUrl: string,
    serviceKey: string,
    manifest: PhotoManifest,
    variant: PhotoVariant,
  ) => Promise<Buffer | null>;
  uploadVariants: (
    adminClient: SupabaseClient,
    variants: ProcessedPhotoOutputLike['variants'],
  ) => Promise<void>;
  maxConcurrent: number;
};

type AuthorizedManifestResult =
  | { status: 'ok'; manifest: PhotoManifest; serialized: string }
  | { status: 'not_found' }
  | { status: 'unavailable' };

function errorResponse(
  code: PhotoErrorCode,
  status: number,
  extraHeaders?: Record<string, string>,
): Response {
  return Response.json(
    { error: code },
    { status, headers: { ...PRIVATE_NO_STORE_HEADERS, ...extraHeaders } },
  );
}

function classifyFailureCategory(code: PhotoErrorCode, status: number): UploadFailureCategory {
  if (code === 'signin') return 'auth';
  if (code === 'notAllowed') return 'origin';
  if (code === 'tooLarge' || code === 'payloadTooLarge' || status === 413) {
    return 'payload_too_large';
  }
  if (code === 'conflict') return 'conflict';
  if (code === 'photoLimit') return 'photo_limit';
  if (code === 'rateLimited' || status === 429) return 'rate_limit';
  if (code === 'invalidFile' || code === 'notFound') return 'validation';
  return 'processing';
}

async function lookupUploadReceipt(
  adminClient: SupabaseClient,
  ownerId: string,
  listingId: string,
  uploadKey: string,
): Promise<{ status: 'ok'; receipt: PhotoUploadReceipt | null } | { status: 'unavailable' }> {
  const { data, error } = await adminClient.rpc('get_photo_upload_receipt', {
    p_owner: ownerId,
    p_listing: listingId,
    p_upload_key: uploadKey,
  });
  if (error) return { status: 'unavailable' };
  if (!data) return { status: 'ok', receipt: null };
  const parsed = parsePhotoUploadReceipt(data);
  if (!parsed) return { status: 'unavailable' };
  return { status: 'ok', receipt: parsed };
}

async function attachPhotoRecord(
  adminClient: SupabaseClient,
  ownerId: string,
  listingId: string,
  expectedVersion: number,
  replacePhotoId: string | null,
  uploadKey: string | null,
  processed: ProcessedPhotoOutputLike,
): Promise<
  | { ok: true; data: { id: string; version: number; idempotent?: boolean } }
  | { ok: false; code: PhotoErrorCode; status: number }
> {
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
    p_upload_key: uploadKey,
  });

  // Do not delete on ambiguous failure: the transaction may have committed.
  // Unattached private leftovers can be inspected manually; existing photos remain.
  if (error) {
    const mapped = mapPhotoSaveRpcError(error);
    return { ok: false, code: mapped.code, status: mapped.status };
  }
  return {
    ok: true,
    data: data as { id: string; version: number; idempotent?: boolean },
  };
}

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

export function createPhotoHandlers(deps: PhotoHandlerDeps) {
  let inFlightUploads = 0; // Bound memory in this Node process; no background queue.

  async function uploadPhoto(request: Request, listing: string): Promise<Response> {
    const startedAt = performance.now();
    const config = deps.getAuthConfig();
    const parsed = parseUploadHeaders(listing, request.headers, config?.origin ?? null);
    if (!parsed.ok) {
      recordPhotoUploadMetric({
        event: 'media.upload',
        outcome: 'rejected',
        failureCategory: classifyFailureCategory(parsed.code, parsed.status),
        httpStatus: parsed.status,
        incomingBytes: 0,
        storedBytes: null,
        thumbBytes: null,
        cardBytes: null,
        fullBytes: null,
        readMs: 0,
        sharpMs: 0,
        storageMs: 0,
        dbMs: 0,
        totalMs: Math.round(performance.now() - startedAt),
        isReplacement: false,
        clientOriginalBytes: null,
        clientPrepMs: null,
        clientHeicFallback: false,
        clientSourceFormat: 'unknown',
      });
      return errorResponse(parsed.code, parsed.status);
    }

    const emitUpload = (params: {
      outcome: 'saved' | 'idempotent_replay' | 'rejected' | 'error';
      failureCategory: UploadFailureCategory;
      httpStatus: number;
      incomingBytes?: number;
      processed?: ProcessedPhotoOutputLike | null;
      readMs?: number;
      sharpMs?: number;
      storageMs?: number;
      dbMs?: number;
    }) => {
      recordPhotoUploadMetric({
        event: 'media.upload',
        outcome: params.outcome,
        failureCategory: params.failureCategory,
        httpStatus: params.httpStatus,
        incomingBytes: params.incomingBytes ?? 0,
        storedBytes: params.processed?.storedBytes ?? null,
        thumbBytes: params.processed?.manifest.thumb.bytes ?? null,
        cardBytes: params.processed?.manifest.card.bytes ?? null,
        fullBytes: params.processed?.manifest.full.bytes ?? null,
        readMs: Math.round(params.readMs ?? 0),
        sharpMs: Math.round(params.sharpMs ?? 0),
        storageMs: Math.round(params.storageMs ?? 0),
        dbMs: Math.round(params.dbMs ?? 0),
        totalMs: Math.round(performance.now() - startedAt),
        isReplacement: parsed.replacePhotoId !== null,
        clientOriginalBytes: parsed.clientHints.originalBytes,
        clientPrepMs: parsed.clientHints.prepMs,
        clientHeicFallback: parsed.clientHints.heicFallbackUsed,
        clientSourceFormat: parsed.clientHints.sourceFormat,
      });
    };

    const adminClient = deps.getServiceClient(PHOTO_LIMITS.storageTimeoutMs);
    if (!config || !adminClient) {
      emitUpload({ outcome: 'error', failureCategory: 'database', httpStatus: 503 });
      return errorResponse('unavailable', 503);
    }

    const verified = await deps.getVerifiedUserClient();
    if (!verified) {
      emitUpload({ outcome: 'rejected', failureCategory: 'auth', httpStatus: 401 });
      return errorResponse('signin', 401);
    }

    const draft = await deps.loadOwnerListing(verified.client, parsed.listingId);
    if (draft.error || !draft.listing) {
      emitUpload({ outcome: 'rejected', failureCategory: 'validation', httpStatus: 404 });
      return errorResponse('notFound', 404);
    }

    // Check bounded upload idempotency receipt BEFORE consuming rate limits or running Sharp.
    if (parsed.uploadKey) {
      const receiptLookup = await lookupUploadReceipt(
        adminClient,
        verified.user.id,
        parsed.listingId,
        parsed.uploadKey,
      );
      if (receiptLookup.status === 'unavailable') {
        emitUpload({ outcome: 'error', failureCategory: 'database', httpStatus: 503 });
        return errorResponse('unavailable', 503);
      }
      if (receiptLookup.receipt) {
        const rec = receiptLookup.receipt;
        if (
          rec.expected_version !== parsed.version ||
          rec.replace_photo_id !== parsed.replacePhotoId
        ) {
          emitUpload({ outcome: 'rejected', failureCategory: 'conflict', httpStatus: 409 });
          return errorResponse('conflict', 409);
        }
        emitUpload({ outcome: 'idempotent_replay', failureCategory: 'none', httpStatus: 200 });
        return Response.json(
          {
            id: rec.id,
            version: rec.version,
            media_ids: draft.listing.media_ids,
            idempotent: true,
          },
          { status: 200, headers: PRIVATE_NO_STORE_HEADERS },
        );
      }
    }

    const slot = checkPhotoSlotEligibility(draft.listing, parsed.version, parsed.replacePhotoId);
    if (!slot.ok) {
      emitUpload({
        outcome: 'rejected',
        failureCategory: classifyFailureCategory(slot.code, slot.status),
        httpStatus: slot.status,
      });
      return errorResponse(slot.code, slot.status);
    }

    // Reserve concurrency slot BEFORE consuming the seller's DB rate-limit allowance so
    // temporary process saturation never burns upload quota.
    if (inFlightUploads >= deps.maxConcurrent) {
      emitUpload({ outcome: 'rejected', failureCategory: 'busy', httpStatus: 503 });
      return errorResponse('unavailable', 503, { 'Retry-After': '5' });
    }

    inFlightUploads++;
    let incomingBytes = 0;
    let readMs = 0;
    let sharpMs = 0;
    let storageMs = 0;
    let dbMs = 0;
    let processed: ProcessedPhotoOutputLike | null = null;
    let stage: 'rate' | 'read' | 'sharp' | 'storage' | 'db' = 'rate';

    try {
      const { data: allowed, error: rateError } = await adminClient.rpc('consume_photo_upload', {
        p_owner: verified.user.id,
      });
      if (rateError) {
        emitUpload({ outcome: 'error', failureCategory: 'database', httpStatus: 503 });
        return errorResponse('unavailable', 503);
      }
      if (!allowed) {
        emitUpload({ outcome: 'rejected', failureCategory: 'rate_limit', httpStatus: 429 });
        return errorResponse('rateLimited', 429, { 'Retry-After': '60' });
      }

      stage = 'read';
      const readStart = performance.now();
      const bytes = await deps.readBody(request.body, PHOTO_LIMITS.maxUploadBytes);
      readMs = performance.now() - readStart;
      incomingBytes = bytes.length;

      stage = 'sharp';
      const sharpStart = performance.now();
      processed = await deps.processPhoto(bytes);
      sharpMs = performance.now() - sharpStart;

      stage = 'storage';
      const storageStart = performance.now();
      await deps.uploadVariants(adminClient, processed.variants);
      storageMs = performance.now() - storageStart;

      stage = 'db';
      const dbStart = performance.now();
      const attached = await attachPhotoRecord(
        adminClient,
        verified.user.id,
        parsed.listingId,
        parsed.version,
        parsed.replacePhotoId,
        parsed.uploadKey,
        processed,
      );
      dbMs = performance.now() - dbStart;

      if (!attached.ok) {
        emitUpload({
          outcome: attached.status >= 500 ? 'error' : 'rejected',
          failureCategory:
            attached.status >= 500
              ? 'database'
              : classifyFailureCategory(attached.code, attached.status),
          httpStatus: attached.status,
          incomingBytes,
          processed,
          readMs,
          sharpMs,
          storageMs,
          dbMs,
        });
        return errorResponse(attached.code, attached.status);
      }

      const saved = attached.data;
      const isIdempotent = saved.idempotent === true;
      const status = isIdempotent ? 200 : 201;
      emitUpload({
        outcome: isIdempotent ? 'idempotent_replay' : 'saved',
        failureCategory: 'none',
        httpStatus: status,
        incomingBytes,
        processed,
        readMs,
        sharpMs,
        storageMs,
        dbMs,
      });

      return Response.json(
        {
          ...saved,
          incomingBytes,
          storedBytes: processed.storedBytes,
          serverProcessingMs: Math.round(sharpMs),
        },
        { status, headers: PRIVATE_NO_STORE_HEADERS },
      );
    } catch (error) {
      const failure = isPhotoErrorLike(error)
        ? { code: error.code, status: error.status }
        : { code: 'unavailable' as const, status: 503 };
      const category: UploadFailureCategory =
        stage === 'storage' && failure.status === 503
          ? 'storage'
          : stage === 'db' && failure.status === 503
            ? 'database'
            : classifyFailureCategory(failure.code, failure.status);

      emitUpload({
        outcome: failure.status >= 500 ? 'error' : 'rejected',
        failureCategory: category,
        httpStatus: failure.status,
        incomingBytes,
        processed,
        readMs,
        sharpMs,
        storageMs,
        dbMs,
      });
      return errorResponse(failure.code, failure.status);
    } finally {
      inFlightUploads--;
    }
  }

  /**
   * Authoritative owner-only listing photo state & idempotency receipt reconciliation.
   * Called before retrying any ambiguous upload or after optimistic concurrency conflicts.
   */
  async function reconcileListingPhotos(request: Request, listing: string): Promise<Response> {
    const parsed = parseReconcileParams(listing, request.url);
    if (!parsed.ok) return errorResponse(parsed.code, parsed.status);

    const adminClient = deps.getServiceClient(PHOTO_LIMITS.storageTimeoutMs);
    if (!adminClient) return errorResponse('unavailable', 503);

    const verified = await deps.getVerifiedUserClient();
    if (!verified) return errorResponse('signin', 401);

    const draft = await deps.loadOwnerListing(verified.client, parsed.listingId);
    if (draft.error || !draft.listing) {
      return errorResponse('notFound', 404);
    }

    let matchedUpload: PhotoUploadReceipt | null = null;
    if (parsed.uploadKey) {
      const lookup = await lookupUploadReceipt(
        adminClient,
        verified.user.id,
        parsed.listingId,
        parsed.uploadKey,
      );
      if (lookup.status === 'unavailable') {
        return errorResponse('unavailable', 503);
      }
      matchedUpload = lookup.receipt;
    }

    const payload: PhotoReconcileResponse = {
      id: draft.listing.id,
      status: draft.listing.status,
      version: draft.listing.version,
      media_ids: draft.listing.media_ids,
      matchedUpload,
    };
    return Response.json(payload, { status: 200, headers: PRIVATE_NO_STORE_HEADERS });
  }

  async function deliverPhoto(
    request: Request,
    asset: string,
    reviewListing?: string,
  ): Promise<Response> {
    const startedAt = performance.now();
    const parsed = parseDeliveryParams(asset, request.url, reviewListing);
    if (!parsed.ok) {
      recordPhotoDeliveryMetric({
        event: 'media.delivery',
        accessPath: 'denied',
        variant: 'invalid',
        httpStatus: parsed.status,
        conditionalMatch: false,
        storageDownloaded: false,
        authChecked: false,
        authRpcCount: 0,
        responseBytes: 0,
        totalMs: Math.round(performance.now() - startedAt),
      });
      return errorResponse(parsed.code, parsed.status);
    }

    const adminClient = deps.getServiceClient(PHOTO_LIMITS.storageTimeoutMs);
    const service = deps.getServiceConfig();
    if (!adminClient || !service) {
      recordPhotoDeliveryMetric({
        event: 'media.delivery',
        accessPath: 'error',
        variant: parsed.variant,
        httpStatus: 503,
        conditionalMatch: false,
        storageDownloaded: false,
        authChecked: false,
        authRpcCount: 0,
        responseBytes: 0,
        totalMs: Math.round(performance.now() - startedAt),
      });
      return errorResponse('unavailable', 503);
    }

    let authChecked = false;
    let authRpcCount = 0;
    let storageDownloaded = false;

    const emitDelivery = (
      accessPath: 'public_anonymous' | 'owner_authenticated' | 'admin_review' | 'denied' | 'error',
      httpStatus: number,
      conditionalMatch: boolean,
      responseBytes: number,
    ) => {
      recordPhotoDeliveryMetric({
        event: 'media.delivery',
        accessPath,
        variant: parsed.variant,
        httpStatus,
        conditionalMatch,
        storageDownloaded,
        authChecked,
        authRpcCount,
        responseBytes,
        totalMs: Math.round(performance.now() - startedAt),
      });
    };

    try {
      // Path 1: Admin review delivery — ALWAYS authenticated (aal2 enforced in Postgres),
      // ALWAYS private, no-store, NEVER ETag/304.
      if (reviewListing) {
        authChecked = true;
        const verified = await deps.getVerifiedUserClient();
        const userClient = verified?.client ?? null;

        authRpcCount++;
        const first = await readAuthorizedManifest(
          userClient,
          adminClient,
          parsed.assetId,
          verified?.user.id ?? null,
          parsed.listingId,
          reviewListing,
        );
        if (first.status === 'not_found') {
          emitDelivery('denied', 404, false, 0);
          return errorResponse('notFound', 404);
        }
        if (first.status === 'unavailable') {
          emitDelivery('error', 503, false, 0);
          return errorResponse('unavailable', 503);
        }

        if (request.headers.has('range')) {
          emitDelivery('admin_review', 416, false, 0);
          return errorResponse('rangeUnsupported', 416);
        }

        storageDownloaded = true;
        const bytes = await deps.downloadVariant(
          service.url,
          service.key,
          first.manifest,
          parsed.variant,
        );
        if (!bytes) {
          emitDelivery('error', 503, false, 0);
          return errorResponse('unavailable', 503);
        }

        authRpcCount++;
        const second = await readAuthorizedManifest(
          userClient,
          adminClient,
          parsed.assetId,
          verified?.user.id ?? null,
          parsed.listingId,
          reviewListing,
        );
        if (second.status === 'unavailable') {
          emitDelivery('error', 503, false, 0);
          return errorResponse('unavailable', 503);
        }
        if (second.status === 'not_found' || second.serialized !== first.serialized) {
          emitDelivery('denied', 404, false, 0);
          return errorResponse('notFound', 404);
        }

        const isHead = request.method === 'HEAD';
        emitDelivery('admin_review', 200, false, isHead ? 0 : bytes.length);
        return new Response(isHead ? null : new Uint8Array(bytes), {
          headers: {
            ...PRIVATE_NO_STORE_HEADERS,
            'Content-Type': 'image/webp',
            'Content-Length': String(bytes.length),
          },
        });
      }

      // Path 2: Public-candidate delivery (?listing=<uuid>) — Check anonymous public eligibility
      // FIRST without calling verifiedUserClient(), auth.getUser(), or MFA checks.
      if (parsed.listingId) {
        authRpcCount++;
        const publicFirst = await readAuthorizedManifest(
          null,
          adminClient,
          parsed.assetId,
          null,
          parsed.listingId,
        );

        // Fail closed on infrastructure/database errors — NEVER fall back to authenticated
        // lookup when public authorization RPC fails.
        if (publicFirst.status === 'unavailable') {
          emitDelivery('error', 503, false, 0);
          return errorResponse('unavailable', 503);
        }

        if (publicFirst.status === 'ok') {
          if (request.headers.has('range')) {
            emitDelivery('public_anonymous', 416, false, 0);
            return errorResponse('rangeUnsupported', 416);
          }

          const selected = publicFirst.manifest[parsed.variant];
          const etag = formatPhotoEtag(selected.sha256);

          // Conditional revalidation: fresh DB public eligibility already verified above.
          // Return 304 without downloading Storage bytes when the authorized variant hash matches.
          if (
            (request.method === 'GET' || request.method === 'HEAD') &&
            matchesIfNoneMatch(request.headers.get('if-none-match'), etag)
          ) {
            emitDelivery('public_anonymous', 304, true, 0);
            return new Response(null, {
              status: 304,
              headers: {
                ...PUBLIC_REVALIDATE_HEADERS,
                ETag: etag,
              },
            });
          }

          storageDownloaded = true;
          const bytes = await deps.downloadVariant(
            service.url,
            service.key,
            publicFirst.manifest,
            parsed.variant,
          );
          if (!bytes) {
            emitDelivery('error', 503, false, 0);
            return errorResponse('unavailable', 503);
          }

          // Re-check anonymous public authorization and manifest identity after fetching bytes.
          authRpcCount++;
          const publicSecond = await readAuthorizedManifest(
            null,
            adminClient,
            parsed.assetId,
            null,
            parsed.listingId,
          );
          if (publicSecond.status === 'unavailable') {
            emitDelivery('error', 503, false, 0);
            return errorResponse('unavailable', 503);
          }
          if (
            publicSecond.status === 'not_found' ||
            publicSecond.serialized !== publicFirst.serialized
          ) {
            emitDelivery('denied', 404, false, 0);
            return errorResponse('notFound', 404);
          }

          const isHead = request.method === 'HEAD';
          emitDelivery('public_anonymous', 200, false, isHead ? 0 : bytes.length);
          return new Response(isHead ? null : new Uint8Array(bytes), {
            headers: {
              ...PUBLIC_REVALIDATE_HEADERS,
              ETag: etag,
              'Content-Type': 'image/webp',
              'Content-Length': String(bytes.length),
            },
          });
        }

        // Anonymous public authorization was legitimately denied (e.g. draft/pending/rejected/
        // withdrawn/private/suspended). Fall back to authenticated owner access ONLY if the
        // request actually carries a Supabase session cookie; private responses stay no-store
        // and NEVER return 304 or ETag.
        if (!hasSupabaseAuthCookie(request.headers.get('cookie'))) {
          emitDelivery('denied', 404, false, 0);
          return errorResponse('notFound', 404);
        }
      }

      // Path 3: Authenticated owner-only delivery (no ?listing= OR denied ?listing= with session cookie).
      // Enforce full verified account session boundary (blocks unfinished recovery sessions).
      authChecked = true;
      const verified = await deps.getVerifiedUserClient();
      const viewerId = verified?.user.id ?? null;
      if (!viewerId) {
        emitDelivery('denied', 404, false, 0);
        return errorResponse('notFound', 404);
      }

      authRpcCount++;
      const ownerFirst = await readAuthorizedManifest(
        null,
        adminClient,
        parsed.assetId,
        viewerId,
        parsed.listingId,
      );
      if (ownerFirst.status === 'not_found') {
        emitDelivery('denied', 404, false, 0);
        return errorResponse('notFound', 404);
      }
      if (ownerFirst.status === 'unavailable') {
        emitDelivery('error', 503, false, 0);
        return errorResponse('unavailable', 503);
      }

      if (request.headers.has('range')) {
        emitDelivery('owner_authenticated', 416, false, 0);
        return errorResponse('rangeUnsupported', 416);
      }

      storageDownloaded = true;
      const bytes = await deps.downloadVariant(
        service.url,
        service.key,
        ownerFirst.manifest,
        parsed.variant,
      );
      if (!bytes) {
        emitDelivery('error', 503, false, 0);
        return errorResponse('unavailable', 503);
      }

      authRpcCount++;
      const ownerSecond = await readAuthorizedManifest(
        null,
        adminClient,
        parsed.assetId,
        viewerId,
        parsed.listingId,
      );
      if (ownerSecond.status === 'unavailable') {
        emitDelivery('error', 503, false, 0);
        return errorResponse('unavailable', 503);
      }
      if (ownerSecond.status === 'not_found' || ownerSecond.serialized !== ownerFirst.serialized) {
        emitDelivery('denied', 404, false, 0);
        return errorResponse('notFound', 404);
      }

      const isHead = request.method === 'HEAD';
      emitDelivery('owner_authenticated', 200, false, isHead ? 0 : bytes.length);
      return new Response(isHead ? null : new Uint8Array(bytes), {
        headers: {
          ...PRIVATE_NO_STORE_HEADERS,
          'Content-Type': 'image/webp',
          'Content-Length': String(bytes.length),
        },
      });
    } catch {
      emitDelivery('error', 503, false, 0);
      return errorResponse('unavailable', 503);
    }
  }

  return { uploadPhoto, reconcileListingPhotos, deliverPhoto };
}
