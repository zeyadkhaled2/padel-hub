begin;
create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(18);
grant usage on schema extensions to authenticated, anon, service_role;

-- Verify private.photo_upload_idempotency has ENABLE + FORCE RLS and zero public/anon/authenticated grants.
select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'private' and c.relname = 'photo_upload_idempotency'),
  'photo_upload_idempotency has ENABLE and FORCE ROW LEVEL SECURITY'
);
select ok(
  not has_table_privilege('anon', 'private.photo_upload_idempotency', 'SELECT')
  and not has_table_privilege('authenticated', 'private.photo_upload_idempotency', 'SELECT'),
  'anon and authenticated have zero table privileges on photo_upload_idempotency'
);

insert into auth.users(id, email_confirmed_at) values
  ('11111111-1111-4111-8111-111111111111', now()),
  ('22222222-2222-4222-8222-222222222222', now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","session_id":"00000000-0000-4000-8000-000000000001","amr":[{"method":"password","timestamp":1795000000}]}';
select public.create_seller_profile('idem_owner', 'Idempotent Owner', 'cairo');
select throws_ok(
  $$select public.get_photo_upload_receipt('11111111-1111-4111-8111-111111111111', gen_random_uuid(), gen_random_uuid())$$,
  '42501',
  null,
  'authenticated caller cannot invoke service-only get_photo_upload_receipt'
);
set local role anon;
select throws_ok(
  $$select public.get_photo_upload_receipt('11111111-1111-4111-8111-111111111111', gen_random_uuid(), gen_random_uuid())$$,
  '42501',
  null,
  'anon caller cannot invoke service-only get_photo_upload_receipt'
);
reset role;

-- Prepare an empty draft listing + two distinct synthetic asset manifests.
create temp table idem_fx as
select
  gen_random_uuid() as listing_id,
  gen_random_uuid() as asset1,
  gen_random_uuid() as attempt1,
  gen_random_uuid() as asset2,
  gen_random_uuid() as attempt2,
  gen_random_uuid() as asset3,
  gen_random_uuid() as attempt3,
  gen_random_uuid() as key1,
  gen_random_uuid() as key2;

grant select, update on idem_fx to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","session_id":"00000000-0000-4000-8000-000000000001","amr":[{"method":"password","timestamp":1795000000}]}';
update idem_fx set listing_id = (public.create_listing_draft('rackets')->>'id')::uuid;
reset role;

alter table idem_fx add column m1 jsonb;
alter table idem_fx add column m2 jsonb;
alter table idem_fx add column m3 jsonb;
update idem_fx set
  m1 = (select jsonb_object_agg(v, jsonb_build_object('key', 'processed/'||asset1||'/'||attempt1||'/'||v||'.webp', 'sha256', repeat('1', 64), 'bytes', 200)) from unnest(array['thumb','card','full']) v),
  m2 = (select jsonb_object_agg(v, jsonb_build_object('key', 'processed/'||asset2||'/'||attempt2||'/'||v||'.webp', 'sha256', repeat('2', 64), 'bytes', 200)) from unnest(array['thumb','card','full']) v),
  m3 = (select jsonb_object_agg(v, jsonb_build_object('key', 'processed/'||asset3||'/'||attempt3||'/'||v||'.webp', 'sha256', repeat('3', 64), 'bytes', 200)) from unnest(array['thumb','card','full']) v);
grant select on idem_fx to service_role;

-- 1. First append with upload_key=key1 commits version 1 -> 2 and stores receipt.
set local role service_role;
select is(
  (select (public.save_listing_photo('11111111-1111-4111-8111-111111111111', listing_id, 1, asset1, attempt1, 'image/webp', 600, 800, 600, repeat('1', 64), m1, null, key1)->>'version')::integer from idem_fx),
  2,
  'initial idempotent upload attaches photo and advances version to 2'
);

-- 2. Receipt lookup returns matching committed asset and version for owner, and null for wrong owner.
select is(
  (select public.get_photo_upload_receipt('11111111-1111-4111-8111-111111111111', listing_id, key1)->>'id' from idem_fx),
  (select asset1::text from idem_fx),
  'get_photo_upload_receipt returns exact committed asset id'
);
select is(
  (select public.get_photo_upload_receipt('22222222-2222-4222-8222-222222222222', listing_id, key1) from idem_fx),
  null::jsonb,
  'get_photo_upload_receipt isolates receipts by owner'
);

-- 3. Replaying save_listing_photo with the SAME key1 and expected_version=1 (even with new generated asset2)
--    returns the ORIGINAL asset1 and version 2 with idempotent=true and creates ZERO duplicates!
select is(
  (select public.save_listing_photo('11111111-1111-4111-8111-111111111111', listing_id, 1, asset2, attempt2, 'image/webp', 600, 800, 600, repeat('2', 64), m2, null, key1) from idem_fx),
  (select jsonb_build_object('id', asset1, 'version', 2, 'idempotent', true) from idem_fx),
  'idempotent replay returns original asset and version without duplicating'
);
reset role;
select is(
  (select count(*)::integer from public.listing_media where listing_id = (select listing_id from idem_fx)),
  1,
  'idempotent replay leaves exactly one attached photo'
);
select is(
  (select version from public.listings where id = (select listing_id from idem_fx)),
  2,
  'idempotent replay does not double-increment listing version'
);
select ok(
  not exists(select 1 from public.media_assets where id = (select asset2 from idem_fx)),
  'idempotent replay does not insert duplicate media_assets row'
);

-- 4. Reusing key1 with a DIFFERENT expected_version or replace_photo_id fails with PT409!
set local role service_role;
select throws_ok(
  $$select public.save_listing_photo('11111111-1111-4111-8111-111111111111', listing_id, 2, asset2, attempt2, 'image/webp', 600, 800, 600, repeat('2', 64), m2, null, key1) from idem_fx$$,
  'PT409',
  null,
  'reusing upload_key with mismatched expected_version rejected with PT409'
);
select throws_ok(
  $$select public.save_listing_photo('11111111-1111-4111-8111-111111111111', listing_id, 1, asset2, attempt2, 'image/webp', 600, 800, 600, repeat('2', 64), m2, asset1, key1) from idem_fx$$,
  'PT409',
  null,
  'reusing upload_key with mismatched replace_photo_id rejected with PT409'
);

-- 5. Idempotent replacement: replacing asset1 with asset2 using key2 commits version 2 -> 3,
--    and replaying with key2 returns asset2 / version 3 without detaching asset2 or creating asset3!
select is(
  (select (public.save_listing_photo('11111111-1111-4111-8111-111111111111', listing_id, 2, asset2, attempt2, 'image/webp', 600, 800, 600, repeat('2', 64), m2, asset1, key2)->>'version')::integer from idem_fx),
  3,
  'replacement with upload_key succeeds and advances version to 3'
);
select is(
  (select public.save_listing_photo('11111111-1111-4111-8111-111111111111', listing_id, 2, asset3, attempt3, 'image/webp', 600, 800, 600, repeat('3', 64), m3, asset1, key2) from idem_fx),
  (select jsonb_build_object('id', asset2, 'version', 3, 'idempotent', true) from idem_fx),
  'replayed replacement returns original replacement asset2 idempotently'
);
reset role;
select is(
  (select media_id from public.listing_media where listing_id = (select listing_id from idem_fx)),
  (select asset2 from idem_fx),
  'replayed replacement preserves asset2 in slot 0'
);

-- 6. Backwards-compatible 12-argument call without p_upload_key still succeeds.
set local role service_role;
select is(
  (select (public.save_listing_photo('11111111-1111-4111-8111-111111111111', listing_id, 3, asset3, attempt3, 'image/webp', 600, 800, 600, repeat('3', 64), m3, null)->>'version')::integer from idem_fx),
  4,
  '12-argument save_listing_photo call remains backwards compatible'
);
reset role;
select is(
  (select count(*)::integer from public.listing_media where listing_id = (select listing_id from idem_fx)),
  2,
  '12-argument append attaches second photo cleanly'
);

select * from finish();
rollback;
