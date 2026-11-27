import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  classifyUploadHttpResponse,
  parseRetryAfterSeconds,
} from '@/features/photos/client/upload-transport';
import {
  createPhotoHandlers,
  type PhotoHandlerDeps,
  type ProcessedPhotoOutputLike,
} from '@/features/photos/handlers';
import {
  formatPhotoEtag,
  hasSupabaseAuthCookie,
  matchesIfNoneMatch,
} from '@/features/photos/validation';

const LISTING_ID = '11111111-1111-4111-8111-111111111111';
const ASSET_ID = '22222222-2222-4222-8222-222222222222';
const ATTEMPT_ID = '33333333-3333-4333-8333-333333333333';
const OWNER_ID = '44444444-4444-4444-8444-444444444444';
const UPLOAD_KEY = '55555555-5555-4555-8555-555555555555';

const THUMB_HASH = 'a'.repeat(64);
const CARD_HASH = 'b'.repeat(64);
const FULL_HASH = 'c'.repeat(64);

const MANIFEST = {
  thumb: { key: `processed/${ASSET_ID}/${ATTEMPT_ID}/thumb.webp`, bytes: 120, sha256: THUMB_HASH },
  card: { key: `processed/${ASSET_ID}/${ATTEMPT_ID}/card.webp`, bytes: 240, sha256: CARD_HASH },
  full: { key: `processed/${ASSET_ID}/${ATTEMPT_ID}/full.webp`, bytes: 480, sha256: FULL_HASH },
};

test('matchesIfNoneMatch and hasSupabaseAuthCookie handle RFC 9110 ETags and auth cookies safely', () => {
  const etag = formatPhotoEtag(CARD_HASH);
  assert.equal(etag, `"${CARD_HASH}"`);
  assert.equal(matchesIfNoneMatch(`"${CARD_HASH}"`, etag), true);
  assert.equal(matchesIfNoneMatch(`W/"${CARD_HASH}"`, etag), true);
  assert.equal(matchesIfNoneMatch(`"${THUMB_HASH}", "${CARD_HASH}"`, etag), true);
  assert.equal(matchesIfNoneMatch('*', etag), true);
  assert.equal(matchesIfNoneMatch(`"${THUMB_HASH}"`, etag), false);
  assert.equal(matchesIfNoneMatch(`"${FULL_HASH}"`, etag), false);
  assert.equal(matchesIfNoneMatch('', etag), false);
  assert.equal(matchesIfNoneMatch(null, etag), false);
  assert.equal(matchesIfNoneMatch('malformed-without-quotes', etag), false);

  assert.equal(hasSupabaseAuthCookie(null), false);
  assert.equal(hasSupabaseAuthCookie('NEXT_LOCALE=en; theme=dark'), false);
  assert.equal(hasSupabaseAuthCookie('sb-sxghreukdkxclymysryp-auth-token=base64-abc'), true);
  assert.equal(hasSupabaseAuthCookie('foo=bar; sb-127-auth-token.0=base64-abc'), true);
});

test('classifyUploadHttpResponse handles plain-text/HTML Vercel 413, Retry-After 429, conflicts and ambiguous 5xx', () => {
  // Plain text Vercel FUNCTION_PAYLOAD_TOO_LARGE 413
  const vercel413 = classifyUploadHttpResponse({
    status: 413,
    responseText: 'FUNCTION_PAYLOAD_TOO_LARGE: Request Entity Too Large',
    retryAfterHeader: null,
  });
  assert.deepEqual(vercel413, {
    ok: false,
    kind: 'payload_too_large',
    code: 'payloadTooLarge',
    status: 413,
  });

  // HTML intermediary 413
  const html413 = classifyUploadHttpResponse({
    status: 413,
    responseText: '<html><body>413 Request Entity Too Large</body></html>',
    retryAfterHeader: null,
  });
  assert.equal(html413.ok, false);
  if (!html413.ok) {
    assert.equal(html413.kind, 'payload_too_large');
    assert.equal(html413.code, 'payloadTooLarge');
  }

  // Rate limit with Retry-After seconds
  const rate429 = classifyUploadHttpResponse({
    status: 429,
    responseText: JSON.stringify({ error: 'rateLimited' }),
    retryAfterHeader: '60',
  });
  assert.deepEqual(rate429, {
    ok: false,
    kind: 'rate_limited',
    code: 'rateLimited',
    status: 429,
    retryAfterSeconds: 60,
  });

  // 502 proxy HTML -> ambiguous (must reconcile before retrying)
  const gw502 = classifyUploadHttpResponse({
    status: 502,
    responseText: '<html>Bad Gateway</html>',
    retryAfterHeader: null,
  });
  assert.equal(gw502.ok, false);
  if (!gw502.ok) assert.equal(gw502.kind, 'ambiguous');

  assert.equal(parseRetryAfterSeconds('45'), 45);
  assert.equal(parseRetryAfterSeconds('invalid'), null);
});

test('public photo delivery performs ZERO user authentication calls and serves ETag / 304 without Storage downloads', async () => {
  let verifiedAuthCalls = 0;
  let storageDownloads = 0;
  let deliveryRpcCalls = 0;
  let listingIsPublic = true;
  let dbError = false;

  const adminClient = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      assert.equal(fn, 'get_photo_delivery');
      deliveryRpcCalls++;
      if (dbError) return { data: null, error: { code: '08006', message: 'connection failure' } };
      if (args.p_viewer === null && args.p_listing === LISTING_ID && listingIsPublic) {
        return { data: MANIFEST, error: null };
      }
      if (args.p_viewer === OWNER_ID) {
        return { data: MANIFEST, error: null };
      }
      return { data: null, error: null };
    },
  } as unknown as SupabaseClient;

  const deps: PhotoHandlerDeps = {
    getAuthConfig: () => ({ origin: 'http://127.0.0.1:3100' }),
    getServiceConfig: () => ({ url: 'http://127.0.0.1:54321', key: 'service-key' }),
    getServiceClient: () => adminClient,
    getVerifiedUserClient: async () => {
      verifiedAuthCalls++;
      return { client: adminClient, user: { id: OWNER_ID } };
    },
    loadOwnerListing: async () => ({ listing: null }),
    readBody: async () => Buffer.alloc(0),
    processPhoto: async () => {
      throw new Error('unused');
    },
    downloadVariant: async (_url, _key, manifest, variant) => {
      storageDownloads++;
      return Buffer.alloc(manifest[variant].bytes, 7);
    },
    uploadVariants: async () => {},
    maxConcurrent: 2,
  };

  const { deliverPhoto } = createPhotoHandlers(deps);

  // 1. Cold public GET for card variant: 0 auth calls, 2 RPCs (pre+post), 1 Storage download, private no-cache + ETag.
  const coldRes = await deliverPhoto(
    new Request(`http://127.0.0.1:3100/api/media/${ASSET_ID}?listing=${LISTING_ID}&variant=card`, {
      headers: { cookie: 'sb-local-auth-token=signed-in-browser-cookie' },
    }),
    ASSET_ID,
  );
  assert.equal(coldRes.status, 200);
  assert.equal(verifiedAuthCalls, 0, 'approved public delivery must perform 0 user-auth calls');
  assert.equal(deliveryRpcCalls, 2);
  assert.equal(storageDownloads, 1);
  assert.equal(coldRes.headers.get('cache-control'), 'private, no-cache');
  assert.equal(coldRes.headers.get('etag'), `"${CARD_HASH}"`);
  assert.equal((await coldRes.arrayBuffer()).byteLength, 240);

  // 2. Warm conditional GET with matching card ETag: 0 auth calls, 1 RPC, 0 Storage downloads, 304 Not Modified!
  deliveryRpcCalls = 0;
  storageDownloads = 0;
  const warmGet = await deliverPhoto(
    new Request(`http://127.0.0.1:3100/api/media/${ASSET_ID}?listing=${LISTING_ID}&variant=card`, {
      headers: { 'if-none-match': `"${CARD_HASH}"` },
    }),
    ASSET_ID,
  );
  assert.equal(warmGet.status, 304);
  assert.equal(verifiedAuthCalls, 0);
  assert.equal(deliveryRpcCalls, 1);
  assert.equal(storageDownloads, 0, '304 must avoid downloading Storage bytes');
  assert.equal(warmGet.headers.get('cache-control'), 'private, no-cache');
  assert.equal(warmGet.headers.get('etag'), `"${CARD_HASH}"`);

  // 3. Warm conditional HEAD behaves consistently with GET (304, 0 Storage downloads).
  deliveryRpcCalls = 0;
  storageDownloads = 0;
  const warmHead = await deliverPhoto(
    new Request(`http://127.0.0.1:3100/api/media/${ASSET_ID}?listing=${LISTING_ID}&variant=card`, {
      method: 'HEAD',
      headers: { 'if-none-match': `"${CARD_HASH}"` },
    }),
    ASSET_ID,
  );
  assert.equal(warmHead.status, 304);
  assert.equal(storageDownloads, 0);
  assert.equal(verifiedAuthCalls, 0);

  // 4. Variant ETag isolation: sending card ETag when requesting full variant MUST return 200 with full ETag!
  storageDownloads = 0;
  const wrongVariantEtag = await deliverPhoto(
    new Request(`http://127.0.0.1:3100/api/media/${ASSET_ID}?listing=${LISTING_ID}&variant=full`, {
      headers: { 'if-none-match': `"${CARD_HASH}"` },
    }),
    ASSET_ID,
  );
  assert.equal(wrongVariantEtag.status, 200);
  assert.equal(wrongVariantEtag.headers.get('etag'), `"${FULL_HASH}"`);
  assert.equal(storageDownloads, 1);
  assert.equal(verifiedAuthCalls, 0);

  // 5. Infrastructure DB failure fails closed (503) WITHOUT attempting authenticated fallback!
  dbError = true;
  const dbFail = await deliverPhoto(
    new Request(`http://127.0.0.1:3100/api/media/${ASSET_ID}?listing=${LISTING_ID}&variant=card`, {
      headers: {
        cookie: 'sb-local-auth-token=owner-cookie',
        'if-none-match': `"${CARD_HASH}"`,
      },
    }),
    ASSET_ID,
  );
  assert.equal(dbFail.status, 503);
  assert.equal(dbFail.headers.get('cache-control'), 'private, no-store');
  assert.equal(verifiedAuthCalls, 0, 'DB outage must fail closed without auth fallback');
  dbError = false;

  // 6. Revocation with existing ETag: anonymous request gets 404 private,no-store (NEVER 304!).
  listingIsPublic = false;
  storageDownloads = 0;
  const revokedAnon = await deliverPhoto(
    new Request(`http://127.0.0.1:3100/api/media/${ASSET_ID}?listing=${LISTING_ID}&variant=card`, {
      headers: { 'if-none-match': `"${CARD_HASH}"` },
    }),
    ASSET_ID,
  );
  assert.equal(revokedAnon.status, 404);
  assert.equal(revokedAnon.headers.get('cache-control'), 'private, no-store');
  assert.equal(revokedAnon.headers.get('etag'), null);
  assert.equal(storageDownloads, 0);
  assert.equal(verifiedAuthCalls, 0, 'cookie-less denied request skips Auth call');

  // 7. Revocation for authenticated owner with ?listing= and existing ETag: serves 200 private,no-store (NO ETag, NEVER 304!).
  const revokedOwner = await deliverPhoto(
    new Request(`http://127.0.0.1:3100/api/media/${ASSET_ID}?listing=${LISTING_ID}&variant=card`, {
      headers: {
        cookie: 'sb-local-auth-token=owner-cookie',
        'if-none-match': `"${CARD_HASH}"`,
      },
    }),
    ASSET_ID,
  );
  assert.equal(revokedOwner.status, 200);
  assert.equal(revokedOwner.headers.get('cache-control'), 'private, no-store');
  assert.equal(revokedOwner.headers.get('etag'), null);
  assert.equal(verifiedAuthCalls, 1);

  // 8. 24-card public browse simulation: 0 auth calls across 24 cards, 0 Storage downloads on warm revalidation.
  listingIsPublic = true;
  verifiedAuthCalls = 0;
  deliveryRpcCalls = 0;
  storageDownloads = 0;
  for (let i = 0; i < 24; i++) {
    const res = await deliverPhoto(
      new Request(`http://127.0.0.1:3100/api/media/${ASSET_ID}?listing=${LISTING_ID}&variant=card`, {
        headers: { 'if-none-match': `"${CARD_HASH}"` },
      }),
      ASSET_ID,
    );
    assert.equal(res.status, 304);
  }
  assert.equal(verifiedAuthCalls, 0);
  assert.equal(deliveryRpcCalls, 24);
  assert.equal(storageDownloads, 0);
});

test('upload concurrency saturation returns 503 BEFORE consuming upload rate limit, and idempotency replays cleanly', async () => {
  let rateLimitCalls = 0;
  let sharpCalls = 0;
  let storageCalls = 0;
  let releaseFirstUpload!: () => void;
  const firstUploadBlocked = new Promise<void>((resolve) => {
    releaseFirstUpload = resolve;
  });
  let savedReceipt: Record<string, unknown> | null = null;
  let currentListingVersion = 1;
  let currentMediaIds: string[] = [];

  const adminClient = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === 'get_photo_upload_receipt') {
        return { data: savedReceipt, error: null };
      }
      if (fn === 'consume_photo_upload') {
        rateLimitCalls++;
        return { data: true, error: null };
      }
      if (fn === 'save_listing_photo') {
        const nextVersion = Number(args.p_version) + 1;
        currentListingVersion = nextVersion;
        currentMediaIds = [...currentMediaIds, String(args.p_asset)];
        savedReceipt = {
          id: args.p_asset,
          version: nextVersion,
          expected_version: Number(args.p_version),
          replace_photo_id: args.p_replace ?? null,
        };
        return { data: { id: args.p_asset, version: nextVersion }, error: null };
      }
      return { data: null, error: null };
    },
  } as unknown as SupabaseClient;

  const fakeProcessed: ProcessedPhotoOutputLike = {
    assetId: ASSET_ID,
    attemptId: ATTEMPT_ID,
    inputMime: 'image/webp',
    width: 800,
    height: 600,
    storedBytes: 840,
    fullHash: FULL_HASH,
    manifest: MANIFEST,
    variants: [
      { key: MANIFEST.thumb.key, bytes: Buffer.alloc(120) },
      { key: MANIFEST.card.key, bytes: Buffer.alloc(240) },
      { key: MANIFEST.full.key, bytes: Buffer.alloc(480) },
    ],
  };

  const deps: PhotoHandlerDeps = {
    getAuthConfig: () => ({ origin: 'http://127.0.0.1:3100' }),
    getServiceConfig: () => ({ url: 'http://127.0.0.1:54321', key: 'service-key' }),
    getServiceClient: () => adminClient,
    getVerifiedUserClient: async () => ({ client: adminClient, user: { id: OWNER_ID } }),
    loadOwnerListing: async () => ({
      listing: {
        id: LISTING_ID,
        version: currentListingVersion,
        status: 'draft',
        media_ids: currentMediaIds,
      },
    }),
    readBody: async () => Buffer.from([1, 2, 3, 4]),
    processPhoto: async () => {
      sharpCalls++;
      if (sharpCalls === 1) {
        await firstUploadBlocked;
      }
      return fakeProcessed;
    },
    downloadVariant: async () => null,
    uploadVariants: async () => {
      storageCalls++;
    },
    maxConcurrent: 1, // Limit to 1 so second concurrent upload saturates cleanly.
  };

  const { uploadPhoto } = createPhotoHandlers(deps);

  const req1 = new Request(`http://127.0.0.1:3100/api/listings/${LISTING_ID}/photos`, {
    method: 'POST',
    headers: {
      origin: 'http://127.0.0.1:3100',
      'x-listing-version': '1',
      'x-upload-key': UPLOAD_KEY,
    },
    body: Buffer.from([1, 2, 3, 4]),
  });
  const req2 = new Request(`http://127.0.0.1:3100/api/listings/${LISTING_ID}/photos`, {
    method: 'POST',
    headers: {
      origin: 'http://127.0.0.1:3100',
      'x-listing-version': '1',
    },
    body: Buffer.from([1, 2, 3, 4]),
  });

  const p1 = uploadPhoto(req1, LISTING_ID);
  // Wait a tick so req1 enters Sharp and holds the concurrency slot.
  await new Promise((r) => setTimeout(r, 20));

  const res2 = await uploadPhoto(req2, LISTING_ID);
  assert.equal(res2.status, 503);
  assert.equal(res2.headers.get('retry-after'), '5');
  assert.equal(
    rateLimitCalls,
    1,
    'saturated 503 request must NOT consume a DB upload rate-limit token',
  );

  releaseFirstUpload();
  const res1 = await p1;
  assert.equal(res1.status, 201);
  assert.equal(sharpCalls, 1);
  assert.equal(storageCalls, 1);

  // Replay with the exact same X-Upload-Key after commit -> returns 200 idempotently with 0 extra Sharp/Storage/rate-limit calls!
  const replayReq = new Request(`http://127.0.0.1:3100/api/listings/${LISTING_ID}/photos`, {
    method: 'POST',
    headers: {
      origin: 'http://127.0.0.1:3100',
      'x-listing-version': '1',
      'x-upload-key': UPLOAD_KEY,
    },
    body: Buffer.from([1, 2, 3, 4]),
  });
  const replayRes = await uploadPhoto(replayReq, LISTING_ID);
  assert.equal(replayRes.status, 200);
  const replayBody = (await replayRes.json()) as { id: string; version: number; idempotent: boolean };
  assert.equal(replayBody.id, ASSET_ID);
  assert.equal(replayBody.version, 2);
  assert.equal(replayBody.idempotent, true);
  assert.equal(rateLimitCalls, 1, 'idempotent replay must not burn rate limit');
  assert.equal(sharpCalls, 1, 'idempotent replay must not rerun Sharp');
  assert.equal(storageCalls, 1, 'idempotent replay must not re-upload Storage variants');
});

test('reconcileListingPhotos performs bounded re-fetch when upload commits between snapshot and receipt, and fails closed if consistency cannot be reached', async () => {
  const ASSET_2 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  let loadCalls = 0;
  let scenario: 'interleaved_commit' | 'persistent_stale' = 'interleaved_commit';

  const adminClient = {
    rpc: async (fn: string) => {
      if (fn === 'get_photo_upload_receipt') {
        return {
          data: {
            id: ASSET_ID,
            version: 2,
            expected_version: 1,
            replace_photo_id: null,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    },
  } as unknown as SupabaseClient;

  const { reconcileListingPhotos } = createPhotoHandlers({
    getAuthConfig: () => ({ origin: 'http://127.0.0.1:3100' }),
    getServiceConfig: () => ({ url: 'http://127.0.0.1:54321', key: 'service-key' }),
    getServiceClient: () => adminClient,
    getVerifiedUserClient: async () => ({ client: adminClient, user: { id: OWNER_ID } }),
    loadOwnerListing: async () => {
      loadCalls++;
      if (scenario === 'interleaved_commit') {
        // Call 1 returns stale v1 before the interrupted upload committed;
        // bounded re-fetch (Call 2) observes the committed v2 (or newer v3) snapshot!
        if (loadCalls === 1) {
          return { listing: { id: LISTING_ID, version: 1, status: 'draft', media_ids: [] } };
        }
        return {
          listing: {
            id: LISTING_ID,
            version: 3,
            status: 'draft',
            media_ids: [ASSET_ID, ASSET_2],
          },
        };
      }
      // Persistent lag/stale snapshot: always lags behind receipt version 2!
      return { listing: { id: LISTING_ID, version: 1, status: 'draft', media_ids: [] } };
    },
    readBody: async () => Buffer.alloc(0),
    processPhoto: async () => {
      throw new Error('Unexpected Sharp call');
    },
    downloadVariant: async () => null,
    uploadVariants: async () => {},
    maxConcurrent: 2,
  });

  // Case A: Interleaved commit -> bounded re-fetch returns consistent snapshot (version 3 >= receipt version 2).
  const okRes = await reconcileListingPhotos(
    new Request(`http://127.0.0.1:3100/api/listings/${LISTING_ID}/photos?uploadKey=${UPLOAD_KEY}`),
    LISTING_ID,
  );
  assert.equal(okRes.status, 200);
  assert.equal(loadCalls, 2, 'must re-fetch owner listing when initial snapshot predates receipt');
  const okBody = (await okRes.json()) as {
    version: number;
    media_ids: string[];
    matchedUpload: { id: string; version: number } | null;
  };
  assert.equal(okBody.version, 3);
  assert.deepEqual(okBody.media_ids, [ASSET_ID, ASSET_2]);
  assert.equal(okBody.matchedUpload?.id, ASSET_ID);
  assert.equal(okBody.matchedUpload?.version, 2);

  // Case B: Persistent stale snapshot -> fails closed with 503 after bounded re-fetches (never returns inconsistent pair).
  scenario = 'persistent_stale';
  loadCalls = 0;
  const staleRes = await reconcileListingPhotos(
    new Request(`http://127.0.0.1:3100/api/listings/${LISTING_ID}/photos?uploadKey=${UPLOAD_KEY}`),
    LISTING_ID,
  );
  assert.equal(staleRes.status, 503);
  assert.equal(staleRes.headers.get('cache-control'), 'private, no-store');
  assert.equal(loadCalls, 3, 'initial read + 2 bounded re-fetches before failing closed');
});

test('uploadPhoto early idempotent replay re-fetches stale snapshot and never regresses listing version when listing advanced further', async () => {
  const ASSET_2 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const ASSET_3 = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  let loadCalls = 0;
  let mode: 'interleaved' | 'advanced' = 'interleaved';

  const adminClient = {
    rpc: async (fn: string) => {
      if (fn === 'get_photo_upload_receipt') {
        return {
          data: {
            id: ASSET_ID,
            version: 2,
            expected_version: 1,
            replace_photo_id: null,
          },
          error: null,
        };
      }
      throw new Error(`Unexpected RPC ${fn} during early idempotent replay`);
    },
  } as unknown as SupabaseClient;

  const { uploadPhoto } = createPhotoHandlers({
    getAuthConfig: () => ({ origin: 'http://127.0.0.1:3100' }),
    getServiceConfig: () => ({ url: 'http://127.0.0.1:54321', key: 'service-key' }),
    getServiceClient: () => adminClient,
    getVerifiedUserClient: async () => ({ client: adminClient, user: { id: OWNER_ID } }),
    loadOwnerListing: async () => {
      loadCalls++;
      if (mode === 'interleaved') {
        if (loadCalls === 1) {
          return { listing: { id: LISTING_ID, version: 1, status: 'draft', media_ids: [] } };
        }
        return { listing: { id: LISTING_ID, version: 2, status: 'draft', media_ids: [ASSET_ID] } };
      }
      return {
        listing: {
          id: LISTING_ID,
          version: 4,
          status: 'draft',
          media_ids: [ASSET_ID, ASSET_2, ASSET_3],
        },
      };
    },
    readBody: async () => Buffer.from([1, 2, 3]),
    processPhoto: async () => {
      throw new Error('Must not rerun Sharp on idempotent replay');
    },
    downloadVariant: async () => null,
    uploadVariants: async () => {},
    maxConcurrent: 2,
  });

  const makeReq = () =>
    new Request(`http://127.0.0.1:3100/api/listings/${LISTING_ID}/photos`, {
      method: 'POST',
      headers: {
        origin: 'http://127.0.0.1:3100',
        'x-listing-version': '1',
        'x-upload-key': UPLOAD_KEY,
      },
      body: Buffer.from([1, 2, 3]),
    });

  // Case A: Interleaved commit between snapshot v1 and receipt v2 -> re-fetches v2 cleanly!
  const resInterleaved = await uploadPhoto(makeReq(), LISTING_ID);
  assert.equal(resInterleaved.status, 200);
  const bodyA = (await resInterleaved.json()) as {
    id: string;
    version: number;
    media_ids: string[];
    idempotent: boolean;
  };
  assert.equal(loadCalls, 2);
  assert.equal(bodyA.id, ASSET_ID);
  assert.equal(bodyA.version, 2);
  assert.deepEqual(bodyA.media_ids, [ASSET_ID]);
  assert.equal(bodyA.idempotent, true);

  // Case B: Listing already moved ahead to v4 -> delayed replay of v1->v2 key returns v4 (NEVER regresses to 2)!
  mode = 'advanced';
  loadCalls = 0;
  const resAdvanced = await uploadPhoto(makeReq(), LISTING_ID);
  assert.equal(resAdvanced.status, 200);
  const bodyB = (await resAdvanced.json()) as {
    id: string;
    version: number;
    media_ids: string[];
    idempotent: boolean;
  };
  assert.equal(loadCalls, 1);
  assert.equal(bodyB.id, ASSET_ID);
  assert.equal(bodyB.version, 4);
  assert.equal(bodyB.media_ids.length, 3);
  assert.deepEqual(bodyB.media_ids, [ASSET_ID, ASSET_2, ASSET_3]);
  assert.equal(bodyB.idempotent, true);
});

test('admin review photo delivery maps Postgres 42501 permission denial to 404 private no-store and keeps real DB errors 503', async () => {
  let rpcErrorCode = '42501';
  const mockClient = {
    rpc: async () => ({ data: null, error: { code: rpcErrorCode, message: 'denied' } }),
  } as unknown as SupabaseClient;

  const { deliverPhoto } = createPhotoHandlers({
    getAuthConfig: () => ({ origin: 'http://127.0.0.1:3100' }),
    getServiceConfig: () => ({ url: 'http://127.0.0.1:54321', key: 'service-key' }),
    getServiceClient: () => mockClient,
    getVerifiedUserClient: async () => ({ client: mockClient, user: { id: OWNER_ID } }),
    loadOwnerListing: async () => ({ listing: null }),
    readBody: async () => Buffer.alloc(0),
    processPhoto: async () => {
      throw new Error('unused');
    },
    downloadVariant: async () => null,
    uploadVariants: async () => {},
    maxConcurrent: 2,
  });

  const deniedRes = await deliverPhoto(
    new Request(`http://127.0.0.1:3100/api/admin/listings/${LISTING_ID}/photos/${ASSET_ID}`),
    ASSET_ID,
    LISTING_ID,
  );
  assert.equal(deniedRes.status, 404);
  assert.equal(deniedRes.headers.get('cache-control'), 'private, no-store');

  rpcErrorCode = '08006';
  const outageRes = await deliverPhoto(
    new Request(`http://127.0.0.1:3100/api/admin/listings/${LISTING_ID}/photos/${ASSET_ID}`),
    ASSET_ID,
    LISTING_ID,
  );
  assert.equal(outageRes.status, 503);
  assert.equal(outageRes.headers.get('cache-control'), 'private, no-store');
});
