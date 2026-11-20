import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCategoryPillQuery,
  buildWhatsAppDestination,
  extractSearchValues,
  parseMarketplaceSearch,
  parsePublicListing,
} from '@/features/marketplace/search';
import { parseListingMetrics } from '@/features/analytics/validation';

const LISTING_ID = '11111111-1111-4111-8111-111111111111';
const MEDIA_ID = '22222222-2222-4222-8222-222222222222';

test('parseMarketplaceSearch validates filters, price bounds, and exact EU half shoe sizes', () => {
  const values = extractSearchValues({
    q: 'Head',
    category: 'shoes',
    governorate: 'cairo',
    brand: 'head',
    condition: 'used',
    offer: 'sale',
    min: '1000',
    max: '5000',
    sort: 'low',
    page: '2',
    size: '45.5',
  });

  const parsed = parseMarketplaceSearch(values);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.params, {
    q: 'Head',
    category: 'shoes',
    governorate: 'cairo',
    brand: 'head',
    condition: 'used',
    offer: 'sale',
    min: 1000,
    max: 5000,
    sort: 'low',
    page: 2,
    shoeSize: 45.5,
  });

  // Invalid fractional shoe size, reversed price range, oversized max price, unknown category.
  assert.equal(
    parseMarketplaceSearch(extractSearchValues({ size: '42.3' })).ok,
    false,
  );
  assert.equal(
    parseMarketplaceSearch(extractSearchValues({ min: '3000', max: '1000' })).ok,
    false,
  );
  assert.equal(
    parseMarketplaceSearch(extractSearchValues({ max: '500001' })).ok,
    false,
  );
  assert.equal(
    parseMarketplaceSearch(extractSearchValues({ category: 'helmets' })).ok,
    false,
  );
  assert.equal(
    parseMarketplaceSearch(extractSearchValues({ q: 'a'.repeat(121) })).ok,
    false,
  );
});

test('buildCategoryPillQuery clears shoe size only on non-shoe category shortcuts', () => {
  const baseValues = extractSearchValues({ category: 'shoes', size: '45.5', min: '100', page: '3' });

  const bagsQuery = buildCategoryPillQuery('bags', '', '', baseValues);
  assert.equal(bagsQuery.category, 'bags');
  assert.equal(bagsQuery.size, undefined);
  assert.equal(bagsQuery.min, '100');
  assert.equal(bagsQuery.page, undefined);

  const shoesQuery = buildCategoryPillQuery('shoes', '', '', baseValues);
  assert.equal(shoesQuery.size, '45.5');

  const allQuery = buildCategoryPillQuery('', 'Head', 'low', baseValues);
  assert.equal(allQuery.category, undefined);
  assert.equal(allQuery.size, '45.5');
  assert.equal(allQuery.q, 'Head');
  assert.equal(allQuery.sort, 'low');
});

test('buildWhatsAppDestination enforces fixed wa.me host and valid E.164 phone', () => {
  const url = buildWhatsAppDestination('+201000000000', 'Hi from PadelHub');
  assert.ok(url);
  const parsed = new URL(url);
  assert.equal(parsed.origin, 'https://wa.me');
  assert.equal(parsed.pathname, '/201000000000');
  assert.equal(parsed.searchParams.get('text'), 'Hi from PadelHub');

  assert.equal(buildWhatsAppDestination('https://evil.example', 'Hi'), null);
  assert.equal(buildWhatsAppDestination('01000000000', 'Hi'), null);
});

test('parsePublicListing validates discriminated category payloads', () => {
  const parsed = parsePublicListing({
    id: LISTING_ID,
    title: 'Padel Shoes',
    category: 'shoes',
    status: 'active',
    brand_slug: 'adidas',
    brand_custom: null,
    model: 'Barricade',
    description: 'Clean court shoes used twice.',
    governorate_slug: 'giza',
    district_text: null,
    condition: 'used',
    condition_disclosure: 'Light outsole wear',
    offer_type: 'sale',
    price_egp: 3200,
    is_negotiable: false,
    swap_preference: null,
    racket_damage_repair_disclosure: null,
    racket_year: null,
    racket_shape: null,
    racket_weight_grams: null,
    racket_purchase_date: null,
    shoe_size_eu: 44.5,
    balls_quantity_packaging: null,
    balls_availability_note: null,
    last_confirmed_available_at: null,
    media_ids: [MEDIA_ID],
    seller: {
      display_name: 'Omar',
      username: 'omar_padel',
      account_type: 'individual',
    },
  });

  assert.ok(parsed);
  assert.equal(parsed.category, 'shoes');
  assert.equal(parsed.shoe_size_eu, 44.5);

  // Public shoe listing without shoe_size_eu fails boundary validation.
  assert.equal(parsePublicListing({ ...parsed, shoe_size_eu: null }), null);
});

test('parseListingMetrics keeps WhatsApp contacts strictly admin-only', () => {
  const ownerSummary = parseListingMetrics({ views: 14, contacts: 9 }, false);
  assert.deepEqual(ownerSummary, { scope: 'owner', views: 14 });
  assert.equal('contacts' in ownerSummary!, false);

  const adminSummary = parseListingMetrics({ views: 14, contacts: 9 }, true);
  assert.deepEqual(adminSummary, { scope: 'admin', views: 14, contacts: 9 });

  assert.equal(parseListingMetrics({ views: 14 }, true), null);
  assert.equal(parseListingMetrics({ views: -1 }, false), null);
});
