-- Admin C: Seller management authorization, search/filtering/sorting/pagination,
-- detail inspection, account-type rules, listing allowances, suspension/hiding,
-- public/QR/contact/media revocation, retention of saved listings/photos, and audit records.
begin;
create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
grant usage on schema extensions to authenticated, anon, service_role;

insert into auth.users(id, email_confirmed_at) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now()),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', now()),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', null),
 ('11111111-1111-4111-8111-111111111111', now()),
 ('22222222-2222-4222-8222-222222222222', now()),
 ('33333333-3333-4333-8333-333333333333', now()),
 ('44444444-4444-4444-8444-444444444444', now());

insert into private.admin_roles(user_id, role) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'admin'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'moderator'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'admin');

-- Create 3 seller profiles (user 44444444... has an auth account with NO seller profile
-- to confirm seller profile counts never conflate auth accounts with seller profiles).
set local role authenticated;

set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1","session_id":"00000000-0000-4000-8000-000000000001","amr":[{"method":"password","timestamp":1795000000}]}';
select public.create_seller_profile('coach_cairo', 'Coach Cairo', 'cairo', 'individual');
select public.update_seller_profile(1, '{"is_public":true,"bio":"Synthetic coach bio","district_text":"Maadi","favorite_racket":"Vertex 04"}');
select public.update_my_contact(2, 1, '+201000000101', true);

set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal1","session_id":"00000000-0000-4000-8000-000000000002","amr":[{"method":"password","timestamp":1795000000}]}';
select public.create_seller_profile('insta_shop_giza', 'Padel Shop Giza', 'giza', 'business');
select public.update_seller_profile(1, '{"is_public":true}');
select public.update_my_contact(2, 1, '+201000000102', true);

set local request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal1","session_id":"00000000-0000-4000-8000-000000000003","amr":[{"method":"password","timestamp":1795000000}]}';
select public.create_seller_profile('private_alex', 'Private Alex Reseller', 'alexandria', 'individual');

reset role;

-- Store seller public IDs and listings in temp fixtures accessible to test roles.
create temp table seller_fx(tag text primary key, user_id uuid, public_id uuid);
insert into seller_fx(tag, user_id, public_id)
select
 case user_id
  when '11111111-1111-4111-8111-111111111111' then 'coach'
  when '22222222-2222-4222-8222-222222222222' then 'shop'
  else 'private'
 end,
 user_id,
 public_id
from public.seller_profiles;

-- Add listings:
-- coach: 1 pending (to approve -> public active) + 1 pending + 1 draft + 1 sold
-- shop: 6 active/pending listings (exceeds default individual limit of 5, fits business limit of 20)
create temp table listing_fx(tag text primary key, id uuid, asset_id uuid);
insert into listing_fx(tag, id) values
 ('coach_pub', test_fixtures.listing('11111111-1111-4111-8111-111111111111', 'pending')),
 ('coach_pending', test_fixtures.listing('11111111-1111-4111-8111-111111111111', 'pending')),
 ('coach_draft', test_fixtures.listing('11111111-1111-4111-8111-111111111111', 'draft')),
 ('coach_sold', test_fixtures.listing('11111111-1111-4111-8111-111111111111', 'sold')),
 ('shop_pub', test_fixtures.listing('22222222-2222-4222-8222-222222222222', 'pending'));
select test_fixtures.listing('22222222-2222-4222-8222-222222222222', 'pending') from generate_series(1, 5);

update listing_fx f
set asset_id = (select m.media_id from public.listing_media m where m.listing_id = f.id order by m.sort_order limit 1);

-- Add 30d engagement counters for coach_pub
insert into private.listing_daily_metrics(listing_id, day, views, contacts) values
 ((select id from listing_fx where tag = 'coach_pub'), (now() at time zone 'UTC')::date, 14, 3),
 ((select id from listing_fx where tag = 'coach_pub'), (now() at time zone 'UTC')::date - 30, 99, 99);

-- Deterministic timestamps for sorting checks
update public.seller_profiles set created_at = '2026-11-01T10:00:00Z', updated_at = '2026-11-05T10:00:00Z' where user_id = '11111111-1111-4111-8111-111111111111';
update public.seller_profiles set created_at = '2026-11-02T10:00:00Z', updated_at = '2026-11-04T10:00:00Z' where user_id = '22222222-2222-4222-8222-222222222222';
update public.seller_profiles set created_at = '2026-11-03T10:00:00Z', updated_at = '2026-11-06T10:00:00Z' where user_id = '33333333-3333-4333-8333-333333333333';

grant select on seller_fx, listing_fx to authenticated, anon, service_role;

-- 1. Authorization checks across all Admin C RPCs:
--    anon, ordinary seller, auth user without profile, unverified admin, admin aal1, recovery aal2.
set local role anon;
select throws_ok($$select public.admin_seller_inventory()$$, '42501', null, 'anon denied admin_seller_inventory');
select throws_ok($$select public.admin_seller_detail((select public_id from seller_fx where tag='coach'))$$, '42501', null, 'anon denied admin_seller_detail');
select throws_ok($$select public.admin_update_seller_account_type((select public_id from seller_fx where tag='coach'), 3, 'business', 'reason')$$, '42501', null, 'anon denied admin_update_seller_account_type');
select throws_ok($$select public.admin_update_seller_listing_limit((select public_id from seller_fx where tag='coach'), 3, 10, 'reason')$$, '42501', null, 'anon denied admin_update_seller_listing_limit');
select throws_ok($$select public.admin_moderate_seller_status((select public_id from seller_fx where tag='coach'), 3, 'suspended', 'reason')$$, '42501', null, 'anon denied admin_moderate_seller_status');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2","session_id":"00000000-0000-4000-8000-000000000001","amr":[{"method":"password","timestamp":1795000000},{"method":"totp","timestamp":1795000001}],"user_metadata":{"role":"admin"}}';
select throws_ok($$select public.admin_seller_inventory()$$, '42501', null, 'ordinary seller with spoofed metadata denied admin_seller_inventory');
select throws_ok($$select public.admin_seller_detail((select public_id from seller_fx where tag='coach'))$$, '42501', null, 'ordinary seller denied admin_seller_detail');
select throws_ok($$select public.admin_update_seller_account_type((select public_id from seller_fx where tag='coach'), 3, 'business', 'reason')$$, '42501', null, 'ordinary seller denied admin_update_seller_account_type');
select throws_ok($$select public.admin_update_seller_listing_limit((select public_id from seller_fx where tag='coach'), 3, 10, 'reason')$$, '42501', null, 'ordinary seller denied admin_update_seller_listing_limit');
select throws_ok($$select public.admin_moderate_seller_status((select public_id from seller_fx where tag='coach'), 3, 'suspended', 'reason')$$, '42501', null, 'ordinary seller denied admin_moderate_seller_status');

set local request.jwt.claims = '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated","aal":"aal2","session_id":"00000000-0000-4000-8000-00000000000c","amr":[{"method":"password","timestamp":1795000000},{"method":"totp","timestamp":1795000001}]}';
select throws_ok($$select public.admin_seller_inventory()$$, '42501', null, 'unverified admin denied admin_seller_inventory');
select throws_ok($$select public.admin_moderate_seller_status((select public_id from seller_fx where tag='coach'), 3, 'hidden', 'reason')$$, '42501', null, 'unverified admin denied admin_moderate_seller_status');

set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","aal":"aal1","session_id":"00000000-0000-4000-8000-00000000000a","amr":[{"method":"password","timestamp":1795000000}]}';
select throws_ok($$select public.admin_seller_inventory()$$, '42501', null, 'admin without MFA denied admin_seller_inventory');
select throws_ok($$select public.admin_seller_detail((select public_id from seller_fx where tag='coach'))$$, '42501', null, 'admin without MFA denied admin_seller_detail');
select throws_ok($$select public.admin_update_seller_account_type((select public_id from seller_fx where tag='coach'), 3, 'business', 'reason')$$, '42501', null, 'admin without MFA denied admin_update_seller_account_type');
select throws_ok($$select public.admin_update_seller_listing_limit((select public_id from seller_fx where tag='coach'), 3, 10, 'reason')$$, '42501', null, 'admin without MFA denied admin_update_seller_listing_limit');
select throws_ok($$select public.admin_moderate_seller_status((select public_id from seller_fx where tag='coach'), 3, 'suspended', 'reason')$$, '42501', null, 'admin without MFA denied admin_moderate_seller_status');

set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","aal":"aal2","session_id":"00000000-0000-4000-8000-000000000099","amr":[{"method":"otp","timestamp":1795000000},{"method":"totp","timestamp":1795000001}]}';
select throws_ok($$select public.admin_seller_inventory()$$, '42501', null, 'admin recovery aal2 session denied admin_seller_inventory');
select throws_ok($$select public.admin_update_seller_listing_limit((select public_id from seller_fx where tag='coach'), 3, 10, 'reason')$$, '42501', null, 'admin recovery aal2 session denied admin_update_seller_listing_limit');

-- 2. Verified MFA admin: approve coach_pub and shop_pub so public/media/contact/QR tests are real.
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","aal":"aal2","session_id":"00000000-0000-4000-8000-00000000000a","amr":[{"method":"password","timestamp":1795000000},{"method":"totp","timestamp":1795000001}]}';

select lives_ok($$
 select public.admin_approve_listing(
  (select id from listing_fx where tag='coach_pub'), 1, 1, 3,
  public.admin_get_listing_review((select id from listing_fx where tag='coach_pub'))->'media_manifest'
 )
$$, 'approve coach listing');

select lives_ok($$
 select public.admin_approve_listing(
  (select id from listing_fx where tag='shop_pub'), 1, 1, 3,
  public.admin_get_listing_review((select id from listing_fx where tag='shop_pub'))->'media_manifest'
 )
$$, 'approve shop listing');

-- 3. Inventory counts, search, combined filters, sorting, and input validation.
select is((public.admin_seller_inventory()->'counts'->>'total')::integer, 3, 'counts only seller_profiles, excluding auth users without profiles');
select is((public.admin_seller_inventory()->'counts'->>'individual')::integer, 2, 'individual profile count exact');
select is((public.admin_seller_inventory()->'counts'->>'business')::integer, 1, 'business profile count exact');
select is((public.admin_seller_inventory()->'counts'->>'active')::integer, 3, 'active profile count exact');
select is((public.admin_seller_inventory()->'counts'->>'suspended')::integer, 0, 'suspended profile count exact');
select is((public.admin_seller_inventory()->'counts'->>'hidden')::integer, 0, 'hidden profile count exact');
select is((public.admin_seller_inventory()->'defaults'->>'individual')::integer, 5, 'reads individual default from platform_settings');
select is((public.admin_seller_inventory()->'defaults'->>'business')::integer, 20, 'reads business default from platform_settings');

-- Search: display name, username, @username, exact public_id, literal wildcards
select is((public.admin_seller_inventory(p_query => 'Coach Cairo')->>'total')::integer, 1, 'display name search');
select is((public.admin_seller_inventory(p_query => 'INSTA_SHOP')->>'total')::integer, 1, 'case-insensitive username search');
select is((public.admin_seller_inventory(p_query => '@coach_cairo')->>'total')::integer, 1, '@username search');
select is((public.admin_seller_inventory(p_query => (select public_id::text from seller_fx where tag='private'))->>'total')::integer, 1, 'exact public_id search');
select is((public.admin_seller_inventory(p_query => '%')->>'total')::integer, 0, 'wildcards treated literally');
select ok(public.admin_seller_inventory()::text not like '%201000000101%', 'inventory never leaks WhatsApp number');
select ok(public.admin_seller_inventory()::text not like '%11111111-1111-4111-8111-111111111111%', 'inventory never leaks auth user_id');

-- Combined filters
select is((public.admin_seller_inventory(p_account_type => 'business', p_governorate => 'giza', p_visibility => 'public', p_account_status => 'active')->>'total')::integer, 1, 'combined filters match shop');
select is((public.admin_seller_inventory(p_visibility => 'private')->>'total')::integer, 1, 'private visibility filter');
select is((public.admin_seller_inventory(p_account_type => 'business', p_visibility => 'private')->>'total')::integer, 0, 'empty combined filters return 0');

-- Sorting: newest, updated, activity
select is(public.admin_seller_inventory(p_sort => 'newest')->'items'->0->>'username', 'private_alex', 'newest sorts by created_at desc');
select is(public.admin_seller_inventory(p_sort => 'updated')->'items'->0->>'username', 'private_alex', 'updated sorts by updated_at desc');
select is(public.admin_seller_inventory(p_sort => 'activity')->'items'->0->>'username', 'insta_shop_giza', 'activity sorts highest active+pending first');
select is(public.admin_seller_inventory(p_sort => 'activity')->'items'->1->>'username', 'coach_cairo', 'activity sorts second-highest active+pending second');

-- Input validation bounds
select throws_ok($$select public.admin_seller_inventory(p_query => repeat('x', 121))$$, '22023', null, 'query >120 chars rejected');
select throws_ok($$select public.admin_seller_inventory(p_account_type => 'admin')$$, '22023', null, 'invalid account type rejected');
select throws_ok($$select public.admin_seller_inventory(p_account_status => 'banned')$$, '22023', null, 'invalid account status rejected');
select throws_ok($$select public.admin_seller_inventory(p_governorate => 'mars')$$, '22023', null, 'invalid governorate rejected');
select throws_ok($$select public.admin_seller_inventory(p_visibility => 'hidden')$$, '22023', null, 'invalid visibility rejected');
select throws_ok($$select public.admin_seller_inventory(p_sort => 'name')$$, '22023', null, 'invalid sort rejected');
select throws_ok($$select public.admin_seller_inventory(p_page => 0)$$, '22023', null, 'page 0 rejected');
select throws_ok($$select public.admin_seller_inventory(p_page => 10001)$$, '22023', null, 'page >10000 rejected');

-- 4. Admin B exact seller_public_id filter & inspection link
select is((public.admin_listing_inventory(p_seller_public_id => (select public_id from seller_fx where tag='coach'))->>'total')::integer, 4, 'Admin B exact seller filter returns only coach listings');
select is((public.admin_listing_inventory(p_seller_public_id => (select public_id from seller_fx where tag='shop'))->>'total')::integer, 6, 'Admin B exact seller filter returns only shop listings');
select is(public.admin_listing_inventory(p_seller_public_id => (select public_id from seller_fx where tag='coach'))->'filtered_seller'->>'username', 'coach_cairo', 'Admin B returns filtered_seller metadata');
select is(public.admin_listing_inspection((select id from listing_fx where tag='coach_pub'))->'inspection'->>'seller_public_id', (select public_id::text from seller_fx where tag='coach'), 'Admin B inspection exposes seller_public_id');

-- 5. Seller detail inspection
select is(public.admin_seller_detail(gen_random_uuid()), null, 'unknown seller public_id returns null for authorized admin');
select is((public.admin_seller_detail((select public_id from seller_fx where tag='coach'))->'allowance'->>'used_count')::integer, 2, 'coach active+pending usage exact');
select is((public.admin_seller_detail((select public_id from seller_fx where tag='coach'))->'allowance'->>'remaining_count')::integer, 3, 'coach remaining capacity exact');
select is((public.admin_seller_detail((select public_id from seller_fx where tag='coach'))->'listing_counts'->>'draft')::integer, 1, 'coach draft count exact');
select is((public.admin_seller_detail((select public_id from seller_fx where tag='coach'))->'listing_counts'->>'sold')::integer, 1, 'coach sold count exact');
select is((public.admin_seller_detail((select public_id from seller_fx where tag='coach'))->'listing_counts'->>'public_visible')::integer, 1, 'coach public_visible count exact');
select is((public.admin_seller_detail((select public_id from seller_fx where tag='coach'))->'engagement_30d'->>'views')::integer, 14, 'coach 30d views exact and excludes day-30');
select is((public.admin_seller_detail((select public_id from seller_fx where tag='coach'))->'engagement_30d'->>'contacts')::integer, 3, 'coach 30d contacts exact');
select ok(public.admin_seller_detail((select public_id from seller_fx where tag='coach'))::text not like '%201000000101%', 'detail never leaks WhatsApp number');
select ok(public.admin_seller_detail((select public_id from seller_fx where tag='coach'))::text not like '%11111111-1111-4111-8111-111111111111%', 'detail never leaks auth user_id');

-- 6. Account-type management & downgrade capacity protection
select throws_ok($$select public.admin_update_seller_account_type((select public_id from seller_fx where tag='shop'), 3, 'individual', '')$$, '22023', null, 'account-type change requires reason');
select throws_ok($$select public.admin_update_seller_account_type((select public_id from seller_fx where tag='shop'), 2, 'individual', 'Stale version test')$$, 'PT409', null, 'stale version rejected on account-type change');
select throws_ok($$select public.admin_update_seller_account_type((select public_id from seller_fx where tag='shop'), 3, 'business', 'No-op test')$$, '22023', null, 'no-op account-type change rejected');
select throws_ok($$select public.admin_update_seller_account_type((select public_id from seller_fx where tag='shop'), 3, 'individual', 'Over-capacity downgrade')$$, 'PT409', null, 'downgrade below active+pending usage (6 > 5) rejected');

-- Valid upgrade: coach individual -> business (version 3 -> 4)
select is(public.admin_update_seller_account_type((select public_id from seller_fx where tag='coach'), 3, 'business', 'Pilot academy account')->>'account_type', 'business', 'coach upgraded to business');
select is((public.admin_seller_detail((select public_id from seller_fx where tag='coach'))->'allowance'->>'effective_limit')::integer, 20, 'effective limit reflects business default from platform_settings');
-- Valid downgrade back to individual when usage (2) <= 5 (version 4 -> 5)
select is(public.admin_update_seller_account_type((select public_id from seller_fx where tag='coach'), 4, 'individual', 'Reverted to personal')->>'version', '5', 'valid downgrade succeeds when usage fits');

-- 7. Listing allowance overrides: custom, 0, invalid/excessive, capacity check, reset-to-default, dynamic platform_settings
select throws_ok($$select public.admin_update_seller_listing_limit((select public_id from seller_fx where tag='coach'), 5, -1, 'Negative')$$, '22023', null, 'negative allowance rejected');
select throws_ok($$select public.admin_update_seller_listing_limit((select public_id from seller_fx where tag='coach'), 5, 501, 'Excessive')$$, '22023', null, 'excessive allowance >500 rejected');
select throws_ok($$select public.admin_update_seller_listing_limit((select public_id from seller_fx where tag='coach'), 5, 10, '   ')$$, '22023', null, 'blank reason rejected on allowance update');
select throws_ok($$select public.admin_update_seller_listing_limit((select public_id from seller_fx where tag='coach'), 4, 10, 'Stale')$$, 'PT409', null, 'stale version rejected on allowance update');
select throws_ok($$select public.admin_update_seller_listing_limit((select public_id from seller_fx where tag='coach'), 5, 1, 'Below usage')$$, 'PT409', null, 'cannot reduce allowance below current active+pending usage (2 > 1)');
select throws_ok($$select public.admin_update_seller_listing_limit((select public_id from seller_fx where tag='coach'), 5, 0, 'Zero with usage')$$, 'PT409', null, 'zero allowance rejected when seller has active+pending usage');

-- Valid zero allowance when usage = 0 (private_alex has 0 listings, version 1 -> 2)
select is((public.admin_update_seller_listing_limit((select public_id from seller_fx where tag='private'), 1, 0, 'Zero allowance for onboarding hold')->>'effective_limit')::integer, 0, 'zero allowance accepted when usage is 0');
-- Reset private_alex to default (version 2 -> 3)
select is((public.admin_update_seller_listing_limit((select public_id from seller_fx where tag='private'), 2, null, 'Restore default allowance')->>'effective_limit')::integer, 5, 'reset to default restores individual default');

-- Custom allowance on shop (usage=6): set to 8 (v3 -> v4), then downgrade shop to individual succeeds because override=8 >= 6 (v4 -> v5),
-- then trying to reset shop override to NULL fails because individual default 5 < 6 usage!
select is((public.admin_update_seller_listing_limit((select public_id from seller_fx where tag='shop'), 3, 8, 'Temporary pilot cap')->>'effective_limit')::integer, 8, 'custom allowance set to 8');
select is(public.admin_update_seller_account_type((select public_id from seller_fx where tag='shop'), 4, 'individual', 'Personal with custom override')->>'effective_limit', '8', 'downgrade permitted when custom override covers usage');
select throws_ok($$select public.admin_update_seller_listing_limit((select public_id from seller_fx where tag='shop'), 5, null, 'Reset below usage')$$, 'PT409', null, 'reset to default rejected if default is below current usage');

-- Dynamic platform_settings verification: defaults come from platform_settings, not hardcoded 5/20
reset role;
update public.platform_settings set individual_active_pending_limit = 7, business_active_pending_limit = 25;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","aal":"aal2","session_id":"00000000-0000-4000-8000-00000000000a","amr":[{"method":"password","timestamp":1795000000},{"method":"totp","timestamp":1795000001}]}';
select is((public.admin_seller_detail((select public_id from seller_fx where tag='coach'))->'allowance'->>'default_limit')::integer, 7, 'reads updated individual default dynamically from platform_settings');
select is((public.admin_seller_detail((select public_id from seller_fx where tag='coach'))->'allowance'->>'business_default')::integer, 25, 'reads updated business default dynamically from platform_settings');
reset role;
update public.platform_settings set individual_active_pending_limit = 5, business_active_pending_limit = 20;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","aal":"aal2","session_id":"00000000-0000-4000-8000-00000000000a","amr":[{"method":"password","timestamp":1795000000},{"method":"totp","timestamp":1795000001}]}';

-- 8. Seller moderation: hiding & suspension, no reactivation, public/QR/contact/media revocation, data preservation
-- Verify coach is publicly visible BEFORE moderation
select ok(public.get_public_profile('coach_cairo') is not null, 'coach public profile visible before hiding');
select is(public.resolve_public_profile((select public_id from seller_fx where tag='coach')), 'coach_cairo', 'coach QR resolves before hiding');
select ok(public.get_public_listing((select id from listing_fx where tag='coach_pub')) is not null, 'coach public listing visible before hiding');

set local role service_role;
select ok(public.get_listing_contact((select id from listing_fx where tag='coach_pub')) is not null, 'coach contact available before hiding');
select ok(public.get_photo_delivery((select asset_id from listing_fx where tag='coach_pub'), null, (select id from listing_fx where tag='coach_pub')) is not null, 'coach public photo available before hiding');

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","aal":"aal2","session_id":"00000000-0000-4000-8000-00000000000a","amr":[{"method":"password","timestamp":1795000000},{"method":"totp","timestamp":1795000001}]}';

-- Reject invalid statuses (including 'active' reactivation), empty reason, stale version
select throws_ok($$select public.admin_moderate_seller_status((select public_id from seller_fx where tag='coach'), 5, 'active', 'Try reactivate')$$, '22023', null, 'reactivation to active denied by RPC');
select throws_ok($$select public.admin_moderate_seller_status((select public_id from seller_fx where tag='coach'), 5, 'hidden', '')$$, '22023', null, 'moderation requires reason');
select throws_ok($$select public.admin_moderate_seller_status((select public_id from seller_fx where tag='coach'), 4, 'hidden', 'Stale')$$, 'PT409', null, 'stale version rejected on moderation');

-- Hide coach (v5 -> v6)
select is(public.admin_moderate_seller_status((select public_id from seller_fx where tag='coach'), 5, 'hidden', 'Temporarily hidden during onboarding check')->>'account_status', 'hidden', 'coach hidden successfully');
select is(public.get_public_profile('coach_cairo'), null, 'hidden seller public profile revoked');
select is(public.resolve_public_profile((select public_id from seller_fx where tag='coach')), null, 'hidden seller QR route revoked');
select is(public.get_public_listing((select id from listing_fx where tag='coach_pub')), null, 'hidden seller listing detail revoked');
select is((public.search_public_listings(p_query => 'Synthetic balls')->>'total')::integer, 1, 'hidden seller excluded from public marketplace search (only shop remains)');

set local role service_role;
select is(public.get_listing_contact((select id from listing_fx where tag='coach_pub')), null, 'hidden seller WhatsApp contact revoked');
select is(public.get_photo_delivery((select asset_id from listing_fx where tag='coach_pub'), null, (select id from listing_fx where tag='coach_pub')), null, 'hidden seller public photo delivery revoked');
select ok(public.get_photo_delivery((select asset_id from listing_fx where tag='coach_pub'), '11111111-1111-4111-8111-111111111111', null) is not null, 'hidden seller retains private owner photo access');

-- Escalate hidden -> suspended (v6 -> v7) and reject suspended -> hidden and suspended -> active
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","aal":"aal2","session_id":"00000000-0000-4000-8000-00000000000a","amr":[{"method":"password","timestamp":1795000000},{"method":"totp","timestamp":1795000001}]}';
select is(public.admin_moderate_seller_status((select public_id from seller_fx where tag='coach'), 6, 'suspended', 'Escalated to suspension')->>'account_status', 'suspended', 'hidden seller escalated to suspended');
select throws_ok($$select public.admin_moderate_seller_status((select public_id from seller_fx where tag='coach'), 7, 'hidden', 'Soften suspension')$$, 'PT409', null, 'suspended seller cannot be downgraded to hidden');
select throws_ok($$select public.admin_moderate_seller_status((select public_id from seller_fx where tag='coach'), 7, 'active', 'Reactivate')$$, '22023', null, 'suspended seller cannot be reactivated via RPC');

-- Suspend shop directly from active (v5 -> v6) and check all public surfaces revoked
select is(public.admin_moderate_seller_status((select public_id from seller_fx where tag='shop'), 5, 'suspended', 'Suspended shop for policy check')->>'account_status', 'suspended', 'active seller suspended directly');
select is(public.get_public_profile('insta_shop_giza'), null, 'suspended seller public profile revoked');
select is(public.resolve_public_profile((select public_id from seller_fx where tag='shop')), null, 'suspended seller QR route revoked');
select is(public.get_public_listing((select id from listing_fx where tag='shop_pub')), null, 'suspended seller listing detail revoked');
select is((public.search_public_listings(p_query => 'Synthetic balls')->>'total')::integer, 0, 'suspended seller excluded from public marketplace search');

set local role service_role;
select is(public.get_listing_contact((select id from listing_fx where tag='shop_pub')), null, 'suspended seller WhatsApp contact revoked');
select is(public.get_photo_delivery((select asset_id from listing_fx where tag='shop_pub'), null, (select id from listing_fx where tag='shop_pub')), null, 'suspended seller public photo delivery revoked');

-- Verify saved listings, statuses, photos, is_public, public_contact_consent, and audit records are preserved intact
reset role;
select is((select status from public.listings where id = (select id from listing_fx where tag='coach_pub')), 'active', 'listing lifecycle status preserved without silent mutation');
select is((select is_public from public.seller_profiles where user_id = '11111111-1111-4111-8111-111111111111'), true, 'is_public preference preserved without silent mutation');
select is((select public_contact_consent from public.seller_profiles where user_id = '11111111-1111-4111-8111-111111111111'), true, 'public_contact_consent preserved without silent mutation');
select is((select count(*)::integer from public.listing_media where listing_id = (select id from listing_fx where tag='coach_pub')), 3, 'attached photos retained after suspension');
select is((select count(*)::integer from private.audit_logs where target_type = 'profile' and target_id = (select public_id::text from seller_fx where tag='coach') and action = 'profile.account_type_updated'), 2, 'account-type audit records captured');
select is((select count(*)::integer from private.audit_logs where target_type = 'profile' and target_id = (select public_id::text from seller_fx where tag='private') and action = 'profile.listing_limit_updated'), 1, 'listing-limit update audit record captured');
select is((select count(*)::integer from private.audit_logs where target_type = 'profile' and target_id = (select public_id::text from seller_fx where tag='private') and action = 'profile.listing_limit_reset'), 1, 'listing-limit reset audit record captured');
select is((select count(*)::integer from private.audit_logs where target_type = 'profile' and target_id = (select public_id::text from seller_fx where tag='coach') and action = 'profile.hidden'), 1, 'profile hidden audit record captured');
select is((select count(*)::integer from private.audit_logs where target_type = 'profile' and target_id = (select public_id::text from seller_fx where tag='coach') and action = 'profile.suspended'), 1, 'profile suspended audit record captured');

-- Verify Admin A overview resolves target_label = '@username' for new Admin C audit events and reports updated seller counts
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","aal":"aal2","session_id":"00000000-0000-4000-8000-00000000000a","amr":[{"method":"password","timestamp":1795000000},{"method":"totp","timestamp":1795000001}]}';
select is((public.admin_dashboard_overview()->'kpis'->>'sellers_suspended')::integer, 2, 'Admin A overview reflects suspended sellers');
select is(public.admin_dashboard_overview()->'recent_activity'->0->>'action', 'profile.suspended', 'Admin A recent activity surfaces Admin C action');
select is(public.admin_dashboard_overview()->'recent_activity'->0->>'target_label', '@insta_shop_giza', 'Admin A recent activity resolves @username via public_id');
select ok(jsonb_array_length(public.admin_seller_detail((select public_id from seller_fx where tag='coach'))->'recent_activity') >= 4, 'seller detail includes profile and listing moderation history');
select ok((public.admin_seller_detail((select public_id from seller_fx where tag='coach'))->'listing_counts'->>'public_visible')::integer = 0, 'seller detail public_visible drops to 0 after suspension');

-- Verify pagination across >24 sellers (27 total) without page overlap
reset role;
do $$
declare i integer; uid uuid;
begin
 for i in 1..24 loop
  uid := gen_random_uuid();
  insert into auth.users(id, email_confirmed_at) values (uid, now());
  insert into public.seller_profiles(user_id, username, display_name, governorate_slug)
  values (uid, 'bulk_seller_' || i, 'Bulk Seller ' || i, 'cairo');
  insert into public.username_registry(username_lower, kind, user_id)
  values ('bulk_seller_' || i, 'active_profile', uid);
  insert into private.seller_contacts(user_id) values (uid);
 end loop;
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","aal":"aal2","session_id":"00000000-0000-4000-8000-00000000000a","amr":[{"method":"password","timestamp":1795000000},{"method":"totp","timestamp":1795000001}]}';
select is((public.admin_seller_inventory()->>'total')::integer, 27, 'total seller count matches 27');
select is(jsonb_array_length(public.admin_seller_inventory(p_page => 1)->'items'), 24, 'page 1 bounded to 24 sellers');
select is(jsonb_array_length(public.admin_seller_inventory(p_page => 2)->'items'), 3, 'page 2 returns remaining 3 sellers');
select ok(not exists(
 select 1
 from jsonb_array_elements(public.admin_seller_inventory(p_page => 1)->'items') p1
 join jsonb_array_elements(public.admin_seller_inventory(p_page => 2)->'items') p2
  on p1->>'public_id' = p2->>'public_id'
), 'seller inventory pages never overlap');

-- Verify moderator role works with aal2, and immediate revocation denies admin
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated","aal":"aal2","session_id":"00000000-0000-4000-8000-00000000000b","amr":[{"method":"password","timestamp":1795000000},{"method":"totp","timestamp":1795000001}]}';
select is((public.admin_seller_inventory()->>'total')::integer, 27, 'active moderator with aal2 can view seller inventory');

reset role;
update private.admin_roles set revoked_at = now() where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","aal":"aal2","session_id":"00000000-0000-4000-8000-00000000000a","amr":[{"method":"password","timestamp":1795000000},{"method":"totp","timestamp":1795000001}]}';
select throws_ok($$select public.admin_seller_inventory()$$, '42501', null, 'revoked admin immediately denied admin_seller_inventory');
select throws_ok($$select public.admin_seller_detail((select public_id from seller_fx where tag='coach'))$$, '42501', null, 'revoked admin immediately denied admin_seller_detail');
select throws_ok($$select public.admin_update_seller_account_type((select public_id from seller_fx where tag='private'), 3, 'business', 'revoked')$$, '42501', null, 'revoked admin immediately denied account-type update');
select throws_ok($$select public.admin_update_seller_listing_limit((select public_id from seller_fx where tag='private'), 3, 10, 'revoked')$$, '42501', null, 'revoked admin immediately denied listing-limit update');
select throws_ok($$select public.admin_moderate_seller_status((select public_id from seller_fx where tag='private'), 3, 'suspended', 'revoked')$$, '42501', null, 'revoked admin immediately denied seller moderation');

-- Privilege hygiene: zero direct table grants, hosted-safe capability role, and NEITHER
-- review_writer NOR seller_admin can restore a seller to active or edit unauthorized columns.
reset role;
select ok(not (select rolcanlogin or rolinherit or rolbypassrls or rolsuper from pg_roles where rolname = 'padelhub_seller_admin'), 'padelhub_seller_admin is NOLOGIN NOINHERIT NOBYPASSRLS');
select ok(not has_schema_privilege('padelhub_seller_admin', 'auth', 'USAGE'), 'padelhub_seller_admin needs zero auth schema USAGE for hosted compatibility');
select ok(not has_table_privilege('authenticated', 'public.seller_profiles', 'SELECT'), 'no direct seller_profiles grant to authenticated');
select ok(not has_column_privilege('padelhub_review_writer', 'public.seller_profiles', 'account_type', 'UPDATE'), 'review_writer cannot update account_type');
select ok(not has_column_privilege('padelhub_review_writer', 'public.seller_profiles', 'listing_limit_override', 'UPDATE'), 'review_writer cannot update listing_limit_override');
select ok(not has_column_privilege('padelhub_review_writer', 'public.seller_profiles', 'is_public', 'UPDATE'), 'review_writer cannot update is_public');
select ok(not has_column_privilege('padelhub_review_writer', 'public.seller_profiles', 'public_contact_consent', 'UPDATE'), 'review_writer cannot update public_contact_consent');
select ok(not has_column_privilege('padelhub_review_writer', 'public.seller_profiles', 'username', 'UPDATE'), 'review_writer cannot update username');
select ok(not has_column_privilege('padelhub_review_writer', 'private.seller_contacts', 'whatsapp_e164', 'UPDATE'), 'review_writer cannot update seller_contacts');
select ok(not has_column_privilege('padelhub_seller_admin', 'public.seller_profiles', 'account_status', 'UPDATE'), 'seller_admin has zero UPDATE privilege on account_status');
select ok(not has_column_privilege('padelhub_seller_admin', 'public.seller_profiles', 'is_public', 'UPDATE'), 'seller_admin cannot update is_public');
select ok(not has_table_privilege('padelhub_seller_admin', 'private.seller_contacts', 'SELECT'), 'seller_admin cannot read private.seller_contacts');
select ok(not has_table_privilege('padelhub_seller_admin', 'private.audit_logs', 'SELECT'), 'seller_admin cannot read private.audit_logs');

grant padelhub_review_writer, padelhub_seller_admin to postgres;
grant usage on schema extensions to padelhub_review_writer, padelhub_seller_admin;
set local role padelhub_review_writer;
select throws_ok($$update public.seller_profiles set account_status = 'active'$$, '42501', null, 'review_writer cannot restore seller to active');
reset role;
set local role padelhub_seller_admin;
select throws_ok($$update public.seller_profiles set account_status = 'active'$$, '42501', null, 'seller_admin cannot restore seller to active');
select throws_ok($$update public.platform_settings set id = true$$, '42501', null, 'seller_admin lock grant cannot update settings');
reset role;

select * from finish();
rollback;
