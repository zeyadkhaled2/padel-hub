import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inventoryHref, inventoryReturnHref, parseInventoryQuery, inventoryPageSchema } from '../../src/features/admin/inventory';
import { LISTING_STATUSES } from '../../src/lib/domain/equipment';

test('admin inventory validates bounded and repeated URL parameters', () => {
  for (const bad of [{ q: 'x'.repeat(121) }, { status: 'published' }, { page: '0' }, { page: '10001' }, { page: '1.5' }, { page: ['1','2'] }, { category: 'other' }, { account: 'admin' }, { governorate: 'unknown' }, { sort: 'price' }]) {
    assert.equal(parseInventoryQuery(bad).success, false);
  }
  assert.equal(parseInventoryQuery({ q: '  Vertex  ' }).data?.q, 'Vertex');
  for (const status of LISTING_STATUSES) assert.equal(parseInventoryQuery({ status }).success, true);
});
test('admin inventory preserves filters and resets pagination explicitly', () => {
  const query = parseInventoryQuery({ q: 'عربي & racket', status: 'pending', category: 'rackets', account: 'business', governorate: 'cairo', sort: 'pending', page: '3' });
  assert.ok(query.success);
  const href = inventoryHref(query.data);
  assert.equal(inventoryReturnHref(href), href);
  assert.equal(new URLSearchParams(inventoryHref(query.data, 1).split('?')[1]).has('page'), false);
  assert.equal(new URLSearchParams(href.split('?')[1]).get('q'), 'عربي & racket');
});
test('admin return links cannot redirect externally or retain unsafe query values', () => {
  for (const bad of ['https://evil.test', '//evil.test', '/admin/reports', '/admin/listings?status=unsafe', '/admin/listings?page=1&page=2', ['invalid']]) assert.equal(inventoryReturnHref(bad), '/admin/listings');
  assert.equal(inventoryReturnHref('/admin/listings?status=pending&secret=hidden').includes('secret'), false);
});
test('inventory boundary accepts empty database counts and rejects malformed items', () => {
  assert.equal(inventoryPageSchema.safeParse({ total: 0, counts: null, items: [] }).success, true);
  assert.equal(inventoryPageSchema.safeParse({ total: -1, counts: {}, items: [] }).success, false);
  assert.equal(inventoryPageSchema.safeParse({ total: 1, counts: { invalid: 1 }, items: [] }).success, false);
});
