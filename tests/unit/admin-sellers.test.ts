import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  mapAdminSellerRpcError,
  parseAccountTypeUpdateForm,
  parseListingLimitUpdateForm,
  parseSellerModerationForm,
  parseSellersQuery,
  sellerDetailSchema,
  sellerInventoryPageSchema,
  sellersHref,
  sellersReturnHref,
} from '@/features/admin/sellers';
import { getActivityActionTranslationKey } from '@/features/admin/validation';

const PUBLIC_ID = '11111111-1111-4111-8111-111111111111';

test('seller query parser enforces bounds, valid enums, and safe return links', () => {
  for (const bad of [
    { q: 'a'.repeat(121) },
    { account: 'admin' },
    { status: 'banned' },
    { governorate: 'unknown' },
    { visibility: 'hidden' },
    { sort: 'username' },
    { page: '0' },
    { page: '10001' },
    { page: ['1', '2'] },
  ]) {
    assert.equal(parseSellersQuery(bad).success, false);
  }

  const ok = parseSellersQuery({
    q: '  @coach_cairo  ',
    account: 'business',
    status: 'suspended',
    governorate: 'cairo',
    visibility: 'public',
    sort: 'activity',
    page: '2',
  });
  assert.ok(ok.success);
  assert.equal(ok.data.q, '@coach_cairo');
  const href = sellersHref(ok.data);
  assert.equal(sellersReturnHref(href), href);
  assert.equal(new URLSearchParams(sellersHref(ok.data, 1).split('?')[1]).has('page'), false);

  for (const unsafe of [
    'https://evil.test/admin/sellers',
    '//evil.test/admin/sellers',
    '/admin/listings',
    '/admin/sellers?status=invalid',
    '/admin/sellers?page=1&page=2',
    ['bad'],
  ]) {
    assert.equal(sellersReturnHref(unsafe), '/admin/sellers');
  }
  assert.equal(sellersReturnHref('/admin/sellers?status=active&extra=1').includes('extra'), false);
});

test('seller allowance, account-type, and moderation form validators enforce strict rules', () => {
  const validType = new FormData();
  validType.set('accountType', 'business');
  validType.set('reason', '  Pilot retail shop  ');
  assert.deepEqual(parseAccountTypeUpdateForm(validType), {
    ok: true,
    accountType: 'business',
    reason: 'Pilot retail shop',
  });

  const missingTypeReason = new FormData();
  missingTypeReason.set('accountType', 'individual');
  missingTypeReason.set('reason', '   ');
  assert.equal(parseAccountTypeUpdateForm(missingTypeReason).ok, false);

  // Zero allowance must be accepted as a valid explicit custom cap.
  const zeroAllowance = new FormData();
  zeroAllowance.set('intent', 'set');
  zeroAllowance.set('limitOverride', '0');
  zeroAllowance.set('reason', 'Temporary pause on new listings');
  assert.deepEqual(parseListingLimitUpdateForm(zeroAllowance), {
    ok: true,
    intent: 'set',
    limitOverride: 0,
    reason: 'Temporary pause on new listings',
    limitInput: '0',
  });

  // Reset to default ignores blank custom input.
  const resetAllowance = new FormData();
  resetAllowance.set('intent', 'reset');
  resetAllowance.set('limitOverride', '');
  resetAllowance.set('reason', 'Restore standard business allowance');
  assert.deepEqual(parseListingLimitUpdateForm(resetAllowance), {
    ok: true,
    intent: 'reset',
    limitOverride: null,
    reason: 'Restore standard business allowance',
    limitInput: '',
  });

  // Invalid / negative / excessive / non-integer allowances rejected.
  for (const badVal of ['', '-1', '501', '12.5', 'abc', '9999']) {
    const f = new FormData();
    f.set('intent', 'set');
    f.set('limitOverride', badVal);
    f.set('reason', 'Valid reason');
    const res = parseListingLimitUpdateForm(f);
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.message, 'invalidAllowance');
  }

  // Moderation requires valid target (suspended/hidden only), reason, and explicit confirmation.
  const unconfirmed = new FormData();
  unconfirmed.set('targetStatus', 'suspended');
  unconfirmed.set('reason', 'Repeated policy violations');
  const unconfirmedRes = parseSellerModerationForm(unconfirmed);
  assert.equal(unconfirmedRes.ok, false);
  if (!unconfirmedRes.ok) assert.equal(unconfirmedRes.message, 'confirmRequired');

  const tryReactivate = new FormData();
  tryReactivate.set('targetStatus', 'active');
  tryReactivate.set('reason', 'Try restore');
  tryReactivate.set('confirmModeration', 'yes');
  assert.equal(parseSellerModerationForm(tryReactivate).ok, false);

  const validHide = new FormData();
  validHide.set('targetStatus', 'hidden');
  validHide.set('reason', 'Onboarding verification hold');
  validHide.set('confirmModeration', 'yes');
  assert.deepEqual(parseSellerModerationForm(validHide), {
    ok: true,
    targetStatus: 'hidden',
    reason: 'Onboarding verification hold',
  });

  assert.equal(mapAdminSellerRpcError({ code: 'PT409', message: 'Stale profile version' }), 'conflict');
  assert.equal(
    mapAdminSellerRpcError({ code: 'PT409', message: 'Listing allowance cannot be below current active and pending usage' }),
    'capacityExceeded',
  );
  assert.equal(mapAdminSellerRpcError({ code: '42501', message: 'Denied' }), 'denied');
  assert.equal(mapAdminSellerRpcError({ code: '22023', message: 'Bad' }), 'invalidInput');
});

test('seller inventory and detail schemas parse valid payloads and reject malformed ones', () => {
  const validInventory = {
    total: 1,
    defaults: { individual: 5, business: 20 },
    counts: { total: 1, individual: 1, business: 0, active: 1, suspended: 0, hidden: 0 },
    items: [
      {
        public_id: PUBLIC_ID,
        display_name: 'Coach Cairo',
        username: 'coach_cairo',
        account_type: 'individual',
        governorate_slug: 'cairo',
        account_status: 'active',
        is_public: true,
        public_profile_visible: true,
        active_listings: 2,
        pending_listings: 1,
        total_listings: 4,
        default_listing_limit: 5,
        listing_limit_override: null,
        effective_listing_limit: 5,
        created_at: '2026-11-01T10:00:00Z',
        updated_at: '2026-11-05T10:00:00Z',
      },
    ],
  };
  assert.equal(sellerInventoryPageSchema.safeParse(validInventory).success, true);
  assert.equal(
    sellerInventoryPageSchema.safeParse({
      ...validInventory,
      items: [{ ...validInventory.items[0], listing_limit_override: 501 }],
    }).success,
    false,
  );

  const validDetail = {
    profile: {
      public_id: PUBLIC_ID,
      username: 'coach_cairo',
      display_name: 'Coach Cairo',
      account_type: 'individual',
      account_status: 'active',
      governorate_slug: 'cairo',
      district_text: 'Maadi',
      bio: 'Coach',
      favorite_racket: 'Vertex 04',
      is_public: true,
      public_profile_visible: true,
      public_contact_consent: true,
      public_contact_consented_at: '2026-11-01T10:00:00Z',
      has_contact: true,
      version: 3,
      created_at: '2026-11-01T10:00:00Z',
      updated_at: '2026-11-05T10:00:00Z',
    },
    allowance: {
      individual_default: 5,
      business_default: 20,
      default_limit: 5,
      override_limit: 0,
      effective_limit: 0,
      active_count: 0,
      pending_count: 0,
      used_count: 0,
      remaining_count: 0,
      over_limit: false,
      override_min: 0,
      override_max: 500,
    },
    listing_counts: {
      total: 0,
      public_visible: 0,
      draft: 0,
      pending: 0,
      rejected: 0,
      active: 0,
      reserved: 0,
      sold: 0,
      traded: 0,
      archived: 0,
      removed: 0,
    },
    open_reports_count: 0,
    engagement_30d: { views: 0, contacts: 0, window_end_utc: '2026-11-26' },
    recent_activity: [],
  };
  assert.equal(sellerDetailSchema.safeParse(validDetail).success, true);
});

test('all Admin C audit actions have dedicated EN and AR labels in Admin A', () => {
  const expected = [
    ['profile.account_type_updated', 'profileAccountTypeUpdated'],
    ['profile.listing_limit_updated', 'profileListingLimitUpdated'],
    ['profile.listing_limit_reset', 'profileListingLimitReset'],
    ['profile.suspended', 'profileSuspended'],
    ['profile.hidden', 'profileHidden'],
  ] as const;

  const en = JSON.parse(readFileSync(new URL('../../messages/en.json', import.meta.url), 'utf8'));
  const ar = JSON.parse(readFileSync(new URL('../../messages/ar.json', import.meta.url), 'utf8'));

  for (const [actionCode, key] of expected) {
    assert.equal(getActivityActionTranslationKey(actionCode), key);
    assert.ok(typeof en.admin.overview.actions[key] === 'string' && en.admin.overview.actions[key].length > 0);
    assert.ok(typeof ar.admin.overview.actions[key] === 'string' && ar.admin.overview.actions[key].length > 0);
  }
  assert.notEqual(en.admin.overview.actions.profileSuspended, en.admin.overview.actions.reportSuspended);
  assert.notEqual(ar.admin.overview.actions.profileSuspended, ar.admin.overview.actions.reportSuspended);
});
