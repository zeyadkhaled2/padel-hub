-- Runs both on the migrated scratch DB and the restored DB, with existing data.
begin;
create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
grant usage on schema extensions to anon,authenticated;
insert into auth.users(id,email_confirmed_at) values
 ('e1111111-1111-4111-8111-111111111111',now()),
 ('e2222222-2222-4222-8222-222222222222',now());
insert into private.admin_roles(user_id,role) values ('e2222222-2222-4222-8222-222222222222','admin');
set local role anon;
select lives_ok($$select public.search_public_listings()$$,'anonymous browse works');
select throws_ok($$select * from private.seller_contacts$$,'42501',null,'anonymous contacts denied');
select throws_ok($$select public.create_seller_profile('restore_probe','Probe','cairo')$$,'42501',null,'anonymous write denied');
set local role authenticated;
set local request.jwt.claims='{"sub":"e1111111-1111-4111-8111-111111111111","aal":"aal1","session_id":"00000000-0000-4000-8000-000000000001","amr":[{"method":"password","timestamp":1795000000}]}';
select lives_ok($$select public.create_seller_profile('restore_probe','Probe','cairo')$$,'owner creates private profile through capability');
select lives_ok($$select public.update_seller_profile(1,'{"bio":"restored write"}')$$,'owner updates through capability');
select throws_ok($$update public.seller_profiles set is_public=true$$,'42501',null,'direct client writes denied');
select throws_ok($$select public.admin_pending_listings()$$,'42501',null,'owner cannot administer');
select is(public.get_public_profile('restore_probe',1),null,'private profile not public');
set local request.jwt.claims='{"sub":"e2222222-2222-4222-8222-222222222222","aal":"aal1","session_id":"00000000-0000-4000-8000-000000000002","amr":[{"method":"password","timestamp":1795000000}]}';
select is(public.get_my_profile_bundle(),null,'other account cannot read owner bundle');
select throws_ok($$select public.admin_pending_listings()$$,'42501',null,'admin without MFA denied');
set local request.jwt.claims='{"sub":"e2222222-2222-4222-8222-222222222222","aal":"aal2","session_id":"00000000-0000-4000-8000-000000000002","amr":[{"method":"password","timestamp":1795000000},{"method":"totp","timestamp":1795000001}]}';
select lives_ok($$select public.admin_pending_listings()$$,'MFA admin queue works');
reset role;
update private.admin_roles set revoked_at=now() where user_id='e2222222-2222-4222-8222-222222222222';
set local role authenticated;
select throws_ok($$select public.admin_pending_listings()$$,'42501',null,'revoked MFA admin denied');
reset role;
select * from finish();
rollback;
