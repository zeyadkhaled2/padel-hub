begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
grant usage on schema extensions to authenticated,anon;
insert into auth.users(id,email_confirmed_at) values
 ('11111111-1111-4111-8111-111111111111',now()),('22222222-2222-4222-8222-222222222222',now());
set local role authenticated;
set local request.jwt.claims='{"sub":"11111111-1111-4111-8111-111111111111","session_id":"00000000-0000-4000-8000-000000000001","amr":[{"method":"password","timestamp":1795000000}]}';
select public.create_seller_profile('lifecycle_owner','Lifecycle Owner','cairo');
select public.update_seller_profile(1,'{"is_public":true}');
select public.update_my_contact(2,1,'+201000000000',true);
reset role;
create temp table lifecycle_fixture as select test_fixtures.listing('11111111-1111-4111-8111-111111111111','active') id;
grant select on lifecycle_fixture to authenticated,anon;
set local role anon;
select throws_ok($$select public.change_listing_status(id,1,'sold') from lifecycle_fixture$$,'42501',null,'anonymous denied');
set local role authenticated;
set local request.jwt.claims='{"sub":"22222222-2222-4222-8222-222222222222","session_id":"00000000-0000-4000-8000-000000000002","amr":[{"method":"password","timestamp":1795000000}]}';
select throws_ok($$select public.change_listing_status(id,1,'sold') from lifecycle_fixture$$,'42501',null,'another owner denied');
set local request.jwt.claims='{"sub":"11111111-1111-4111-8111-111111111111","session_id":"00000000-0000-4000-8000-000000000001","amr":[{"method":"password","timestamp":1795000000}]}';
select throws_ok($$select public.change_listing_status(id,1,'reserved') from lifecycle_fixture$$,'22023',null,'reservation unavailable');
select throws_ok($$select public.change_listing_status(id,1,'active') from lifecycle_fixture$$,'22023',null,'cannot self approve');
select throws_ok($$select public.change_listing_status(id,1,'traded') from lifecycle_fixture$$,'22023',null,'balls cannot be traded');
select throws_ok($$select public.change_listing_status(id,99,'sold') from lifecycle_fixture$$,'PT409',null,'stale version denied');
select is((select public.change_listing_status(id,1,'sold')->>'status' from lifecycle_fixture),'sold','owner marks sold');
select throws_ok($$select public.change_listing_status(id,1,'archive') from lifecycle_fixture$$,'PT409',null,'stale second action denied');
select is((select public.change_listing_status(id,2,'relist')->>'status' from lifecycle_fixture),'pending','relist requires approval');
select is((select public.get_my_listing(id)->>'version' from lifecycle_fixture),'4','relist preserves version sequence');
select is((select public.change_listing_status(id,4,'archive')->>'status' from lifecycle_fixture),'archived','pending listing can be archived');
select ok((select jsonb_array_length(public.get_my_listing(id)->'media_ids')=1 from lifecycle_fixture),'photos retained');
select public.update_seller_profile(3,'{"is_public":false}');
select throws_ok($$select public.change_listing_status(id,5,'relist') from lifecycle_fixture$$,'23514',null,'private profile blocks relist');
select is((select public.get_my_listing(id)->>'status' from lifecycle_fixture),'archived','failed relist rolls back status');
select is((select public.get_my_listing(id)->>'version' from lifecycle_fixture),'5','failed relist rolls back version');
reset role;
select ok(exists(select 1 from private.audit_logs where action='listing.sold'),'status action audited');
-- A swap racket can be traded but not marked sold; its photos survive relisting.
update public.listings set category='rackets',status='active',offer_type='swap',price_egp=null,
 balls_quantity_packaging=null,swap_preference='Another racket',racket_damage_repair_disclosure='None'
 where id in(select id from lifecycle_fixture);
insert into public.listing_media(listing_id,owner_id,media_id,sort_order)
 select id,'11111111-1111-4111-8111-111111111111',test_fixtures.asset('11111111-1111-4111-8111-111111111111'),n
 from lifecycle_fixture cross join generate_series(1,2) n;
set local role authenticated;
select throws_ok($$select public.change_listing_status(id,5,'sold') from lifecycle_fixture$$,'22023',null,'swap-only cannot be sold');
select is((select public.change_listing_status(id,5,'traded')->>'status' from lifecycle_fixture),'traded','racket trade succeeds');
select public.update_seller_profile(4,'{"is_public":true}');
select is((select public.change_listing_status(id,6,'relist')->>'status' from lifecycle_fixture),'pending','traded racket needs approval again');
select ok((select jsonb_array_length(public.get_my_listing(id)->'media_ids')=3 from lifecycle_fixture),'all racket photos retained');
reset role;
select * from finish();
rollback;
