-- Phase UI-C regression coverage:
-- 1) Uniform 3-min / 4-max photo enforcement across rackets, balls, shoes, and bags
--    for 0, 1, 2, 3, 4, and 5 photos (draft save, submit, approve, 5th rejected, replacement at 4).
-- 2) Safe compatibility for legacy 5–6 photo listings (preserved without deletion,
--    post-approval lifecycle actions succeed, replacement works, new additions blocked).
-- 3) Enriched owner dashboard projection (`get_my_listings` & `get_my_photo_drafts`)
--    with cover thumbnail, photo_count, price, and owner-only rejection reasons.
begin;
create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
grant usage on schema extensions to authenticated, anon, service_role;

insert into auth.users(id, email_confirmed_at) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now()),
 ('11111111-1111-4111-8111-111111111111', now()),
 ('22222222-2222-4222-8222-222222222222', now());
insert into private.admin_roles(user_id, role) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'admin');
update public.platform_settings set individual_active_pending_limit = 50;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","session_id":"00000000-0000-4000-8000-000000000001","amr":[{"method":"password","timestamp":1795000000}]}';
select public.create_seller_profile('uic_seller', 'UI-C Seller', 'cairo');
select public.update_seller_profile(1, '{"is_public":true}');
select public.update_my_contact(2, 1, '+201000000077', true);
reset role;

-- Helper function inside rolled-back transaction to build valid manifest JSONB
create function pg_temp.manifest_for(asset uuid, attempt uuid) returns jsonb language sql as $$
 select jsonb_object_agg(
  v,
  jsonb_build_object(
   'key', 'processed/' || asset || '/' || attempt || '/' || v || '.webp',
   'sha256', repeat('c', 64),
   'bytes', 120
  )
 )
 from unnest(array['thumb', 'card', 'full']) v;
$$;
grant execute on function pg_temp.manifest_for(uuid, uuid) to authenticated, service_role;

create temp table matrix_state(category text primary key, listing_id uuid, ver integer, photo_1 uuid, photo_4 uuid, asset_5 uuid);
grant select, insert, update on matrix_state to authenticated, service_role;

-- 1. Exercise 0, 1, 2, 3, 4, and 5 photos across EVERY category: rackets, balls, shoes, bags
do $$
declare
 cat text;
 created jsonb;
 lid uuid;
 ver integer;
 patch jsonb;
 a_id uuid;
 att_id uuid;
 first_photo uuid;
 fourth_photo uuid;
 saved jsonb;
 review jsonb;
begin
 foreach cat in array array['rackets', 'balls', 'shoes', 'bags'] loop
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","session_id":"00000000-0000-4000-8000-000000000001","amr":[{"method":"password","timestamp":1795000000}]}', true);
  execute 'set local role authenticated';

  created := public.create_listing_draft(cat);
  lid := (created->>'id')::uuid;
  ver := (created->>'version')::integer;

  patch := jsonb_build_object(
   'title', 'Matrix ' || cat || ' listing',
   'brand_slug', 'head',
   'model', 'Pro Model',
   'description', 'Complete synthetic description for photo count testing.',
   'governorate_slug', 'cairo',
   'condition', 'used',
   'condition_disclosure', 'Clean lightly used condition',
   'offer_type', 'sale',
   'price_egp', 2200
  );
  if cat = 'rackets' then
   patch := patch || jsonb_build_object('racket_damage_repair_disclosure', 'No cracks or repairs');
  elsif cat = 'balls' then
   patch := patch || jsonb_build_object('balls_quantity_packaging', '3 pressurized balls');
  elsif cat = 'shoes' then
   patch := patch || jsonb_build_object('shoe_size_eu', 43.5);
  end if;

  -- 0 photos: draft save succeeds, submission blocked (23514)
  saved := public.update_listing_draft(lid, ver, patch);
  ver := (saved->>'version')::integer;
  begin
   perform public.submit_listing(lid, ver);
   raise exception '% submitted with 0 photos', cat;
  exception when sqlstate '23514' then null;
  end;

  -- Upload photo #1: draft retains 1 photo, submission blocked (23514)
  execute 'set local role service_role';
  a_id := gen_random_uuid(); att_id := gen_random_uuid();
  saved := public.save_listing_photo('11111111-1111-4111-8111-111111111111', lid, ver, a_id, att_id, 'image/webp', 360, 800, 600, repeat('c', 64), pg_temp.manifest_for(a_id, att_id));
  ver := (saved->>'version')::integer;
  first_photo := a_id;

  execute 'set local role authenticated';
  begin
   perform public.submit_listing(lid, ver);
   raise exception '% submitted with 1 photo', cat;
  exception when sqlstate '23514' then null;
  end;

  -- Upload photo #2: draft retains 2 photos, submission blocked (23514)
  execute 'set local role service_role';
  a_id := gen_random_uuid(); att_id := gen_random_uuid();
  saved := public.save_listing_photo('11111111-1111-4111-8111-111111111111', lid, ver, a_id, att_id, 'image/webp', 360, 800, 600, repeat('c', 64), pg_temp.manifest_for(a_id, att_id));
  ver := (saved->>'version')::integer;

  execute 'set local role authenticated';
  begin
   perform public.submit_listing(lid, ver);
   raise exception '% submitted with 2 photos', cat;
  exception when sqlstate '23514' then null;
  end;

  -- Upload photo #3: submission succeeds (3 photos valid)
  execute 'set local role service_role';
  a_id := gen_random_uuid(); att_id := gen_random_uuid();
  saved := public.save_listing_photo('11111111-1111-4111-8111-111111111111', lid, ver, a_id, att_id, 'image/webp', 360, 800, 600, repeat('c', 64), pg_temp.manifest_for(a_id, att_id));
  ver := (saved->>'version')::integer;

  execute 'set local role authenticated';
  saved := public.submit_listing(lid, ver);
  if saved->>'status' <> 'pending' then
   raise exception '% did not submit with 3 photos', cat;
  end if;
  ver := (saved->>'version')::integer;

  -- Withdraw back to draft, upload photo #4
  saved := public.withdraw_listing(lid, ver);
  ver := (saved->>'version')::integer;

  execute 'set local role service_role';
  a_id := gen_random_uuid(); att_id := gen_random_uuid();
  saved := public.save_listing_photo('11111111-1111-4111-8111-111111111111', lid, ver, a_id, att_id, 'image/webp', 360, 800, 600, repeat('c', 64), pg_temp.manifest_for(a_id, att_id));
  ver := (saved->>'version')::integer;
  fourth_photo := a_id;

  -- Attempt photo #5 via save_listing_photo: MUST fail with PT409
  a_id := gen_random_uuid(); att_id := gen_random_uuid();
  begin
   perform public.save_listing_photo('11111111-1111-4111-8111-111111111111', lid, ver, a_id, att_id, 'image/webp', 360, 800, 600, repeat('c', 64), pg_temp.manifest_for(a_id, att_id));
   raise exception '% accepted 5th photo via save_listing_photo', cat;
  exception when sqlstate 'PT409' then null;
  end;

  -- Attempt replacing photo #1 while at 4 photos: MUST succeed without exceeding 4
  a_id := gen_random_uuid(); att_id := gen_random_uuid();
  saved := public.save_listing_photo('11111111-1111-4111-8111-111111111111', lid, ver, a_id, att_id, 'image/webp', 360, 800, 600, repeat('c', 64), pg_temp.manifest_for(a_id, att_id), first_photo);
  ver := (saved->>'version')::integer;

  -- Submit and admin-approve with 4 photos
  execute 'set local role authenticated';
  saved := public.submit_listing(lid, ver);
  if saved->>'status' <> 'pending' then
   raise exception '% did not submit with 4 photos', cat;
  end if;
  ver := (saved->>'version')::integer;

  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","aal":"aal2","session_id":"00000000-0000-4000-8000-00000000000a","amr":[{"method":"password","timestamp":1795000000},{"method":"totp","timestamp":1795000001}]}', true);
  review := public.admin_get_listing_review(lid);
  saved := public.admin_approve_listing(
   lid,
   (review->'listing'->>'version')::integer,
   (review->'listing'->>'content_version')::integer,
   (review->'profile'->>'version')::integer,
   review->'media_manifest'
  );
  if saved->>'status' <> 'active' then
   raise exception '% did not approve with 4 photos', cat;
  end if;

  execute 'reset role';
  insert into matrix_state(category, listing_id, ver, photo_1, photo_4, asset_5)
  values (cat, lid, (saved->>'version')::integer, first_photo, fourth_photo, test_fixtures.asset('11111111-1111-4111-8111-111111111111'));
 end loop;
end $$;

select is((select count(*)::integer from matrix_state), 4, 'all four categories passed 0/1/2/3/4/5 + replacement + approval matrix');
select is(
 (select count(*)::integer from public.listing_media m join matrix_state ms on ms.listing_id = m.listing_id),
 16,
 'each of the 4 approved listings retains exactly 4 attached photos'
);
select is(
 (select count(*)::integer from public.media_assets a join matrix_state ms on ms.photo_1 = a.id),
 4,
 'replaced original photos remain preserved in media_assets across all categories'
);

-- Verify update_listing_draft rejects 5 p_media_ids (22023)
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","session_id":"00000000-0000-4000-8000-000000000001","amr":[{"method":"password","timestamp":1795000000}]}';
create temp table five_draft as select (public.create_listing_draft('bags')->>'id')::uuid as id;
grant select on five_draft to authenticated;
reset role;
create temp table five_assets as
 select array_agg(test_fixtures.asset('11111111-1111-4111-8111-111111111111')) as ids from generate_series(1, 5);
grant select on five_assets to authenticated;
set local role authenticated;
select throws_ok(
 $$select public.update_listing_draft((select id from five_draft), 1, '{}', (select ids from five_assets))$$,
 '22023',
 null,
 'update_listing_draft rejects attaching 5 photos'
);
select lives_ok(
 $$select public.update_listing_draft((select id from five_draft), 1, '{}', (select ids[1:4] from five_assets))$$,
 'update_listing_draft accepts attaching 4 photos'
);
reset role;

-- 2. Legacy 5–6 photo compatibility (existing listings preserved, lifecycle works, replacement works, no auto-deletion)
create temp table legacy_state(kind text primary key, listing_id uuid, slot5_media uuid);
grant select on legacy_state to authenticated, service_role;

do $$
declare
 l_active uuid := gen_random_uuid();
 l_draft uuid := gen_random_uuid();
 m_slot5 uuid;
 m_id uuid;
begin
 -- Flush any deferred constraint triggers from earlier matrix tests before altering triggers
 set constraints all immediate;
 -- Disable photo-count triggers strictly for historical pre-migration 6-photo row setup inside this rolled-back test
 alter table public.listings disable trigger listing_photo_count;
 alter table public.listing_media disable trigger attachment_photo_count;

 -- Simulate pre-existing 6-photo active listing (created before migration 025)
 insert into public.listings(
  id, seller_id, category, status, title, brand_slug, model, description,
  governorate_slug, condition, condition_disclosure, offer_type, price_egp,
  racket_damage_repair_disclosure, last_approved_content_version
 ) values (
  l_active, '11111111-1111-4111-8111-111111111111', 'rackets', 'active',
  'Legacy 6-photo Racket', 'bullpadel', 'Vertex', 'Pre-existing approved listing with six photos.',
  'cairo', 'used', 'Minor scuffs', 'sale', 4500, 'No repairs', 1
 );
 for s in 0..5 loop
  m_id := test_fixtures.asset('11111111-1111-4111-8111-111111111111');
  if s = 5 then m_slot5 := m_id; end if;
  insert into public.listing_media(listing_id, owner_id, media_id, sort_order)
  values (l_active, '11111111-1111-4111-8111-111111111111', m_id, s);
 end loop;

 alter table public.listings enable trigger listing_photo_count;
 alter table public.listing_media enable trigger attachment_photo_count;

 grant padelhub_review_writer to postgres;
 insert into private.listing_moderation_state(listing_id, last_decision, reviewed_content_version, reviewed_media_manifest)
 values (l_active, 'approved', 1, private.review_media_manifest(l_active));
 revoke padelhub_review_writer from postgres;

 -- Simulate pre-existing 5-photo draft listing
 insert into public.listings(
  id, seller_id, category, status, title, brand_slug, model, description,
  governorate_slug, condition, condition_disclosure, offer_type, price_egp,
  balls_quantity_packaging
 ) values (
  l_draft, '11111111-1111-4111-8111-111111111111', 'balls', 'draft',
  'Legacy 5-photo Balls Draft', 'head', 'Pro', 'Pre-existing draft with five photos.',
  'cairo', 'new', 'Sealed pack', 'sale', 250, '3 balls'
 );
 for s in 0..4 loop
  m_id := test_fixtures.asset('11111111-1111-4111-8111-111111111111');
  if s = 4 then
   insert into legacy_state(kind, listing_id, slot5_media) values ('legacy_draft', l_draft, m_id);
  end if;
  insert into public.listing_media(listing_id, owner_id, media_id, sort_order)
  values (l_draft, '11111111-1111-4111-8111-111111111111', m_id, s);
 end loop;
 insert into legacy_state(kind, listing_id, slot5_media) values ('legacy_active', l_active, m_slot5);
end $$;

-- Legacy active 6-photo listing delivers photo #6 and transitions cleanly to sold without losing photos
set local role service_role;
select ok(
 (select public.get_photo_delivery(slot5_media, null, listing_id) is not null from legacy_state where kind = 'legacy_active'),
 'legacy 6-photo active listing still delivers 6th photo publicly'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","session_id":"00000000-0000-4000-8000-000000000001","amr":[{"method":"password","timestamp":1795000000}]}';
select is(
 (select public.change_listing_status(listing_id, 1, 'sold')->>'status' from legacy_state where kind = 'legacy_active'),
 'sold',
 'legacy 6-photo active listing can be marked sold cleanly'
);
select is(
 (select jsonb_array_length(public.get_my_listing(listing_id)->'media_ids') from legacy_state where kind = 'legacy_active'),
 6,
 'legacy 6-photo listing retains all 6 photos after status transition'
);

-- Legacy 5-photo draft: text edit preserves 5 photos; adding 6th blocked; replacing slot 4 succeeds; submit blocked (>4)
select is(
 (select jsonb_array_length(public.update_listing_draft(listing_id, 1, '{"title":"Legacy 5-photo Edited"}')->'media_ids') from legacy_state where kind = 'legacy_draft'),
 5,
 'text edit on legacy 5-photo draft preserves all 5 photos'
);
select throws_ok(
 $$select public.submit_listing(listing_id, 2) from legacy_state where kind = 'legacy_draft'$$,
 '23514',
 null,
 'submitting legacy 5-photo draft is blocked under new 4-photo maximum'
);

set local role service_role;
select throws_ok(
 $$select public.save_listing_photo('11111111-1111-4111-8111-111111111111', listing_id, 2, gen_random_uuid(), gen_random_uuid(), 'image/webp', 360, 800, 600, repeat('c', 64), pg_temp.manifest_for(gen_random_uuid(), gen_random_uuid())) from legacy_state where kind = 'legacy_draft'$$,
 'PT409',
 null,
 'adding a 6th photo to legacy 5-photo draft is rejected'
);
do $$
declare
 lid uuid;
 target_media uuid;
 new_asset uuid := gen_random_uuid();
 new_attempt uuid := gen_random_uuid();
 res jsonb;
begin
 select listing_id, slot5_media into lid, target_media from legacy_state where kind = 'legacy_draft';
 res := public.save_listing_photo(
  '11111111-1111-4111-8111-111111111111', lid, 2, new_asset, new_attempt,
  'image/webp', 360, 800, 600, repeat('c', 64), pg_temp.manifest_for(new_asset, new_attempt), target_media
 );
 if (res->>'version')::integer <> 3 then
  raise exception 'legacy slot-4 replacement did not increment version';
 end if;
end $$;
reset role;
select is(
 (select count(*)::integer from public.listing_media where listing_id = (select listing_id from legacy_state where kind = 'legacy_draft')),
 5,
 'replacing slot 4 on legacy 5-photo draft keeps exact count 5 without consuming extra slot'
);

-- 3. Enriched get_my_listings() & get_my_photo_drafts() projection + rejection_reason & owner isolation
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","session_id":"00000000-0000-4000-8000-000000000001","amr":[{"method":"password","timestamp":1795000000}]}';
create temp table rejected_state as
 select (public.update_listing_draft((select id from five_draft), 2, '{"title":"Rejected Bag","brand_slug":"head","model":"Pro Bag","description":"Clean padel bag with thermal pockets.","governorate_slug":"cairo","condition":"used","condition_disclosure":"Light wear on strap","offer_type":"sale","price_egp":1850,"is_negotiable":true}')->>'id')::uuid as id;
grant select on rejected_state to authenticated;
select is((select public.submit_listing(id, 3)->>'status' from rejected_state), 'pending', 'bag with 4 photos submits');

set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","aal":"aal2","session_id":"00000000-0000-4000-8000-00000000000a","amr":[{"method":"password","timestamp":1795000000},{"method":"totp","timestamp":1795000001}]}';
do $$
declare
 lid uuid := (select id from rejected_state);
 rev jsonb;
begin
 rev := public.admin_get_listing_review(lid);
 perform public.admin_reject_listing(
  lid,
  (rev->'listing'->>'version')::integer,
  (rev->'listing'->>'content_version')::integer,
  (rev->'profile'->>'version')::integer,
  rev->'media_manifest',
  'Please show the inner compartments clearly.'
 );
end $$;

set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","session_id":"00000000-0000-4000-8000-000000000001","amr":[{"method":"password","timestamp":1795000000}]}';
select is(
 (
  select elem->>'rejection_reason'
  from jsonb_array_elements(public.get_my_listings()) elem
  where (elem->>'id')::uuid = (select id from rejected_state)
 ),
 'Please show the inner compartments clearly.',
 'get_my_listings exposes rejection_reason for rejected owner listings'
);
select is(
 (
  select (elem->>'photo_count')::integer
  from jsonb_array_elements(public.get_my_listings()) elem
  where (elem->>'id')::uuid = (select id from rejected_state)
 ),
 4,
 'get_my_listings exposes exact photo_count'
);
select is(
 (
  select (elem->>'price_egp')::integer
  from jsonb_array_elements(public.get_my_listings()) elem
  where (elem->>'id')::uuid = (select id from rejected_state)
 ),
 1850,
 'get_my_listings exposes price_egp'
);
select ok(
 (
  select (elem->>'cover_media_id') is not null
  from jsonb_array_elements(public.get_my_listings()) elem
  where (elem->>'id')::uuid = (select id from rejected_state)
 ),
 'get_my_listings exposes cover_media_id'
);
select ok(
 public.get_my_listings()::text not like '%201000000077%'
 and public.get_my_listings()::text not like '%processed/%',
 'get_my_listings never leaks phone numbers or storage paths'
);
select is(
 (
  select (elem->>'photo_count')::integer
  from jsonb_array_elements(public.get_my_photo_drafts()) elem
  where (elem->>'id')::uuid = (select id from rejected_state)
 ),
 4,
 'get_my_photo_drafts exposes exact photo_count for rejected drafts'
);

-- Another verified user sees zero listings from this owner
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","session_id":"00000000-0000-4000-8000-000000000002","amr":[{"method":"password","timestamp":1795000000}]}';
select is(jsonb_array_length(public.get_my_listings()), 0, 'other account cannot read enriched owner listings');
select is(jsonb_array_length(public.get_my_photo_drafts()), 0, 'other account cannot read enriched photo drafts');

-- 4. Migration 026: Safe photo detachment (no media_assets deletion) & legacy relist-to-draft reopen flow
-- 4a. Security checks: other owner denied on detach_listing_photo and reopen
select throws_ok(
 $$select public.detach_listing_photo(listing_id, 3, slot5_media) from legacy_state where kind = 'legacy_draft'$$,
 '42501',
 null,
 'other owner cannot detach photo from another seller draft'
);
select throws_ok(
 $$select public.change_listing_status(listing_id, 2, 'reopen') from legacy_state where kind = 'legacy_active'$$,
 '42501',
 null,
 'other owner cannot reopen another seller sold listing'
);

set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","session_id":"00000000-0000-4000-8000-000000000001","amr":[{"method":"password","timestamp":1795000000}]}';

-- 4b. Legacy 5-photo draft: stale version denied, detach slot-4 photo (5 -> 4), sort_order compacted 0..3, media_assets preserved, then submit succeeds!
select throws_ok(
 $$select public.detach_listing_photo(listing_id, 1, slot5_media) from legacy_state where kind = 'legacy_draft'$$,
 'PT409',
 null,
 'detach_listing_photo rejects stale listing version'
);
select throws_ok(
 $$select public.detach_listing_photo(listing_id, 3, gen_random_uuid()) from legacy_state where kind = 'legacy_draft'$$,
 'PT409',
 null,
 'detach_listing_photo rejects unattached media id'
);
do $$
declare
 lid uuid := (select listing_id from legacy_state where kind = 'legacy_draft');
 detached_id uuid;
 res jsonb;
begin
 -- Remember the current 5th attached photo (slot 4 was replaced earlier so read live slot 4 via owner RPC)
 detached_id := (public.get_my_listing(lid)->'media_ids'->>4)::uuid;
 res := public.detach_listing_photo(lid, 3, detached_id);
 if jsonb_array_length(res->'media_ids') <> 4 or (res->>'version')::integer <> 4 then
  raise exception 'expected 4 photos and version 4 after detaching 5th photo, got %', res;
 end if;
 -- Submit now succeeds cleanly under the new 3-4 rule!
 res := public.submit_listing(lid, 4);
 if res->>'status' <> 'pending' then
  raise exception 'trimmed legacy draft did not submit cleanly';
 end if;
end $$;
reset role;
select is(
 (select count(*)::integer from public.media_assets where owner_id = '11111111-1111-4111-8111-111111111111' and id in (select media_id from public.listing_media where listing_id = (select listing_id from legacy_state where kind = 'legacy_draft'))),
 4,
 'trimmed legacy draft has 4 attached ready photos'
);
select is(
 (select max(sort_order)::integer from public.listing_media where listing_id = (select listing_id from legacy_state where kind = 'legacy_draft')),
 3,
 'detach_listing_photo compacts remaining sort_order to 0..3'
);
-- Verify pending listing rejects detach_listing_photo
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","session_id":"00000000-0000-4000-8000-000000000001","amr":[{"method":"password","timestamp":1795000000}]}';
select throws_ok(
 $$select public.detach_listing_photo(listing_id, 5, (public.get_my_listing(listing_id)->'media_ids'->>0)::uuid) from legacy_state where kind = 'legacy_draft'$$,
 'PT409',
 null,
 'detach_listing_photo rejects pending listings until withdrawn'
);

-- 4c. Legacy 6-photo SOLD listing: direct relist fails & rolls back, reopen -> draft preserves all 6 photos, detach twice (6 -> 5 -> 4), all 6 media_assets retained, submit succeeds!
select throws_ok(
 $$select public.change_listing_status(listing_id, 2, 'relist') from legacy_state where kind = 'legacy_active'$$,
 '23514',
 null,
 'direct relist of legacy 6-photo sold listing is blocked by 3-4 photo rule'
);
select is(
 (select public.get_my_listing(listing_id)->>'status' from legacy_state where kind = 'legacy_active'),
 'sold',
 'failed relist of legacy 6-photo sold listing rolls back cleanly to sold'
);
select is(
 (select public.change_listing_status(listing_id, 2, 'reopen')->>'status' from legacy_state where kind = 'legacy_active'),
 'draft',
 'reopen transitions legacy 6-photo sold listing back to private draft'
);
select is(
 (select jsonb_array_length(public.get_my_listing(listing_id)->'media_ids') from legacy_state where kind = 'legacy_active'),
 6,
 'reopen preserves all 6 existing photos on legacy listing'
);
select throws_ok(
 $$select public.change_listing_status(listing_id, 3, 'reopen') from legacy_state where kind = 'legacy_active'$$,
 'PT409',
 null,
 'reopen rejects listings already in draft status'
);
do $$
declare
 lid uuid := (select listing_id from legacy_state where kind = 'legacy_active');
 first_detach uuid;
 second_detach uuid;
 res jsonb;
begin
 first_detach := (public.get_my_listing(lid)->'media_ids'->>5)::uuid;
 res := public.detach_listing_photo(lid, 3, first_detach);
 if jsonb_array_length(res->'media_ids') <> 5 then
  raise exception 'expected 5 photos after first detach from 6-photo draft';
 end if;
 second_detach := (res->'media_ids'->>4)::uuid;
 res := public.detach_listing_photo(lid, 4, second_detach);
 if jsonb_array_length(res->'media_ids') <> 4 then
  raise exception 'expected 4 photos after second detach from 6-photo draft';
 end if;
 res := public.submit_listing(lid, 5);
 if res->>'status' <> 'pending' then
  raise exception 'reopened and trimmed legacy 6-photo listing did not submit';
 end if;
end $$;
reset role;
select ok(
 exists(select 1 from public.media_assets where id = (select slot5_media from legacy_state where kind = 'legacy_active')),
 'detached 6th photo asset remains preserved in media_assets (never deleted)'
);

-- 4d. Legacy 1-photo ARCHIVED balls listing: direct relist fails & rolls back, reopen -> draft, attach 2 more photos (1 -> 3), submit succeeds!
create temp table legacy_one_photo(listing_id uuid primary key);
grant select on legacy_one_photo to authenticated, service_role;
do $$
declare
 lid uuid := gen_random_uuid();
begin
 set constraints all immediate;
 insert into public.listings(
  id, seller_id, category, status, title, brand_slug, model, description,
  governorate_slug, condition, condition_disclosure, offer_type, price_egp,
  balls_quantity_packaging
 ) values (
  lid, '11111111-1111-4111-8111-111111111111', 'balls', 'archived',
  'Legacy 1-photo Archived Balls', 'head', 'Pro', 'Older archived listing with one photo.',
  'cairo', 'new', 'Sealed', 'sale', 300, '3 balls'
 );
 insert into public.listing_media(listing_id, owner_id, media_id, sort_order)
 values (lid, '11111111-1111-4111-8111-111111111111', test_fixtures.asset('11111111-1111-4111-8111-111111111111'), 0);
 insert into legacy_one_photo(listing_id) values (lid);
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","session_id":"00000000-0000-4000-8000-000000000001","amr":[{"method":"password","timestamp":1795000000}]}';
select throws_ok(
 $$select public.change_listing_status(listing_id, 1, 'relist') from legacy_one_photo$$,
 '23514',
 null,
 'direct relist of legacy 1-photo archived listing is blocked by 3-photo minimum'
);
select is(
 (select public.change_listing_status(listing_id, 1, 'reopen')->>'status' from legacy_one_photo),
 'draft',
 'reopen transitions legacy 1-photo archived listing to draft so missing photos can be added'
);
do $$
declare
 lid uuid := (select listing_id from legacy_one_photo);
 ver integer := 2;
 a_id uuid;
 att_id uuid;
 res jsonb;
begin
 execute 'set local role service_role';
 for i in 1..2 loop
  a_id := gen_random_uuid(); att_id := gen_random_uuid();
  res := public.save_listing_photo('11111111-1111-4111-8111-111111111111', lid, ver, a_id, att_id, 'image/webp', 360, 800, 600, repeat('d', 64), pg_temp.manifest_for(a_id, att_id));
  ver := (res->>'version')::integer;
 end loop;
 execute 'set local role authenticated';
 res := public.submit_listing(lid, ver);
 if res->>'status' <> 'pending' then
  raise exception 'reopened legacy 1-photo listing did not submit after adding 2 photos';
 end if;
end $$;

reset role;
select * from finish();
rollback;
