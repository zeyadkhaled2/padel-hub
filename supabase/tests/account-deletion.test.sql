-- Synthetic fixtures only; every test change rolls back.
-- Verifies migration 030 (authenticated account deletion requests),
-- the documented manual operator account deletion SQL (including all ON DELETE RESTRICT FKs),
-- and the corrected manual seller restoration DO-block (active/reserved/sold/traded + fail-closed audit).
begin;
create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

-- 1. Schema & least-privilege verification for private.account_deletion_requests
select ok(
 not has_table_privilege('anon', 'private.account_deletion_requests', 'SELECT')
 and not has_table_privilege('authenticated', 'private.account_deletion_requests', 'SELECT')
 and not has_table_privilege('public', 'private.account_deletion_requests', 'SELECT'),
 'zero direct table grants on private.account_deletion_requests'
);
select ok(
 not has_function_privilege('anon', 'public.get_my_account_deletion_request()', 'EXECUTE')
 and not has_function_privilege('anon', 'public.request_account_deletion(text)', 'EXECUTE')
 and has_function_privilege('authenticated', 'public.get_my_account_deletion_request()', 'EXECUTE')
 and has_function_privilege('authenticated', 'public.request_account_deletion(text)', 'EXECUTE'),
 'account deletion RPC execute grants restricted to authenticated only'
);

-- Seed verified users (seller with profile, bare user without profile, unverified user, reporter, admin)
insert into auth.users(id, email_confirmed_at, raw_user_meta_data) values
 ('11111111-1111-4111-8111-111111111111', now(), '{}'),
 ('22222222-2222-4222-8222-222222222222', now(), '{}'),
 ('33333333-3333-4333-8333-333333333333', null, '{}'),
 ('44444444-4444-4444-8444-444444444444', now(), '{}'),
 ('55555555-5555-4555-8555-555555555555', now(), '{}');
insert into private.admin_roles(user_id, role) values ('55555555-5555-4555-8555-555555555555', 'admin');

-- Helper to create ready media fixture and compute matching review_media_manifest
create function pg_temp.media_fixture(asset uuid, owner_uid uuid, purpose_arg text) returns void language plpgsql as $$
declare attempt uuid := gen_random_uuid(); manifest jsonb := '{}'; v text;
begin
 foreach v in array array['thumb','card','full'] loop
  manifest := manifest || jsonb_build_object(
   v,
   jsonb_build_object('key', 'processed/' || asset || '/' || attempt || '/' || v || '.webp', 'sha256', repeat('c', 64), 'bytes', 256)
  );
 end loop;
 insert into public.media_assets(
  id, owner_id, purpose, status, private_storage_path, input_mime_type,
  byte_size, width_px, height_px, exif_stripped, ready_attempt_id, ready_manifest, content_sha256
 ) values (
  asset, owner_uid, purpose_arg, 'ready', 'processed/' || asset || '/' || attempt || '/full.webp', 'image/jpeg',
  768, 800, 600, true, attempt, manifest, repeat('c', 64)
 );
end $$;

create function pg_temp.review_manifest(p_listing_id uuid) returns jsonb language sql as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'media_id', a.id,
  'sort_order', m.sort_order,
  'ready_attempt_id', a.ready_attempt_id,
  'content_sha256', a.content_sha256,
  'variants', a.ready_manifest
 ) order by m.sort_order), '[]'::jsonb)
 from public.listing_media m
 join public.media_assets a on a.id = m.media_id
 where m.listing_id = p_listing_id;
$$;

-- 2. Unverified and recovery sessions are denied (42501)
grant usage on schema extensions to anon, authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal1","session_id":"00000000-0000-4000-8000-000000000003","amr":[{"method":"password","timestamp":1795000000}]}';
select throws_ok($$select public.request_account_deletion('unverified')$$, '42501', null, 'unverified user cannot request deletion');
select throws_ok($$select public.get_my_account_deletion_request()$$, '42501', null, 'unverified user cannot read deletion status');

-- Recovery session (including aal2) denied
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2","session_id":"00000000-0000-4000-8000-000000000011","amr":[{"method":"otp","timestamp":1795000000},{"method":"totp","timestamp":1795000001}]}';
select throws_ok($$select public.request_account_deletion('recovery session')$$, '42501', null, 'recovery session cannot request deletion');
select throws_ok($$select public.get_my_account_deletion_request()$$, '42501', null, 'recovery session cannot read deletion status');

-- 3. Authenticated bare user (no seller_profiles row) can request deletion cleanly
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal1","session_id":"00000000-0000-4000-8000-000000000002","amr":[{"method":"password","timestamp":1795000000}]}';
select is(public.get_my_account_deletion_request(), null, 'bare user starts with no deletion request');
select throws_ok($$select public.request_account_deletion(repeat('x', 501))$$, '22023', null, 'reason > 500 chars rejected');
select is(
 (public.request_account_deletion('leaving pilot')->>'status'),
 'pending',
 'bare verified user without seller profile can submit deletion request'
);
select is(
 (public.request_account_deletion('leaving pilot')->>'profile_taken_offline')::boolean,
 false,
 'idempotent repeat call succeeds cleanly for bare user'
);
select is(
 (public.get_my_account_deletion_request()->>'status'),
 'pending',
 'bare user reads own pending deletion request'
);
reset role;

-- 4. Verified Seller 1 with public storefront, active/reserved/sold/traded listings, photos, avatar, idempotency receipt, report, metrics
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1","session_id":"00000000-0000-4000-8000-000000000001","amr":[{"method":"password","timestamp":1795000000}]}';
select ok(public.create_seller_profile('del_seller_one', 'Delete Seller One', 'cairo', 'individual') is not null, 'seller 1 created profile');
select ok(public.update_seller_profile(1, '{"is_public":true}'::jsonb) is not null, 'seller 1 enabled public profile');
select ok(public.update_my_contact(2, 1, '+201000000091', true) is not null, 'seller 1 enabled WhatsApp consent');
select is(public.get_my_account_deletion_request(), null, 'seller 1 cannot see bare user deletion request');
reset role;

-- Attach avatar, active listing + 3 photos + detached photo + idempotency receipt + daily metrics + rate limit + abuse report
select pg_temp.media_fixture('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'profile_avatar');
select pg_temp.media_fixture('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'listing_photo');
select pg_temp.media_fixture('aaaaaaaa-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'listing_photo');
select pg_temp.media_fixture('aaaaaaaa-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'listing_photo');
select pg_temp.media_fixture('aaaaaaaa-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'listing_photo');
update public.seller_profiles set avatar_media_id = 'aaaaaaaa-0000-4000-8000-000000000001' where user_id = '11111111-1111-4111-8111-111111111111';

insert into public.listings(
 id, seller_id, category, status, title, brand_slug, model, description, governorate_slug,
 condition, condition_disclosure, offer_type, price_egp, racket_damage_repair_disclosure,
 content_version, last_approved_content_version, approved_at, published_at
) values (
 'bbbbbbbb-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'rackets', 'active',
 'Deletion Test Racket', 'bullpadel', 'Vertex 04', 'Clean deletion test racket listing.', 'cairo',
 'used', 'Minor scuffs', 'sale', 5500, 'No cracks or repairs',
 1, 1, now(), now()
);
insert into public.listing_media(listing_id, owner_id, media_id, sort_order) values
 ('bbbbbbbb-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000002', 0),
 ('bbbbbbbb-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000003', 1),
 ('bbbbbbbb-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000004', 2);
insert into private.listing_moderation_state(listing_id, last_decision, decided_by, decided_at, reviewed_content_version, reviewed_media_manifest)
values (
 'bbbbbbbb-0000-4000-8000-000000000001', 'approved', '55555555-5555-4555-8555-555555555555', now(), 1,
 pg_temp.review_manifest('bbbbbbbb-0000-4000-8000-000000000001')
);
insert into private.photo_upload_idempotency(owner_id, listing_id, upload_key, expected_version, asset_id, resulting_version)
values ('11111111-1111-4111-8111-111111111111', 'bbbbbbbb-0000-4000-8000-000000000001', gen_random_uuid(), 1, 'aaaaaaaa-0000-4000-8000-000000000002', 2);
insert into private.listing_daily_metrics(listing_id, day, views, contacts)
values ('bbbbbbbb-0000-4000-8000-000000000001', current_date, 5, 2);
insert into private.rate_limit_windows(bucket_key, hit_count)
values ('photo:11111111-1111-4111-8111-111111111111', 3);
insert into private.abuse_reports(reporter_user_id, target_type, target_listing_id, reason_code, details)
values ('44444444-4444-4444-8444-444444444444', 'listing', 'bbbbbbbb-0000-4000-8000-000000000001', 'other', 'test report');

-- Confirm listing & profile are publicly visible BEFORE deletion request
select ok(public.get_public_listing('bbbbbbbb-0000-4000-8000-000000000001') is not null, 'listing visible publicly before deletion request');
select ok(public.get_public_profile('del_seller_one', 1) is not null, 'storefront visible publicly before deletion request');
select ok(public.get_listing_contact('bbbbbbbb-0000-4000-8000-000000000001') is not null, 'WhatsApp contact enabled before deletion request');
select ok(public.get_photo_delivery('aaaaaaaa-0000-4000-8000-000000000002', null, 'bbbbbbbb-0000-4000-8000-000000000001') is not null, 'public photo visible before deletion request');

-- Seller 1 submits authenticated deletion request -> immediately hidden publicly while preserving photos/listings
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1","session_id":"00000000-0000-4000-8000-000000000001","amr":[{"method":"password","timestamp":1795000000}]}';
select is(
 (public.request_account_deletion('Done selling')->>'profile_taken_offline')::boolean,
 true,
 'deletion request immediately takes public profile offline'
);
reset role;

select is((select is_public from public.seller_profiles where user_id = '11111111-1111-4111-8111-111111111111'), false, 'profile is_public set false');
select is((select public_contact_consent from public.seller_profiles where user_id = '11111111-1111-4111-8111-111111111111'), false, 'public_contact_consent set false');
select is(public.get_public_listing('bbbbbbbb-0000-4000-8000-000000000001'), null, 'listing immediately hidden after deletion request');
select is(public.get_public_profile('del_seller_one', 1), null, 'storefront immediately hidden after deletion request');
select is(public.resolve_public_profile((select public_id from public.seller_profiles where user_id = '11111111-1111-4111-8111-111111111111')), null, 'QR link immediately hidden after deletion request');
select is(public.get_listing_contact('bbbbbbbb-0000-4000-8000-000000000001'), null, 'WhatsApp contact immediately disabled after deletion request');
select is(public.get_photo_delivery('aaaaaaaa-0000-4000-8000-000000000002', null, 'bbbbbbbb-0000-4000-8000-000000000001'), null, 'public photo immediately hidden after deletion request');
select is((select count(*)::integer from public.media_assets where owner_id = '11111111-1111-4111-8111-111111111111'), 5, 'no photos auto-deleted by request_account_deletion');

-- 5. Verify exact documented Manual Account Deletion Operator SQL handles all ON DELETE RESTRICT FKs cleanly
select lives_ok($$
do $op$
declare
 v_user_id uuid := '11111111-1111-4111-8111-111111111111';
 v_operator_id uuid := '55555555-5555-4555-8555-555555555555';
 v_reason text := 'Pilot deletion test ticket #1';
 v_req private.account_deletion_requests;
 v_public_id uuid;
begin
 select * into v_req from private.account_deletion_requests where user_id = v_user_id and status = 'pending' for update;
 if not found then raise exception 'no pending request' using errcode = 'PT404'; end if;
 select public_id into v_public_id from public.seller_profiles where user_id = v_user_id for update;
 update public.seller_profiles set avatar_media_id = null where user_id = v_user_id and avatar_media_id is not null;
 delete from private.photo_upload_idempotency where owner_id = v_user_id;
 delete from public.listings where seller_id = v_user_id;
 delete from public.media_assets where owner_id = v_user_id;
 delete from private.rate_limit_windows where bucket_key = 'photo:' || v_user_id::text;
 insert into private.audit_logs (actor_user_id, actor_role, action, target_type, target_id, reason)
 values (v_operator_id, 'admin', 'account.deleted', 'account', coalesce(v_public_id, v_user_id)::text, btrim(v_reason));
 delete from auth.users where id = v_user_id;
 if not found then raise exception 'auth user missing' using errcode = 'PT404'; end if;
end $op$;
$$, 'documented manual account deletion SQL succeeds cleanly across all RESTRICT FKs and triggers');

select is((select count(*)::integer from auth.users where id = '11111111-1111-4111-8111-111111111111'), 0, 'auth user deleted');
select is((select count(*)::integer from public.seller_profiles where user_id = '11111111-1111-4111-8111-111111111111'), 0, 'seller profile cascaded');
select is((select count(*)::integer from private.seller_contacts where user_id = '11111111-1111-4111-8111-111111111111'), 0, 'seller contact cascaded');
select is((select count(*)::integer from public.listings where seller_id = '11111111-1111-4111-8111-111111111111'), 0, 'listings removed');
select is((select count(*)::integer from public.media_assets where owner_id = '11111111-1111-4111-8111-111111111111'), 0, 'media_assets removed');
select is((select count(*)::integer from private.account_deletion_requests where user_id = '11111111-1111-4111-8111-111111111111'), 0, 'deletion request cascaded');
select is((select count(*)::integer from private.audit_logs where action = 'account.deleted'), 1, 'non-personal completion audit log preserved');

-- 6. Verify corrected Manual Seller Restoration DO-block (all 4 statuses + fail-closed audit)
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated","aal":"aal1","session_id":"00000000-0000-4000-8000-000000000004","amr":[{"method":"password","timestamp":1795000000}]}';
select ok(public.create_seller_profile('restore_seller', 'Restore Seller', 'giza', 'individual') is not null, 'restore seller created');
select ok(public.update_seller_profile(1, '{"is_public":true}'::jsonb) is not null, 'restore seller public');
select ok(public.update_my_contact(2, 1, '+201000000094', true) is not null, 'restore seller WhatsApp enabled');
reset role;

-- Create 4 approved listings covering ALL FOUR potentially public statuses: active, reserved, sold, traded
do $$
declare
 st text;
 lid uuid;
 i integer := 0;
 m1 uuid; m2 uuid; m3 uuid;
begin
 foreach st in array array['active', 'reserved', 'sold', 'traded'] loop
  i := i + 1;
  lid := ('cccccccc-0000-4000-8000-00000000000' || i)::uuid;
  m1 := ('dddddddd-0000-4000-8000-0000000000' || i || '1')::uuid;
  m2 := ('dddddddd-0000-4000-8000-0000000000' || i || '2')::uuid;
  m3 := ('dddddddd-0000-4000-8000-0000000000' || i || '3')::uuid;
  perform pg_temp.media_fixture(m1, '44444444-4444-4444-8444-444444444444', 'listing_photo');
  perform pg_temp.media_fixture(m2, '44444444-4444-4444-8444-444444444444', 'listing_photo');
  perform pg_temp.media_fixture(m3, '44444444-4444-4444-8444-444444444444', 'listing_photo');
  insert into public.listings(
   id, seller_id, category, status, title, brand_slug, model, description, governorate_slug,
   condition, condition_disclosure, offer_type, price_egp, swap_preference, racket_damage_repair_disclosure,
   content_version, last_approved_content_version, approved_at, published_at
  ) values (
   lid, '44444444-4444-4444-8444-444444444444', 'rackets', st,
   'Status ' || st, 'head', 'Speed Pro', 'Restoration visibility check.', 'giza',
   'used', 'Good condition', 'both', 4500, 'Open to swap', 'No cracks',
   1, 1, now(), now()
  );
  insert into public.listing_media(listing_id, owner_id, media_id, sort_order) values
   (lid, '44444444-4444-4444-8444-444444444444', m1, 0),
   (lid, '44444444-4444-4444-8444-444444444444', m2, 1),
   (lid, '44444444-4444-4444-8444-444444444444', m3, 2);
  insert into private.listing_moderation_state(listing_id, last_decision, decided_by, decided_at, reviewed_content_version, reviewed_media_manifest)
  values (lid, 'approved', '55555555-5555-4555-8555-555555555555', now(), 1, pg_temp.review_manifest(lid));
 end loop;
end $$;

-- Suspend seller via direct update (version 3 -> 4)
update public.seller_profiles set account_status = 'suspended', version = version + 1 where user_id = '44444444-4444-4444-8444-444444444444';
select is(
 (select count(*)::integer from public.listings where seller_id = '44444444-4444-4444-8444-444444444444' and public.get_public_listing(id) is not null),
 0,
 'all 4 statuses (active/reserved/sold/traded) hidden while seller suspended'
);

-- Stale version fails closed AND inserts 0 audit rows!
select throws_ok($$
do $rst$
declare
 v_public_id uuid := (select public_id from public.seller_profiles where user_id = '44444444-4444-4444-8444-444444444444');
 v_expected_version integer := 999;
 v_before public.seller_profiles;
 v_after public.seller_profiles;
begin
 select * into v_before from public.seller_profiles where public_id = v_public_id for update;
 if not found then raise exception 'not found' using errcode = 'PT404'; end if;
 if v_before.account_status not in ('hidden', 'suspended') or v_before.version is distinct from v_expected_version then
  raise exception 'stale version' using errcode = 'PT409';
 end if;
 update public.seller_profiles set account_status = 'active', version = version + 1, updated_at = now()
 where user_id = v_before.user_id and version = v_expected_version and account_status in ('hidden', 'suspended')
 returning * into v_after;
 if not found then raise exception '0 rows' using errcode = 'PT409'; end if;
 insert into private.audit_logs(actor_user_id, actor_role, action, target_type, target_id, before_state, after_state, reason)
 values ('55555555-5555-4555-8555-555555555555', 'admin', 'profile.restored', 'profile', v_after.public_id::text,
  jsonb_build_object('account_status', v_before.account_status, 'version', v_before.version),
  jsonb_build_object('account_status', v_after.account_status, 'version', v_after.version),
  'Stale attempt');
end $rst$;
$$, 'PT409', null, 'restoration DO-block aborts on stale version');
select is((select count(*)::integer from private.audit_logs where action = 'profile.restored'), 0, 'failed restoration cannot record profile.restored audit row');

-- Matching version succeeds atomically, writes audit row, and re-exposes ALL FOUR statuses (active, reserved, sold, traded)
select lives_ok($$
do $rst$
declare
 v_public_id uuid := (select public_id from public.seller_profiles where user_id = '44444444-4444-4444-8444-444444444444');
 v_expected_version integer := (select version from public.seller_profiles where user_id = '44444444-4444-4444-8444-444444444444');
 v_before public.seller_profiles;
 v_after public.seller_profiles;
begin
 select * into v_before from public.seller_profiles where public_id = v_public_id for update;
 if not found then raise exception 'not found' using errcode = 'PT404'; end if;
 if v_before.account_status not in ('hidden', 'suspended') or v_before.version is distinct from v_expected_version then
  raise exception 'stale version' using errcode = 'PT409';
 end if;
 update public.seller_profiles set account_status = 'active', version = version + 1, updated_at = now()
 where user_id = v_before.user_id and version = v_expected_version and account_status in ('hidden', 'suspended')
 returning * into v_after;
 if not found then raise exception '0 rows' using errcode = 'PT409'; end if;
 insert into private.audit_logs(actor_user_id, actor_role, action, target_type, target_id, before_state, after_state, reason)
 values ('55555555-5555-4555-8555-555555555555', 'admin', 'profile.restored', 'profile', v_after.public_id::text,
  jsonb_build_object('account_status', v_before.account_status, 'version', v_before.version),
  jsonb_build_object('account_status', v_after.account_status, 'version', v_after.version),
  'Approved operator restoration');
end $rst$;
$$, 'restoration DO-block succeeds atomically with matching version');

select is((select count(*)::integer from private.audit_logs where action = 'profile.restored'), 1, 'successful restoration writes profile.restored audit row');
select is(
 (select count(*)::integer from public.listings where seller_id = '44444444-4444-4444-8444-444444444444' and public.get_public_listing(id) is not null),
 4,
 'restoring seller re-exposes all 4 potentially public statuses (active, reserved, sold, traded)'
);

select * from finish();
rollback;
