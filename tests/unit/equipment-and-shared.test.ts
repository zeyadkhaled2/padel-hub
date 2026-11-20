import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORY_CONFIG,
  EQUIPMENT_CATEGORIES,
  SHOE_SIZES_EU,
  canMarkListingSold,
  canMarkListingTraded,
  formatBrandLabel,
  getCategoryConfig,
  isEquipmentCategory,
} from '@/lib/domain/equipment';
import { PG_ERROR_CODE, classifyRpcError } from '@/lib/errors/domain';
import {
  parsePageParam,
  parseProfileHandle,
  parseShoeSizeEuInput,
  readFormStrings,
  whatsappE164Schema,
} from '@/lib/validation/shared';

test('category configuration enforces Open/Closed equipment rules consistently', () => {
  assert.deepEqual([...EQUIPMENT_CATEGORIES], ['rackets', 'balls', 'shoes', 'bags']);

  assert.equal(getCategoryConfig('rackets').minPhotos, 3);
  assert.equal(getCategoryConfig('rackets').supportsSwap, true);
  assert.deepEqual([...getCategoryConfig('rackets').supportedOfferTypes], ['sale', 'swap', 'both']);

  for (const accessory of ['balls', 'shoes', 'bags'] as const) {
    const config = CATEGORY_CONFIG[accessory];
    assert.equal(config.minPhotos, 1);
    assert.equal(config.maxPhotos, 6);
    assert.equal(config.supportsSwap, false);
    assert.deepEqual([...config.supportedOfferTypes], ['sale']);
  }

  assert.equal(getCategoryConfig('shoes').hasShoeSize, true);
  assert.equal(getCategoryConfig('shoes').supportsShoeSizeFilter, true);
  assert.equal(getCategoryConfig('bags').hasShoeSize, false);
  assert.equal(getCategoryConfig('bags').supportsShoeSizeFilter, false);

  assert.equal(isEquipmentCategory('shoes'), true);
  assert.equal(isEquipmentCategory('helmets'), false);
  assert.equal(formatBrandLabel('drop_shot'), 'drop shot');
});

test('listing completion actions respect offer type and category rules', () => {
  assert.equal(canMarkListingSold('active', 'sale'), true);
  assert.equal(canMarkListingSold('active', 'both'), true);
  assert.equal(canMarkListingSold('active', 'swap'), false);
  assert.equal(canMarkListingSold('pending', 'sale'), false);

  assert.equal(canMarkListingTraded('rackets', 'active', 'swap'), true);
  assert.equal(canMarkListingTraded('rackets', 'active', 'both'), true);
  assert.equal(canMarkListingTraded('rackets', 'active', 'sale'), false);
  assert.equal(canMarkListingTraded('balls', 'active', 'swap'), false);
  assert.equal(canMarkListingTraded('shoes', 'active', 'both'), false);
});

test('EU shoe size list and parser enforce 20-55 half-size increments', () => {
  assert.equal(SHOE_SIZES_EU.length, 71);
  assert.equal(SHOE_SIZES_EU[0], 20);
  assert.equal(SHOE_SIZES_EU[SHOE_SIZES_EU.length - 1], 55);

  assert.deepEqual(parseShoeSizeEuInput(''), { ok: true, value: null });
  assert.deepEqual(parseShoeSizeEuInput('20', { strictFormat: true }), { ok: true, value: 20 });
  assert.deepEqual(parseShoeSizeEuInput('42.5', { strictFormat: true }), { ok: true, value: 42.5 });
  assert.deepEqual(parseShoeSizeEuInput('55.0', { strictFormat: true }), { ok: true, value: 55 });

  for (const invalid of ['19.5', '19', '55.5', '56', '42.3', '42.25', 'abc', '+42']) {
    assert.deepEqual(parseShoeSizeEuInput(invalid, { strictFormat: true }), { ok: false }, invalid);
  }
});

test('shared validators parse page params, profile handles, phones and FormData safely', () => {
  assert.deepEqual(parsePageParam(undefined), { ok: true, page: 1 });
  assert.deepEqual(parsePageParam(''), { ok: true, page: 1 });
  assert.deepEqual(parsePageParam('1'), { ok: true, page: 1 });
  assert.deepEqual(parsePageParam('10000'), { ok: true, page: 10000 });
  assert.deepEqual(parsePageParam('0'), { ok: false });
  assert.deepEqual(parsePageParam('10001'), { ok: false });
  assert.deepEqual(parsePageParam('2.5'), { ok: false });
  assert.deepEqual(parsePageParam('-1'), { ok: false });

  assert.equal(parseProfileHandle('@omar_padel'), 'omar_padel');
  assert.equal(parseProfileHandle('%40Valid_User1'), 'Valid_User1');
  assert.equal(parseProfileHandle('omar_padel'), null);
  assert.equal(parseProfileHandle('@ab'), null);
  assert.equal(parseProfileHandle('@bad-name'), null);
  assert.equal(parseProfileHandle('%E0%A4%A'), null);

  assert.equal(whatsappE164Schema.safeParse('+201000000000').success, true);
  assert.equal(whatsappE164Schema.safeParse('01000000000').success, false);
  assert.equal(whatsappE164Schema.safeParse('javascript:alert(1)').success, false);

  const form = new FormData();
  form.set('title', 'Head Racket');
  form.set('$ACTION_ID_123', 'internal');
  assert.deepEqual(readFormStrings(form), { title: 'Head Racket' });
});

test('RPC error classifier maps Postgres SQLSTATEs to domain error kinds without leaking details', () => {
  assert.equal(classifyRpcError({ code: PG_ERROR_CODE.CONFLICT }), 'conflict');
  assert.equal(classifyRpcError({ code: PG_ERROR_CODE.RATE_LIMITED }), 'rate_limited');
  assert.equal(classifyRpcError({ code: PG_ERROR_CODE.UNIQUE_VIOLATION }), 'duplicate');
  assert.equal(classifyRpcError({ code: PG_ERROR_CODE.INSUFFICIENT_PRIVILEGE }), 'forbidden');
  assert.equal(classifyRpcError({ code: PG_ERROR_CODE.CHECK_VIOLATION }), 'requirements_unmet');
  assert.equal(classifyRpcError({ code: PG_ERROR_CODE.INVALID_PARAMETER }), 'invalid_input');
  assert.equal(classifyRpcError({ code: PG_ERROR_CODE.FOREIGN_KEY_VIOLATION }), 'invalid_input');
  assert.equal(classifyRpcError({ code: '55000' }), 'unavailable');
  assert.equal(classifyRpcError(null), 'unavailable');
});
