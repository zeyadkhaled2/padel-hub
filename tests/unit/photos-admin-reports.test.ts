import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkPhotoSlotEligibility,
  parseDeliveryParams,
  parsePhotoManifest,
  parseUploadHeaders,
  validateSourceImageMetadata,
} from '@/features/photos/validation';
import {
  getReviewListingDisplayRows,
  mapAdminDecisionRpcError,
  parsePendingListingsPage,
  parseReviewDecision,
  parseReviewSnapshot,
  parseTotpVerification,
} from '@/features/admin/validation';
import {
  mapReportResolutionRpcError,
  mapReportSubmissionRpcError,
  parseAdminReportsPage,
  parseReportResolution,
  parseReportSubmission,
} from '@/features/reports/validation';

const LISTING_ID = '11111111-1111-4111-8111-111111111111';
const ASSET_ID = '22222222-2222-4222-8222-222222222222';
const ATTEMPT_ID = '33333333-3333-4333-8333-333333333333';
const SELLER_ID = '44444444-4444-4444-8444-444444444444';
const HASH = 'a'.repeat(64);

const validManifest = {
  thumb: { key: `processed/${ASSET_ID}/${ATTEMPT_ID}/thumb.webp`, bytes: 1000, sha256: HASH },
  card: { key: `processed/${ASSET_ID}/${ATTEMPT_ID}/card.webp`, bytes: 2000, sha256: HASH },
  full: { key: `processed/${ASSET_ID}/${ATTEMPT_ID}/full.webp`, bytes: 3000, sha256: HASH },
};

test('photo upload and delivery validators enforce origin, version, size, variant and slot rules', () => {
  const validHeaders = new Headers({
    origin: 'http://127.0.0.1:3100',
    'x-listing-version': '2',
    'content-length': '1024',
  });
  assert.deepEqual(
    parseUploadHeaders(LISTING_ID, validHeaders, 'http://127.0.0.1:3100'),
    { ok: true, listingId: LISTING_ID, version: 2, replacePhotoId: null },
  );

  // Wrong origin rejected with 403.
  assert.deepEqual(
    parseUploadHeaders(LISTING_ID, validHeaders, 'https://padelhub.example'),
    { ok: false, code: 'notAllowed', status: 403 },
  );

  // Oversized content-length rejected with 413.
  const hugeHeaders = new Headers({
    origin: 'http://127.0.0.1:3100',
    'x-listing-version': '2',
    'content-length': String(8 * 1024 * 1024 + 1),
  });
  assert.deepEqual(
    parseUploadHeaders(LISTING_ID, hugeHeaders, 'http://127.0.0.1:3100'),
    { ok: false, code: 'tooLarge', status: 413 },
  );

  // Slot eligibility checks optimistic version, editable status, and 6-photo cap.
  assert.deepEqual(
    checkPhotoSlotEligibility({ version: 2, status: 'draft', media_ids: [ASSET_ID] }, 2, null),
    { ok: true },
  );
  assert.deepEqual(
    checkPhotoSlotEligibility({ version: 3, status: 'draft', media_ids: [] }, 2, null),
    { ok: false, code: 'conflict', status: 409 },
  );
  assert.deepEqual(
    checkPhotoSlotEligibility(
      { version: 2, status: 'draft', media_ids: Array(6).fill(ASSET_ID) },
      2,
      null,
    ),
    { ok: false, code: 'photoLimit', status: 409 },
  );
  assert.deepEqual(
    checkPhotoSlotEligibility(
      { version: 2, status: 'draft', media_ids: Array(6).fill(ASSET_ID) },
      2,
      ASSET_ID,
    ),
    { ok: true },
  );

  // Image metadata bounds reject animated, tiny, huge, or unsupported formats.
  assert.deepEqual(
    validateSourceImageMetadata({ width: 800, height: 600, pages: 1, format: 'jpeg' }),
    { ok: true, format: 'jpeg' },
  );
  assert.deepEqual(
    validateSourceImageMetadata({ width: 800, height: 600, pages: 2, format: 'webp' }),
    { ok: false },
  );
  assert.deepEqual(
    validateSourceImageMetadata({ width: 50, height: 600, pages: 1, format: 'png' }),
    { ok: false },
  );
  assert.deepEqual(
    validateSourceImageMetadata({ width: 6000, height: 6000, pages: 1, format: 'jpeg' }),
    { ok: false },
  );

  assert.ok(parsePhotoManifest(validManifest));
  assert.equal(parsePhotoManifest({ ...validManifest, full: { ...validManifest.full, key: '../escape.webp' } }), null);

  assert.deepEqual(
    parseDeliveryParams(ASSET_ID, `http://127.0.0.1:3100/api/media/${ASSET_ID}?listing=${LISTING_ID}&variant=full`),
    { ok: true, assetId: ASSET_ID, listingId: LISTING_ID, variant: 'full' },
  );
  assert.deepEqual(
    parseDeliveryParams(ASSET_ID, `http://127.0.0.1:3100/api/media/${ASSET_ID}?variant=original`),
    { ok: false, code: 'notFound', status: 404 },
  );
});

test('admin review snapshot, TOTP and decision validators preserve manifest and moderation rules', () => {
  const rawManifest = [
    {
      media_id: ASSET_ID,
      sort_order: 0,
      ready_attempt_id: ATTEMPT_ID,
      content_sha256: HASH,
      variants: validManifest,
    },
  ];

  const snapshot = parseReviewSnapshot({
    listing: {
      id: LISTING_ID,
      seller_id: SELLER_ID,
      category: 'balls',
      status: 'pending',
      title: 'Test balls',
      brand_slug: 'head',
      brand_custom: null,
      model: 'Pro',
      description: 'Sealed pack of three balls.',
      governorate_slug: 'cairo',
      district_text: null,
      condition: 'new',
      condition_disclosure: 'Sealed',
      offer_type: 'sale',
      price_egp: 250,
      is_negotiable: false,
      swap_preference: null,
      racket_damage_repair_disclosure: null,
      racket_year: null,
      racket_shape: null,
      racket_weight_grams: null,
      racket_purchase_date: null,
      shoe_size_eu: null,
      balls_quantity_packaging: '3 balls',
      balls_availability_note: null,
      version: 3,
      content_version: 2,
      last_approved_content_version: null,
      submitted_at: '2026-11-20T00:00:00Z',
    },
    profile: {
      user_id: SELLER_ID,
      version: 3,
      username: 'seller_one',
      display_name: 'Seller One',
      account_type: 'individual',
      account_status: 'active',
      is_public: true,
      public_contact_consent: true,
      has_contact: true,
    },
    media_manifest: rawManifest,
  });

  assert.ok(snapshot);
  // Raw reference preserved for exact Postgres JSONB equality comparison.
  assert.strictEqual(snapshot.media_manifest, rawManifest);

  const rejectWithoutReason = new FormData();
  rejectWithoutReason.set('intent', 'reject');
  rejectWithoutReason.set('reason', '   ');
  assert.deepEqual(parseReviewDecision(snapshot, rejectWithoutReason), {
    ok: false,
    message: 'reasonRequired',
    reason: '',
  });

  const approveWithoutReason = new FormData();
  approveWithoutReason.set('intent', 'approve');
  assert.deepEqual(parseReviewDecision(snapshot, approveWithoutReason), {
    ok: true,
    intent: 'approve',
    reason: '',
  });

  assert.deepEqual(parseTotpVerification('factor-1', ' 123456 ', ['factor-1']), {
    ok: true,
    factorId: 'factor-1',
    code: '123456',
  });
  assert.deepEqual(parseTotpVerification('factor-2', '123456', ['factor-1']), { ok: false });
  assert.deepEqual(parseTotpVerification('factor-1', '12345', ['factor-1']), { ok: false });

  assert.equal(mapAdminDecisionRpcError({ code: 'PT409' }), 'conflict');
  assert.equal(mapAdminDecisionRpcError({ code: '42501' }), 'denied');
  assert.equal(mapAdminDecisionRpcError({ code: '23514' }), 'decisionFailed');
});

test('report submission and resolution validators enforce 1000-char notes and error mapping', () => {
  const reportForm = new FormData();
  reportForm.set('reason', 'misleading');
  reportForm.set('details', '  Photos do not match description  ');
  assert.deepEqual(parseReportSubmission('listing', LISTING_ID, reportForm), {
    ok: true,
    targetType: 'listing',
    targetId: LISTING_ID,
    reason: 'misleading',
    details: 'Photos do not match description',
  });

  const oversizedReport = new FormData();
  oversizedReport.set('reason', 'spam');
  oversizedReport.set('details', 'x'.repeat(1001));
  assert.equal(parseReportSubmission('profile', SELLER_ID, oversizedReport).ok, false);

  const resolveForm = new FormData();
  resolveForm.set('intent', 'remove');
  resolveForm.set('details', 'Violates listing rules');
  assert.deepEqual(parseReportResolution(ASSET_ID, 1, 2, resolveForm), {
    ok: true,
    reportId: ASSET_ID,
    version: 1,
    targetVersion: 2,
    action: 'remove',
    note: 'Violates listing rules',
  });

  const emptyResolve = new FormData();
  emptyResolve.set('intent', 'dismiss');
  emptyResolve.set('details', '   ');
  assert.deepEqual(parseReportResolution(ASSET_ID, 1, 2, emptyResolve), {
    ok: false,
    message: 'noteRequired',
    details: '',
  });

  assert.equal(mapReportSubmissionRpcError({ code: 'PT409' }), 'duplicate');
  assert.equal(mapReportSubmissionRpcError({ code: 'PT429' }), 'limit');
  assert.equal(mapReportSubmissionRpcError({ code: '42501' }), 'unavailable');
  assert.equal(mapReportResolutionRpcError({ code: 'PT409' }), 'conflict');
  assert.equal(mapReportResolutionRpcError({ code: '22023' }), 'unavailable');

  const reportsPage = parseAdminReportsPage({
    total: 1,
    items: [
      {
        id: ASSET_ID,
        version: 1,
        target_version: 2,
        target_type: 'profile',
        title: null,
        username: 'seller_one',
        public_id: SELLER_ID,
        listing_id: null,
        reason_code: 'spam',
        details: null,
      },
    ],
  });
  assert.ok(reportsPage);
  assert.equal(reportsPage.items[0].details, '');

  const pendingPage = parsePendingListingsPage({
    total: 1,
    items: [
      {
        id: LISTING_ID,
        title: 'Test balls',
        category: 'balls',
        submitted_at: '2026-11-20T00:00:00Z',
        display_name: 'Seller One',
      },
    ],
  });
  assert.ok(pendingPage);
  assert.equal(pendingPage.items[0].category, 'balls');
});

test('getReviewListingDisplayRows omits null fields while keeping false booleans', () => {
  const snapshot = parseReviewSnapshot({
    listing: {
      id: LISTING_ID,
      seller_id: SELLER_ID,
      category: 'shoes',
      status: 'pending',
      title: 'Court Shoes',
      brand_slug: 'adidas',
      brand_custom: null,
      model: 'Barricade',
      description: 'Clean court shoes.',
      governorate_slug: 'cairo',
      district_text: null,
      condition: 'new',
      condition_disclosure: 'Unworn',
      offer_type: 'sale',
      price_egp: 3000,
      is_negotiable: false,
      swap_preference: null,
      racket_damage_repair_disclosure: null,
      racket_year: null,
      racket_shape: null,
      racket_weight_grams: null,
      racket_purchase_date: null,
      shoe_size_eu: 42.5,
      balls_quantity_packaging: null,
      balls_availability_note: null,
      version: 1,
      content_version: 1,
      last_approved_content_version: null,
      submitted_at: null,
    },
    profile: {
      user_id: SELLER_ID,
      version: 1,
      username: 'seller_one',
      display_name: 'Seller One',
      account_type: 'individual',
      account_status: 'active',
      is_public: true,
      public_contact_consent: true,
      has_contact: true,
    },
    media_manifest: [],
  });
  assert.ok(snapshot);
  const rows = getReviewListingDisplayRows(snapshot.listing);
  assert.ok(rows.some((row) => row.key === 'shoe_size_eu' && row.value === 42.5));
  assert.ok(rows.some((row) => row.key === 'is_negotiable' && row.value === false));
  assert.ok(!rows.some((row) => row.key === 'brand_custom'));
});
