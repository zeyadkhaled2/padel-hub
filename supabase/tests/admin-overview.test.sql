-- Phase Admin A: Verify MFA authorization, revocation, least-privilege column boundaries,
-- exact KPI/trend UTC aggregation, and safe recent-activity projection in admin_dashboard_overview().
begin;
create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(38);
grant usage on schema extensions to anon,authenticated,service_role;

insert into auth.users(id,email_confirmed_at) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',now()),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',now()),
 ('11111111-1111-4111-8111-111111111111',now()),
 ('22222222-2222-4222-8222-222222222222',now()),
 ('33333333-3333-4333-8333-333333333333',now());

insert into private.admin_roles(user_id,role) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','moderator');

-- 1. Privilege hygiene: review writer cannot read sensitive audit_logs columns (4 assertions)
select ok(has_column_privilege('padelhub_review_writer','private.audit_logs','action','SELECT'),'review writer can read audit action');
select ok(not has_column_privilege('padelhub_review_writer','private.audit_logs','actor_user_id','SELECT'),'review writer cannot read actor_user_id');
select ok(not has_column_privilege('padelhub_review_writer','private.audit_logs','before_state','SELECT'),'review writer cannot read before_state');
select ok(not has_column_privilege('padelhub_review_writer','private.audit_logs','after_state','SELECT'),'review writer cannot read after_state');
select ok(not has_table_privilege('authenticated','private.audit_logs','SELECT'),'authenticated has no direct table read on private.audit_logs');

-- 2. Prepare synthetic sellers, listings across statuses, reports, metrics, and audit logs
set local role authenticated;
set local request.jwt.claims='{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1","session_id":"00000000-0000-4000-8000-000000000001","amr":[{"method":"password","timestamp":1795000000}]}';
select public.create_seller_profile('ov_active','Overview Active','cairo');
select public.update_seller_profile(1,'{"is_public":true}');
select public.update_my_contact(2,1,'+201000000011',true);

set local request.jwt.claims='{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal1","session_id":"00000000-0000-4000-8000-000000000002","amr":[{"method":"password","timestamp":1795000000}]}';
select public.create_seller_profile('ov_suspended','Overview Suspended','giza');
select public.update_seller_profile(1,'{"is_public":true}');

set local request.jwt.claims='{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal1","session_id":"00000000-0000-4000-8000-000000000003","amr":[{"method":"password","timestamp":1795000000}]}';
select public.create_seller_profile('ov_reporter','Overview Reporter','alexandria');

reset role;
-- Make ov_suspended created 15 days ago and suspended; keep ov_active & ov_reporter within 7d
update public.seller_profiles
 set account_status='suspended', created_at=now()-interval '15 days'
 where user_id='22222222-2222-4222-8222-222222222222';

create temp table ov_listings(tag text primary key, id uuid);
insert into ov_listings(tag,id) values
 ('active',   test_fixtures.listing('11111111-1111-4111-8111-111111111111','active')),
 ('pending',  test_fixtures.listing('11111111-1111-4111-8111-111111111111','pending')),
 ('rejected', test_fixtures.listing('11111111-1111-4111-8111-111111111111','rejected')),
 ('draft',    test_fixtures.listing('11111111-1111-4111-8111-111111111111','draft')),
 ('sold',     test_fixtures.listing('11111111-1111-4111-8111-111111111111','sold')),
 ('archived', test_fixtures.listing('11111111-1111-4111-8111-111111111111','archived')),
 ('removed',  test_fixtures.listing('11111111-1111-4111-8111-111111111111','removed'));

-- Also create one traded racket listing
insert into ov_listings(tag,id) values ('traded', test_fixtures.listing('11111111-1111-4111-8111-111111111111','active'));
update public.listings
 set category='rackets', status='traded', offer_type='swap', price_egp=null,
     balls_quantity_packaging=null, swap_preference='Control racket', racket_damage_repair_disclosure='None',
     title='Traded Racket Fixture'
 where id=(select id from ov_listings where tag='traded');

-- Set explicit pending submission timestamp for oldest_pending_submitted_at check
update public.listings
 set submitted_at=now()-interval '2 hours', title='Pending Overview Listing'
 where id=(select id from ov_listings where tag='pending');

-- Add 1 open report and 1 dismissed report
insert into private.abuse_reports(reporter_user_id,target_type,target_listing_id,reason_code,details,status,created_at) values
 ('33333333-3333-4333-8333-333333333333','listing',(select id from ov_listings where tag='active'),'spam','Open synthetic report','open',now()-interval '1 hour'),
 ('33333333-3333-4333-8333-333333333333','listing',(select id from ov_listings where tag='active'),'other','Dismissed synthetic report','dismissed',now()-interval '10 days');

-- Insert daily metrics across exact UTC boundaries: today, today-6 (in 7d), today-29 (in 30d only), today-30 (excluded)
insert into private.listing_daily_metrics(listing_id,day,views,contacts) values
 ((select id from ov_listings where tag='active'), (now() at time zone 'UTC')::date,      10, 2),
 ((select id from ov_listings where tag='active'), (now() at time zone 'UTC')::date - 6,  5, 1),
 ((select id from ov_listings where tag='active'), (now() at time zone 'UTC')::date - 29, 7, 3),
 ((select id from ov_listings where tag='active'), (now() at time zone 'UTC')::date - 30, 99, 99);

-- Seed 14 listing/moderation audit entries plus 1 owner profile entry to verify bound (12) and privacy filter
insert into private.audit_logs(actor_user_id,actor_role,action,target_type,target_id,reason,created_at)
select
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'admin',
 'listing.approved',
 'listing',
 (select id::text from ov_listings where tag='active'),
 'Synthetic moderation entry ' || g,
 now() - make_interval(mins => 30 - g)
from generate_series(1,13) g;

insert into private.audit_logs(actor_user_id,actor_role,action,target_type,target_id,reason,created_at) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin','report.suspend','profile',
  (select public_id::text from public.seller_profiles where user_id='22222222-2222-4222-8222-222222222222'),
  'Synthetic suspension note', now() + interval '1 second');

-- 3. Authorization boundary checks (4 assertions)
set local role anon;
select throws_ok($$select public.admin_dashboard_overview()$$,'42501',null,'anonymous denied admin_dashboard_overview');

set local role authenticated;
set local request.jwt.claims='{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2","session_id":"00000000-0000-4000-8000-000000000001","amr":[{"method":"password","timestamp":1795000000},{"method":"totp","timestamp":1795000001}],"user_metadata":{"role":"admin"}}';
select throws_ok($$select public.admin_dashboard_overview()$$,'42501',null,'normal seller with spoofed metadata denied');

set local request.jwt.claims='{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","aal":"aal1","session_id":"00000000-0000-4000-8000-00000000000a","amr":[{"method":"password","timestamp":1795000000}]}';
select throws_ok($$select public.admin_dashboard_overview()$$,'42501',null,'admin without MFA (aal1) denied');

-- 4. Active admin with aal2 receives exact DB-derived KPIs, needs_attention, trends, and safe activity (26 assertions)
set local request.jwt.claims='{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","aal":"aal2","session_id":"00000000-0000-4000-8000-00000000000a","amr":[{"method":"password","timestamp":1795000000},{"method":"totp","timestamp":1795000001}]}';

select is((public.admin_dashboard_overview()->'kpis'->>'sellers_total')::integer, 3, 'sellers_total exact');
select is((public.admin_dashboard_overview()->'kpis'->>'sellers_active')::integer, 2, 'sellers_active exact');
select is((public.admin_dashboard_overview()->'kpis'->>'sellers_suspended')::integer, 1, 'sellers_suspended exact');
select is((public.admin_dashboard_overview()->'kpis'->>'listings_total')::integer, 8, 'listings_total exact');
select is((public.admin_dashboard_overview()->'kpis'->>'listings_active')::integer, 1, 'listings_active exact');
select is((public.admin_dashboard_overview()->'kpis'->>'listings_pending')::integer, 1, 'listings_pending exact');
select is((public.admin_dashboard_overview()->'kpis'->>'listings_rejected')::integer, 1, 'listings_rejected exact');
select is((public.admin_dashboard_overview()->'kpis'->>'listings_draft')::integer, 1, 'listings_draft exact');
select is((public.admin_dashboard_overview()->'kpis'->>'listings_sold')::integer, 1, 'listings_sold exact');
select is((public.admin_dashboard_overview()->'kpis'->>'listings_traded')::integer, 1, 'listings_traded exact');
select is((public.admin_dashboard_overview()->'kpis'->>'listings_archived')::integer, 1, 'listings_archived exact');
select is((public.admin_dashboard_overview()->'kpis'->>'listings_removed')::integer, 1, 'listings_removed exact');
select is((public.admin_dashboard_overview()->'kpis'->>'open_reports')::integer, 1, 'open_reports excludes dismissed');
select is((public.admin_dashboard_overview()->'kpis'->>'views_7d')::integer, 15, 'views_7d sums inclusive 7 UTC days');
select is((public.admin_dashboard_overview()->'kpis'->>'contacts_7d')::integer, 3, 'contacts_7d sums inclusive 7 UTC days');
select is((public.admin_dashboard_overview()->'kpis'->>'views_30d')::integer, 22, 'views_30d sums inclusive 30 UTC days and excludes day-30');
select is((public.admin_dashboard_overview()->'kpis'->>'contacts_30d')::integer, 6, 'contacts_30d sums inclusive 30 UTC days and excludes day-30');

select is((public.admin_dashboard_overview()->'trends'->'period_7d'->>'new_sellers')::integer, 2, '7d new_sellers exact');
select is((public.admin_dashboard_overview()->'trends'->'period_30d'->>'new_sellers')::integer, 3, '30d new_sellers exact');
select is((public.admin_dashboard_overview()->'trends'->'period_7d'->>'new_reports')::integer, 1, '7d new_reports exact');
select is((public.admin_dashboard_overview()->'trends'->'period_30d'->>'new_reports')::integer, 2, '30d new_reports exact');
select is(jsonb_array_length(public.admin_dashboard_overview()->'trends'->'daily_engagement'), 3, 'daily_engagement includes only stored UTC days in 30d window');

select is(jsonb_array_length(public.admin_dashboard_overview()->'recent_activity'), 12, 'recent_activity bounded to 12 items');
select is(public.admin_dashboard_overview()->'recent_activity'->0->>'target_label', '@ov_suspended', 'newest moderation profile report resolves public @username');
select ok(not exists(
 select 1 from jsonb_array_elements(public.admin_dashboard_overview()->'recent_activity') e
 where (e ? 'actor_user_id') or (e ? 'before_state') or (e ? 'after_state')
    or (e->>'actor_role' = 'owner' and e->>'target_type' = 'profile')
), 'recent_activity omits private user_id, raw states, and owner profile rows');
select ok(public.admin_dashboard_overview()::text not like '%201000000011%', 'overview never leaks seller WhatsApp numbers');

-- 5. Active moderator with aal2 succeeds; revoked admin immediately denied (4 assertions — Wait: let's check total!)
set local request.jwt.claims='{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated","aal":"aal2","session_id":"00000000-0000-4000-8000-00000000000b","amr":[{"method":"password","timestamp":1795000000},{"method":"totp","timestamp":1795000001}]}';
select is((public.admin_dashboard_overview()->'needs_attention'->>'pending_listings')::integer, 1, 'active moderator with aal2 allowed');
select ok((public.admin_dashboard_overview()->'needs_attention'->>'oldest_pending_submitted_at') is not null, 'oldest_pending_submitted_at present');
select ok((public.admin_dashboard_overview()->'needs_attention'->>'oldest_open_report_at') is not null, 'oldest_open_report_at present');

reset role;
update private.admin_roles set revoked_at=now() where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set local role authenticated;
set local request.jwt.claims='{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","aal":"aal2","session_id":"00000000-0000-4000-8000-00000000000a","amr":[{"method":"password","timestamp":1795000000},{"method":"totp","timestamp":1795000001}]}';
select throws_ok($$select public.admin_dashboard_overview()$$,'42501',null,'revoked admin immediately denied');

reset role;
select * from finish();
rollback;
