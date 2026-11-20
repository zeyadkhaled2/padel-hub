import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildListingDraftPatch,
  mapListingRpcError,
  parseCreateListingCategory,
  parseListingActionHeader,
  parseOwnerListing,
} from '@/features/listings/validation';

const VALID_ID = '11111111-1111-4111-8111-111111111111';

test('parseCreateListingCategory accepts only supported equipment categories', () => {
  assert.equal(parseCreateListingCategory('rackets'), 'rackets');
  assert.equal(parseCreateListingCategory('balls'), 'balls');
  assert.equal(parseCreateListingCategory('shoes'), 'shoes');
  assert.equal(parseCreateListingCategory('bags'), 'bags');
  assert.equal(parseCreateListingCategory('grips'), null);
  assert.equal(parseCreateListingCategory(null), null);
});

test('parseListingActionHeader validates UUID, positive version and known intents', () => {
  assert.deepEqual(
    parseListingActionHeader({ id: VALID_ID, version: '3', intent: 'relist' }),
    { ok: true, id: VALID_ID, version: 3, intent: 'relist' },
  );
  assert.deepEqual(
    parseListingActionHeader({ id: 'not-a-uuid', version: '1', intent: 'save' }),
    { ok: false },
  );
  assert.deepEqual(
    parseListingActionHeader({ id: VALID_ID, version: '0', intent: 'save' }),
    { ok: false },
  );
  assert.deepEqual(
    parseListingActionHeader({ id: VALID_ID, version: '1', intent: 'reserved' }),
    { ok: false },
  );
});

test('buildListingDraftPatch enforces racket swap vs sale normalization and clears foreign category fields', () => {
  const swapResult = buildListingDraftPatch('rackets', {
    title: '  Vertex 04  ',
    brand_slug: 'bullpadel',
    brand_custom: 'Should be cleared',
    offer_type: 'swap',
    price_egp: '4500',
    is_negotiable: 'on',
    swap_preference: '  Round control racket  ',
    racket_damage_repair_disclosure: '  No cracks or repairs  ',
    balls_quantity_packaging: 'Should be cleared',
    shoe_size_eu: '42.5',
  });

  assert.equal(swapResult.ok, true);
  if (!swapResult.ok) return;
  assert.equal(swapResult.patch.title, 'Vertex 04');
  assert.equal(swapResult.patch.brand_custom, null);
  assert.equal(swapResult.patch.offer_type, 'swap');
  assert.equal(swapResult.patch.price_egp, null);
  assert.equal(swapResult.patch.is_negotiable, false);
  assert.equal(swapResult.patch.swap_preference, 'Round control racket');
  assert.equal(swapResult.patch.racket_damage_repair_disclosure, 'No cracks or repairs');
  assert.equal(swapResult.patch.balls_quantity_packaging, null);
  assert.equal(swapResult.patch.shoe_size_eu, null);

  const saleResult = buildListingDraftPatch('rackets', {
    brand_slug: 'other',
    brand_custom: '  Custom Lab  ',
    offer_type: 'sale',
    price_egp: '3200',
    is_negotiable: 'on',
    swap_preference: 'Must be cleared for sale-only',
  });

  assert.equal(saleResult.ok, true);
  if (!saleResult.ok) return;
  assert.equal(saleResult.patch.brand_custom, 'Custom Lab');
  assert.equal(saleResult.patch.price_egp, 3200);
  assert.equal(saleResult.patch.is_negotiable, true);
  assert.equal(saleResult.patch.swap_preference, null);
});

test('buildListingDraftPatch enforces shoe half-sizes, balls fields, and sale-only accessories', () => {
  const shoeResult = buildListingDraftPatch('shoes', {
    title: 'Court Shoe',
    offer_type: 'swap',
    price_egp: '2100',
    shoe_size_eu: '42.5',
    racket_damage_repair_disclosure: 'Ignored',
    balls_quantity_packaging: 'Ignored',
    swap_preference: 'Ignored',
  });

  assert.equal(shoeResult.ok, true);
  if (!shoeResult.ok) return;
  assert.equal(shoeResult.patch.offer_type, 'sale');
  assert.equal(shoeResult.patch.shoe_size_eu, 42.5);
  assert.equal(shoeResult.patch.racket_damage_repair_disclosure, null);
  assert.equal(shoeResult.patch.balls_quantity_packaging, null);
  assert.equal(shoeResult.patch.swap_preference, null);

  assert.deepEqual(
    buildListingDraftPatch('shoes', { shoe_size_eu: '42.3' }),
    { ok: false, error: 'invalid' },
  );
  assert.deepEqual(
    buildListingDraftPatch('shoes', { shoe_size_eu: '56' }),
    { ok: false, error: 'invalid' },
  );

  const bagResult = buildListingDraftPatch('bags', {
    title: 'Padel Bag',
    price_egp: '1800',
    shoe_size_eu: '42.5',
  });
  assert.equal(bagResult.ok, true);
  if (!bagResult.ok) return;
  assert.equal(bagResult.patch.offer_type, 'sale');
  assert.equal(bagResult.patch.shoe_size_eu, null);

  const ballsResult = buildListingDraftPatch('balls', {
    balls_quantity_packaging: '3 pressurized balls',
    balls_availability_note: 'Pickup in Maadi',
  });
  assert.equal(ballsResult.ok, true);
  if (!ballsResult.ok) return;
  assert.equal(ballsResult.patch.offer_type, 'sale');
  assert.equal(ballsResult.patch.balls_quantity_packaging, '3 pressurized balls');
  assert.equal(ballsResult.patch.balls_availability_note, 'Pickup in Maadi');
});

test('buildListingDraftPatch rejects out-of-range prices, oversized text and unknown choices', () => {
  assert.deepEqual(
    buildListingDraftPatch('rackets', { price_egp: '0' }),
    { ok: false, error: 'invalid' },
  );
  assert.deepEqual(
    buildListingDraftPatch('rackets', { price_egp: '500001' }),
    { ok: false, error: 'invalid' },
  );
  assert.deepEqual(
    buildListingDraftPatch('rackets', { price_egp: '100.5' }),
    { ok: false, error: 'invalid' },
  );
  assert.deepEqual(
    buildListingDraftPatch('rackets', { title: 'x'.repeat(121) }),
    { ok: false, error: 'invalid' },
  );
  assert.deepEqual(
    buildListingDraftPatch('rackets', { brand_slug: 'unknown_brand' }),
    { ok: false, error: 'invalid' },
  );
  assert.deepEqual(
    buildListingDraftPatch('rackets', { governorate_slug: 'atlantis' }),
    { ok: false, error: 'invalid' },
  );
});

test('parseOwnerListing validates category-specific discriminated unions and strips internal seller_id', () => {
  const parsed = parseOwnerListing({
    id: VALID_ID,
    seller_id: '22222222-2222-4222-8222-222222222222',
    category: 'shoes',
    status: 'draft',
    title: 'Asics Gel',
    brand_slug: 'other',
    brand_custom: 'Asics',
    model: 'Padel Pro',
    description: null,
    governorate_slug: 'cairo',
    district_text: null,
    condition: 'new',
    condition_disclosure: null,
    offer_type: 'sale',
    price_egp: 3500,
    is_negotiable: false,
    swap_preference: null,
    racket_damage_repair_disclosure: null,
    racket_year: null,
    racket_shape: null,
    racket_weight_grams: null,
    racket_purchase_date: null,
    shoe_size_eu: 43.5,
    balls_quantity_packaging: null,
    balls_availability_note: null,
    version: 2,
    content_version: 2,
    last_approved_content_version: null,
    media_ids: [],
  });

  assert.ok(parsed);
  assert.equal(parsed.category, 'shoes');
  assert.equal(parsed.shoe_size_eu, 43.5);
  assert.equal('seller_id' in parsed, false);

  // Rejects mismatched category/offer invariant.
  const invalid = parseOwnerListing({
    ...parsed,
    offer_type: 'swap',
  });
  assert.equal(invalid, null);
});

test('mapListingRpcError preserves exact editor message keys for conflicts and requirements', () => {
  assert.equal(mapListingRpcError({ code: 'PT409' }, 'save'), 'conflict');
  assert.equal(mapListingRpcError({ code: '22023' }, 'save'), 'invalid');
  assert.equal(mapListingRpcError({ code: 'PT409' }, 'transition'), 'conflictOrLimit');
  assert.equal(mapListingRpcError({ code: '23514' }, 'transition'), 'requirements');
  assert.equal(mapListingRpcError({ code: '42501' }, 'transition'), 'unavailable');
});
