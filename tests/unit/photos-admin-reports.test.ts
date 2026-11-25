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
  buildRecentEngagementSeries,
  getActivityActionTranslationKey,
  getReviewListingDisplayRows,
  mapAdminDecisionRpcError,
  parseAdminDashboardOverview,
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

  // Slot eligibility checks optimistic version, editable status, and 4-photo cap (0..4 + legacy 5..6).
  for (const count of [0, 1, 2, 3]) {
    assert.deepEqual(
      checkPhotoSlotEligibility({ version: 2, status: 'draft', media_ids: Array(count).fill(ASSET_ID) }, 2, null),
      { ok: true },
      `new photo allowed when ${count} photos exist`,
    );
  }
  assert.deepEqual(
    checkPhotoSlotEligibility({ version: 3, status: 'draft', media_ids: [] }, 2, null),
    { ok: false, code: 'conflict', status: 409 },
  );
  for (const fullCount of [4, 5, 6]) {
    assert.deepEqual(
      checkPhotoSlotEligibility(
        { version: 2, status: 'draft', media_ids: Array(fullCount).fill(ASSET_ID) },
        2,
        null,
      ),
      { ok: false, code: 'photoLimit', status: 409 },
      `adding photo rejected when ${fullCount} photos exist`,
    );
    assert.deepEqual(
      checkPhotoSlotEligibility(
        { version: 2, status: 'draft', media_ids: Array(fullCount).fill(ASSET_ID) },
        2,
        ASSET_ID,
      ),
      { ok: true },
      `replacing photo allowed when ${fullCount} photos exist`,
    );
  }
  assert.deepEqual(
    checkPhotoSlotEligibility(
      { version: 2, status: 'draft', media_ids: [ASSET_ID] },
      2,
      '55555555-5555-4555-8555-555555555555',
    ),
    { ok: false, code: 'photoLimit', status: 409 },
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

  const racketSnapshot = parseReviewSnapshot({
    listing: {
      ...snapshot.listing,
      category: 'rackets',
      shoe_size_eu: null,
      racket_damage_repair_disclosure: 'No repairs',
      racket_year: 2025,
      racket_weight_grams: 370,
      racket_shape: 'hybrid',
      racket_purchase_date: '2025-01-15',
    },
    profile: snapshot.profile,
    media_manifest: [],
  });
  assert.ok(racketSnapshot);
  const racketRows = getReviewListingDisplayRows(racketSnapshot.listing);
  assert.ok(racketRows.some((row) => row.key === 'racket_year' && row.value === 2025));
  assert.ok(racketRows.some((row) => row.key === 'racket_weight_grams' && row.value === 370));
  assert.ok(racketRows.some((row) => row.key === 'racket_shape' && row.value === 'hybrid'));
  assert.ok(racketRows.some((row) => row.key === 'racket_purchase_date' && row.value === '2025-01-15'));

  assert.equal(
    parseReviewSnapshot({
      listing: { ...racketSnapshot.listing, racket_weight_grams: 421 },
      profile: snapshot.profile,
      media_manifest: [],
    }),
    null,
  );
});

test('admin overview parser, activity action mapping and daily engagement series enforce bounds', () => {
  const validOverview = {
    generated_at: '2026-11-21T12:00:00Z',
    window_end_utc: '2026-11-21',
    kpis: {
      sellers_total: '10',
      sellers_active: 8,
      sellers_suspended: 1,
      sellers_hidden: 1,
      listings_total: 25,
      listings_active: 12,
      listings_pending: 3,
      listings_rejected: 2,
      listings_draft: 4,
      listings_sold: 2,
      listings_traded: 1,
      listings_archived: 1,
      listings_removed: 0,
      open_reports: 2,
      views_30d: '140',
      contacts_30d: 18,
      views_7d: 45,
      contacts_7d: 6,
    },
    needs_attention: {
      pending_listings: 3,
      oldest_pending_submitted_at: '2026-11-20T09:00:00Z',
      open_reports: 2,
      oldest_open_report_at: '2026-11-21T08:00:00Z',
      suspended_sellers: 1,
    },
    trends: {
      period_7d: {
        views: 45,
        contacts: 6,
        new_sellers: 2,
        new_listings: 5,
        submitted_listings: 4,
        new_reports: 2,
      },
      period_30d: {
        views: 140,
        contacts: 18,
        new_sellers: 7,
        new_listings: 19,
        submitted_listings: 14,
        new_reports: 5,
      },
      daily_engagement: [
        { day: '2026-11-19', views: 10, contacts: 2 },
        { day: '2026-11-21', views: 35, contacts: 4 },
      ],
    },
    recent_activity: [
      {
        id: '99',
        actor_role: 'admin',
        action: 'listing.approved',
        target_type: 'listing',
        target_id: LISTING_ID,
        target_label: 'Bullpadel Vertex 04',
        target_status: 'active',
        reason: null,
        created_at: '2026-11-21T11:55:00Z',
      },
      {
        id: 98,
        actor_role: 'moderator',
        action: 'report.suspend',
        target_type: 'profile',
        target_id: SELLER_ID,
        target_label: '@seller_one',
        target_status: 'suspended',
        reason: 'Repeated spam',
        created_at: '2026-11-21T11:30:00Z',
      },
    ],
  };

  const parsed = parseAdminDashboardOverview(validOverview);
  assert.ok(parsed);
  assert.equal(parsed.kpis.sellers_total, 10);
  assert.equal(parsed.kpis.views_30d, 140);
  assert.equal(parsed.recent_activity[0].id, 99);

  // Negative counts, invalid UTC dates, unknown actor roles, and oversized lists fail closed.
  assert.equal(
    parseAdminDashboardOverview({
      ...validOverview,
      kpis: { ...validOverview.kpis, sellers_total: -1 },
    }),
    null,
  );
  assert.equal(
    parseAdminDashboardOverview({ ...validOverview, window_end_utc: '2026/11/21' }),
    null,
  );
  assert.equal(
    parseAdminDashboardOverview({
      ...validOverview,
      recent_activity: [
        { ...validOverview.recent_activity[0], actor_role: 'service_role' },
      ],
    }),
    null,
  );
  assert.equal(
    parseAdminDashboardOverview({
      ...validOverview,
      recent_activity: Array.from({ length: 13 }, (_, index) => ({
        ...validOverview.recent_activity[0],
        id: index + 1,
      })),
    }),
    null,
  );

  // Known action keys match exact Postgres audit_logs action codes; unknown action falls back safely.
  assert.equal(getActivityActionTranslationKey('listing.create'), 'listingCreated');
  assert.equal(getActivityActionTranslationKey('listing.edit'), 'listingUpdated');
  assert.equal(getActivityActionTranslationKey('listing.submit'), 'listingSubmitted');
  assert.equal(getActivityActionTranslationKey('listing.withdraw'), 'listingWithdrawn');
  assert.equal(getActivityActionTranslationKey('listing.archive'), 'listingArchived');
  assert.equal(getActivityActionTranslationKey('listing.approved'), 'listingApproved');
  assert.equal(getActivityActionTranslationKey('report.suspend'), 'reportSuspended');
  assert.equal(getActivityActionTranslationKey('future.unknown_event'), 'other');

  // 7-day engagement series fills empty days honestly and computes bounds.
  const series = buildRecentEngagementSeries(parsed.trends.daily_engagement, '2026-11-21', 7);
  assert.equal(series.points.length, 7);
  assert.equal(series.points[0].day, '2026-11-15');
  assert.equal(series.points[6].day, '2026-11-21');
  assert.equal(series.points[4].views, 10);
  assert.equal(series.points[5].views, 0);
  assert.equal(series.maxViews, 35);
  assert.equal(series.maxContacts, 4);
  assert.equal(series.hasActivity, true);

  const emptySeries = buildRecentEngagementSeries([], '2026-11-21', 7);
  assert.equal(emptySeries.points.length, 7);
  assert.equal(emptySeries.hasActivity, false);

  const invalidSeries = buildRecentEngagementSeries([], 'not-a-date', 7);
  assert.deepEqual(invalidSeries, { points: [], maxViews: 0, maxContacts: 0, hasActivity: false });
});
