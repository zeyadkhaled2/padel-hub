begin;
-- Exercise preserved post-MVP alias implementation in this rolled-back scratch test only.
grant padelhub_profile_writer to postgres;
grant execute on function public.rename_seller_username(integer,text) to authenticated;
revoke padelhub_profile_writer from postgres;
create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
grant usage on schema extensions to authenticated,anon;
insert into auth.users(id,email_confirmed_at,raw_user_meta_data) values
 ('11111111-1111-4111-8111-111111111111',now(),'{}'),
 ('22222222-2222-4222-8222-222222222222',now(),'{"role":"admin"}'),
 ('33333333-3333-4333-8333-333333333333',null,'{}');

select ok(not (select rolcanlogin or rolbypassrls or rolsuper from pg_roles where rolname='padelhub_profile_writer'),'writer cannot login or bypass RLS');
select ok(not (select rolcanlogin or rolbypassrls or rolsuper from pg_roles where rolname='padelhub_profile_guard'),'guard cannot login or bypass RLS');
select ok(not pg_has_role('authenticated','padelhub_profile_writer','MEMBER'),'authenticated cannot assume writer');
select ok(not pg_has_role('anon','padelhub_profile_guard','MEMBER'),'anonymous cannot assume guard');
select ok(not has_table_privilege('padelhub_profile_guard','public.seller_profiles','UPDATE'),'guard cannot mutate profile');
select ok(not has_column_privilege('padelhub_profile_writer','public.seller_profiles','account_status','UPDATE'),'writer cannot change admin account status');
select ok(not has_column_privilege('padelhub_profile_writer','public.seller_profiles','listing_limit_override','UPDATE'),'writer cannot change cap override');
select ok(not has_table_privilege('padelhub_profile_writer','private.admin_roles','SELECT'),'writer cannot read admin role table');

set local role anon;
select throws_ok($$select public.get_my_profile_bundle()$$,'42501',null,'anonymous private read denied');
select throws_ok($$select public.create_seller_profile('rpc_anon','Test','cairo')$$,'42501',null,'anonymous create denied');
reset role;
set local role authenticated;
set local request.jwt.claims='{}';
select throws_ok($$select public.create_seller_profile('rpc_missing','Test','cairo')$$,'42501',null,'missing subject denied');
set local request.jwt.claims='{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select throws_ok($$select public.create_seller_profile('rpc_unverified','Test','cairo')$$,'42501',null,'unverified account denied');
set local request.jwt.claims='{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}';
select is(public.get_my_profile_bundle(),null::jsonb,'owner without profile gets null bundle');
select is(public.create_seller_profile('rpc_owner','Synthetic Owner','cairo')->>'username','rpc_owner','verified owner creates own profile');
select is((public.get_my_profile_bundle()->>'is_public')::boolean,false,'creation private by default');
select is((public.get_my_profile_bundle()->>'public_contact_consent')::boolean,false,'creation has no contact consent');
select throws_ok($$select public.create_seller_profile('rpc_again','Test','cairo')$$,'23505',null,'duplicate profile creation rejected');
select throws_ok($$select public.update_seller_profile(1,'{"user_id":"22222222-2222-4222-8222-222222222222"}')$$,'22023',null,'owner cannot target another user');
select throws_ok($$select public.update_seller_profile(1,'{"account_status":"active"}')$$,'22023',null,'admin-only status not in allowlist');
select throws_ok($$select public.update_seller_profile(1,'{"listing_limit_override":500}')$$,'22023',null,'cap override not in allowlist');
select throws_ok($$select public.update_seller_profile(1,'{"is_public":"false"}')$$,'22023',null,'boolean string rejected');
select throws_ok($$select public.update_seller_profile(1,'{"display_name":null}')$$,'22023',null,'required text cannot be null');
select is(public.update_seller_profile(1,'{"is_public":true,"bio":"Synthetic bio"}')->>'version','2','empty profile can opt in publicly');
select throws_ok($$select public.update_seller_profile(1,'{"bio":"stale"}')$$,'PT409',null,'stale profile update rejected');
select is(public.get_my_profile_bundle()->>'bio','Synthetic bio','stale write preserves previous content');
select is(public.rename_seller_username(2,'Rpc_Owner')->>'version','3','case-only rename increments version');
select is(public.rename_seller_username(3,'rpc_renamed')->>'username','rpc_renamed','rename succeeds');
select is(public.rename_seller_username(4,'rpc_owner')->>'username','rpc_owner','same-owner alias reclaim succeeds');
select throws_ok($$select public.rename_seller_username(5,'admin')$$,'23505',null,'reserved route denied');
select throws_ok($$select public.rename_seller_username(5,'bad-name')$$,'22023',null,'invalid username denied');
select throws_ok($$select public.rename_seller_username(4,'rpc_stale')$$,'PT409',null,'stale rename denied');
select is(public.update_my_contact(5,1,'+201000000001',true)->>'version','6','contact and profile versions advance together');
select is(public.get_my_profile_bundle()->>'contact_version','2','contact version incremented');
select is((public.get_my_profile_bundle()->>'public_contact_consent')::boolean,true,'explicit consent enabled');
select throws_ok($$select public.update_my_contact(6,1,'+201000000002',true)$$,'PT409',null,'stale contact version denied');
select throws_ok($$select public.update_my_contact(6,2,'javascript:bad',true)$$,'22023',null,'invalid number denied');
select throws_ok($$select public.update_my_contact(6,2,'+201000000002',null)$$,'22023',null,'omitted consent choice denied');
select is((public.update_my_contact(6,2,'+201000000002',false)->>'public_contact_consent')::boolean,false,'replacement without opt-in clears consent');
select is((public.update_my_contact(7,3,null,true)->>'public_contact_consent')::boolean,false,'clearing number clears consent atomically');
select is(public.get_my_profile_bundle()->>'whatsapp_e164',null::text,'cleared number removed from owner bundle');
select throws_ok($$select * from private.seller_contacts$$,'42501',null,'owner cannot bypass bundle to read private table');
select throws_ok($$update public.seller_profiles set bio='bypass'$$,'42501',null,'direct profile mutation denied');
set local request.jwt.claims='{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2","user_metadata":{"role":"admin"}}';
select is(public.get_my_profile_bundle(),null::jsonb,'metadata-admin spoof cannot read another profile');
select throws_ok($$select public.update_seller_profile(8,'{"bio":"cross-owner"}')$$,'42501',null,'metadata-admin spoof cannot update other profile');
select throws_ok($$select public.create_seller_profile('RPC_OWNER','Synthetic B','giza')$$,'23505',null,'another account cannot claim active handle');
select throws_ok($$select public.create_seller_profile('rpc_renamed','Synthetic B','giza')$$,'23505',null,'another account cannot claim historical alias');
select is(public.create_seller_profile('rpc_other','Synthetic B','giza')->>'username','rpc_other','other verified owner can create own profile');
select throws_ok($$select public.rename_seller_username(1,'rpc_owner')$$,'23505',null,'other profile rename cannot steal active handle');
select is(public.get_my_profile_bundle()->>'user_id','22222222-2222-4222-8222-222222222222','bundle always derived from verified caller');
reset role;
set constraints all immediate;
select is((select count(*)::integer from public.username_aliases where user_id='11111111-1111-4111-8111-111111111111' and is_active),1,'one active historical alias after reclaim');
select is((select kind from public.username_registry where username_lower='rpc_owner'),'active_profile','reclaimed registry active');
select is((select kind from public.username_registry where username_lower='rpc_renamed'),'alias','previous handle retained as alias');
select is((select public_contact_consented_at from public.seller_profiles where username='rpc_owner'),null::timestamptz,'opt-out removes consent timestamp');
select is((select count(*)::integer from private.audit_logs where after_state::text like '%201000000%'),0,'audit contains no contact numbers');
select is((select count(*)::integer from public.seller_profiles),2,'failed claims roll back inserted profiles');
update public.seller_profiles set account_status='suspended' where username='rpc_owner';
set local role authenticated;
set local request.jwt.claims='{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(public.get_my_profile_bundle()->>'account_status','suspended','suspended owner retains private bundle');
select throws_ok($$select public.update_seller_profile(8,'{"bio":"changed"}')$$,'42501',null,'suspended profile content edit denied');
select is((public.update_seller_profile(8,'{"is_public":false}')->>'is_public')::boolean,false,'suspended owner may turn privacy off');
select throws_ok($$select public.update_seller_profile(9,'{"is_public":true}')$$,'42501',null,'suspended owner cannot publish');
select throws_ok($$select public.rename_seller_username(9,'rpc_new')$$,'42501',null,'suspended rename denied');
select throws_ok($$select public.update_my_contact(9,4,'+201000000003',true)$$,'42501',null,'suspended owner cannot enable contact');
reset role;
-- Guard still enforces invariants when callers lack read access.
select throws_ok($$update public.seller_profiles set public_contact_consent=true where username='rpc_owner'$$,'23514',null,'guard rejects invalid consent independently of caller');
select throws_ok($$update public.username_registry set kind='alias' where username_lower='rpc_other'$$,'23514',null,'guard rejects detached active claim');
-- Exercise the actual non-login capabilities, not only ACL introspection.
grant padelhub_profile_writer,padelhub_profile_guard to postgres;
grant usage on schema extensions to padelhub_profile_writer,padelhub_profile_guard;
set local role padelhub_profile_writer;
select is((select count(*)::integer from public.seller_profiles),1,'writer RLS sees only caller profile');
with changed as (update public.seller_profiles set bio='escape' where user_id='22222222-2222-4222-8222-222222222222' returning user_id) select is((select count(*)::integer from changed),0,'writer RLS prevents cross-owner mutation');
select throws_ok($$update public.seller_profiles set account_status='active'$$,'42501',null,'writer capability cannot mutate admin columns');
select throws_ok($$update public.platform_settings set id=true$$,'42501',null,'settings lock privilege cannot mutate settings');
reset role;
set local role padelhub_profile_guard;
select is((select count(*)::integer from public.seller_profiles),2,'guard can validate both profiles');
select throws_ok($$update public.seller_profiles set bio='guard escape'$$,'42501',null,'guard remains SELECT-only');
reset role;
-- Downgrade counts all pending+active rows under the prescribed lock order.
set local role authenticated;
set local request.jwt.claims='{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is(public.update_seller_profile(1,'{"account_type":"business"}')->>'account_type','business','owner may change account type');
reset role;
set constraints all deferred;
do $$ declare listing uuid; asset uuid; attempt uuid; manifest jsonb; begin
 for i in 1..6 loop
  listing:=gen_random_uuid(); asset:=gen_random_uuid(); attempt:=gen_random_uuid();
  select jsonb_object_agg(v,jsonb_build_object('key','processed/'||asset||'/'||attempt||'/'||v||'.webp','sha256',repeat('a',64),'bytes',100)) into manifest from unnest(array['thumb','card','full']) v;
  insert into public.media_assets(id,owner_id,purpose,status,private_storage_path,input_mime_type,byte_size,width_px,height_px,exif_stripped,ready_attempt_id,ready_manifest,content_sha256)
  values(asset,'22222222-2222-4222-8222-222222222222','listing_photo','ready','raw/'||asset,'image/jpeg',100,400,400,true,attempt,manifest,repeat('a',64));
  insert into public.listings(id,seller_id,category,status,title,brand_slug,model,description,governorate_slug,condition,condition_disclosure,offer_type,price_egp,balls_quantity_packaging)
  values(listing,'22222222-2222-4222-8222-222222222222','balls','pending','Synthetic balls','head','Test','Synthetic test only','giza','new','Test disclosure','sale',100,'3 balls');
  insert into public.listing_media(listing_id,owner_id,media_id,sort_order) values(listing,'22222222-2222-4222-8222-222222222222',asset,0);
 end loop;
end $$;
set constraints all immediate;
set local role authenticated;
select throws_ok($$select public.update_seller_profile(2,'{"account_type":"individual"}')$$,'PT409',null,'six counted listings block individual downgrade');
select is(public.get_my_profile_bundle()->>'version','2','failed downgrade leaves version unchanged');
reset role;
update public.seller_profiles set listing_limit_override=6 where username='rpc_other';
set local role authenticated;
select is(public.update_seller_profile(2,'{"account_type":"individual"}')->>'account_type','individual','explicit admin override used as effective cap');
reset role;
select * from finish();
rollback;
