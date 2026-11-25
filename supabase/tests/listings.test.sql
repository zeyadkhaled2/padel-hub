begin;
create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
grant usage on schema extensions to authenticated,anon;
insert into auth.users(id,email_confirmed_at) values
 ('11111111-1111-4111-8111-111111111111',now()),
 ('22222222-2222-4222-8222-222222222222',now()),
 ('33333333-3333-4333-8333-333333333333',null);
create temp table fixture(name text primary key,id uuid);
grant select,insert on fixture to authenticated;
select ok(not (select rolcanlogin or rolbypassrls or rolsuper from pg_roles where rolname='padelhub_listing_writer'),'listing writer cannot login or bypass RLS');
select ok(not pg_has_role('authenticated','padelhub_listing_writer','MEMBER'),'caller cannot assume writer');
select ok(not pg_has_role('anon','padelhub_listing_guard','MEMBER'),'anonymous cannot assume guard');
select ok(not has_column_privilege('padelhub_listing_writer','public.listings','last_approved_content_version','UPDATE'),'writer cannot approve content');
select ok(not has_table_privilege('padelhub_listing_writer','public.media_assets','DELETE'),'writer cannot delete assets');
select ok(not has_table_privilege('padelhub_listing_guard','public.listings','UPDATE'),'guard cannot mutate listings');
set local role anon;
select throws_ok($$select public.create_listing_draft('balls')$$,'42501',null,'anon create denied');
select throws_ok($$select public.get_my_listing(gen_random_uuid())$$,'42501',null,'anon read denied');
select throws_ok($$select public.update_listing_draft(gen_random_uuid(),1,'{}')$$,'42501',null,'anon edit denied');
select throws_ok($$select public.submit_listing(gen_random_uuid(),1)$$,'42501',null,'anon submit denied');
select throws_ok($$select public.withdraw_listing(gen_random_uuid(),1)$$,'42501',null,'anon withdrawal denied');
set local role authenticated;
set local request.jwt.claims='{}';
select throws_ok($$select public.create_listing_draft('balls')$$,'42501',null,'missing identity denied');
set local request.jwt.claims='{"sub":"33333333-3333-4333-8333-333333333333"}';
select throws_ok($$select public.create_listing_draft('balls')$$,'42501',null,'unverified identity denied');
set local request.jwt.claims='{"sub":"11111111-1111-4111-8111-111111111111","session_id":"00000000-0000-4000-8000-000000000001","amr":[{"method":"password","timestamp":1795000000}]}';
select throws_ok($$select public.create_listing_draft('balls')$$,'42501',null,'missing seller profile denied');
select public.create_seller_profile('draft_owner','Synthetic Owner','cairo');
insert into fixture values('draft',(public.create_listing_draft('balls')->>'id')::uuid);
select is(public.get_my_listing((select id from fixture where name='draft'))->>'status','draft','category-only draft saved');
select is(public.get_my_listing((select id from fixture where name='draft'))->>'title',null::text,'partial draft needs no title');
select is(public.get_my_listing((select id from fixture where name='draft'))->'media_ids','[]'::jsonb,'partial draft needs no photos');
select throws_ok($$select public.create_listing_draft('helmets')$$,'23514',null,'invalid category denied');
select throws_ok($$select public.create_listing_draft(null)$$,'23502',null,'category required');
select throws_ok($$select public.update_listing_draft((select id from fixture where name='draft'),1,'{"status":"active"}')$$,'22023',null,'status injection denied');
select throws_ok($$select public.update_listing_draft((select id from fixture where name='draft'),1,'{"seller_id":"22222222-2222-4222-8222-222222222222"}')$$,'22023',null,'ownership injection denied');
select throws_ok($$select public.update_listing_draft((select id from fixture where name='draft'),1,'{"is_negotiable":"false"}')$$,'22023',null,'boolean string denied');
select throws_ok($$select public.update_listing_draft((select id from fixture where name='draft'),1,'{"price_egp":1.5}')$$,'22023',null,'fractional price denied');
select throws_ok($$select public.update_listing_draft((select id from fixture where name='draft'),1,'{"offer_type":"swap"}')$$,'23514',null,'balls swap denied');
select throws_ok($$select public.update_listing_draft((select id from fixture where name='draft'),1,'{"racket_year":2025}')$$,'23514',null,'wrong category fields denied');
select throws_ok($$select public.update_listing_draft((select id from fixture where name='draft'),1,'{"brand_slug":"missing"}')$$,'23503',null,'unknown brand denied');
select is(public.update_listing_draft((select id from fixture where name='draft'),1,'{"title":"Synthetic balls"}')->>'content_version','2','partial edit advances content');
select throws_ok($$select public.update_listing_draft((select id from fixture where name='draft'),1,'{"title":"Stale"}')$$,'PT409',null,'stale edit denied');
select throws_ok($$select public.submit_listing((select id from fixture where name='draft'),2)$$,'23514',null,'private profile cannot submit');
select public.update_seller_profile(1,'{"is_public":true}');
select throws_ok($$select public.submit_listing((select id from fixture where name='draft'),2)$$,'23514',null,'public profile without contact consent cannot submit');
select public.update_my_contact(2,1,'+201000000001',false);
select throws_ok($$select public.submit_listing((select id from fixture where name='draft'),2)$$,'23514',null,'contact without consent cannot submit');
select public.update_my_contact(3,2,'+201000000001',true);
select throws_ok($$select public.submit_listing((select id from fixture where name='draft'),2)$$,'23514',null,'missing photos cannot submit');
set local request.jwt.claims='{"sub":"22222222-2222-4222-8222-222222222222","session_id":"00000000-0000-4000-8000-000000000002","amr":[{"method":"password","timestamp":1795000000}],"user_metadata":{"role":"admin"}}';
select public.create_seller_profile('draft_other','Synthetic Other','giza');
select is(public.get_my_listing((select id from fixture where name='draft')),null::jsonb,'cross-owner read returns no data');
select throws_ok($$select public.update_listing_draft((select id from fixture where name='draft'),2,'{"title":"Attack"}')$$,'42501',null,'cross-owner edit denied');
select throws_ok($$select public.submit_listing((select id from fixture where name='draft'),2)$$,'42501',null,'cross-owner submit denied');
select throws_ok($$select public.withdraw_listing((select id from fixture where name='draft'),2)$$,'42501',null,'cross-owner withdrawal denied');
reset role;
insert into fixture values
 ('asset',test_fixtures.asset('11111111-1111-4111-8111-111111111111')),
 ('asset2',test_fixtures.asset('11111111-1111-4111-8111-111111111111')),
 ('asset3',test_fixtures.asset('11111111-1111-4111-8111-111111111111')),
 ('unready',test_fixtures.asset('11111111-1111-4111-8111-111111111111','listing_photo',false)),
 ('avatar',test_fixtures.asset('11111111-1111-4111-8111-111111111111','profile_avatar')),
 ('foreign',test_fixtures.asset('22222222-2222-4222-8222-222222222222'));
set local role authenticated;
set local request.jwt.claims='{"sub":"11111111-1111-4111-8111-111111111111","session_id":"00000000-0000-4000-8000-000000000001","amr":[{"method":"password","timestamp":1795000000}]}';
select throws_ok($$select public.update_listing_draft((select id from fixture where name='draft'),2,'{}',array[(select id from fixture where name='foreign')])$$,'23514',null,'other owner photo denied');
select throws_ok($$select public.update_listing_draft((select id from fixture where name='draft'),2,'{}',array[(select id from fixture where name='unready')])$$,'23514',null,'processing photo denied');
select throws_ok($$select public.update_listing_draft((select id from fixture where name='draft'),2,'{}',array[(select id from fixture where name='avatar')])$$,'23514',null,'avatar purpose denied');
select throws_ok($$select public.update_listing_draft((select id from fixture where name='draft'),2,'{}',array[null::uuid])$$,'22023',null,'null photo denied');
select throws_ok($$select public.update_listing_draft((select id from fixture where name='draft'),2,'{}',array[(select id from fixture where name='asset'),(select id from fixture where name='asset')])$$,'22023',null,'duplicate photo denied');
select is(public.update_listing_draft((select id from fixture where name='draft'),2,'{}',array[(select id from fixture where name='asset'),(select id from fixture where name='asset2'),(select id from fixture where name='asset3')])->>'version','3','three ready own photos attach');
select throws_ok($$select public.submit_listing((select id from fixture where name='draft'),3)$$,'23514',null,'photos alone do not satisfy completeness');
select is(public.get_my_listing((select id from fixture where name='draft'))->>'version','3','failed submission rolls back version');
select is(public.update_listing_draft((select id from fixture where name='draft'),3,'{"brand_slug":"head","model":"Test","description":"Synthetic test description","governorate_slug":"cairo","condition":"new","condition_disclosure":"Unused","offer_type":"sale","price_egp":100,"balls_quantity_packaging":"3 balls"}')->>'version','4','complete balls edit succeeds');
select throws_ok($$select public.submit_listing((select id from fixture where name='draft'),3)$$,'PT409',null,'stale submission denied');
select is(public.submit_listing((select id from fixture where name='draft'),4)->>'status','pending','valid owner submission enters private pending review');
select is(public.get_my_listing((select id from fixture where name='draft'))->>'content_version','4','submission does not change content version');
select is(public.get_my_listing((select id from fixture where name='draft'))->>'last_approved_content_version',null::text,'submission cannot grant approval');
select throws_ok($$select public.submit_listing((select id from fixture where name='draft'),5)$$,'PT409',null,'pending cannot submit again');
select throws_ok($$select public.update_listing_draft((select id from fixture where name='draft'),5,'{"title":"Edit"}')$$,'PT409',null,'pending edit requires withdrawal in this scope');
select throws_ok($$select public.withdraw_listing((select id from fixture where name='draft'),4)$$,'PT409',null,'stale withdrawal denied');
select is(public.withdraw_listing((select id from fixture where name='draft'),5)->>'version','6','pending withdrawal increments version');
select is(public.get_my_listing((select id from fixture where name='draft'))->>'content_version','4','withdrawal preserves content version');
select is(jsonb_array_length(public.get_my_listing((select id from fixture where name='draft'))->'media_ids'),3,'withdrawal retains attachments');
select throws_ok($$select public.withdraw_listing((select id from fixture where name='draft'),6)$$,'PT409',null,'draft cannot withdraw again');
insert into fixture values('second',(public.create_listing_draft('balls')->>'id')::uuid);
select throws_ok($$select public.update_listing_draft((select id from fixture where name='second'),1,'{}',array[(select id from fixture where name='asset')])$$,'23505',null,'attached photo cannot be reused');
select throws_ok($$select * from public.listings$$,'42501',null,'direct base listing read denied');
select throws_ok($$update public.listings set status='active'$$,'42501',null,'direct listing mutation denied');
select throws_ok($$select * from public.media_assets$$,'42501',null,'direct storage metadata read denied');
reset role;
set constraints all immediate;
select is((select count(*)::integer from public.media_assets),6,'no assets deleted by draft operations');
select ok(not (public.get_my_listing((select id from fixture where name='draft'))::text like '%synthetic/%'),'bundle contains no storage path');
set constraints all deferred;
-- Exact cap boundaries use complete synthetic ready fixtures, not an upload system.
insert into fixture values('active',test_fixtures.listing('11111111-1111-4111-8111-111111111111','active')),
 ('reserved',test_fixtures.listing('11111111-1111-4111-8111-111111111111','reserved')),
 ('candidate',test_fixtures.listing('11111111-1111-4111-8111-111111111111'));
select test_fixtures.listing('11111111-1111-4111-8111-111111111111','pending') from generate_series(1,3);
set constraints all immediate;
set local role authenticated;
select is(public.submit_listing((select id from fixture where name='candidate'),1)->>'status','pending','fifth counted item allowed; reserved excluded');
select throws_ok($$select public.submit_listing((select id from fixture where name='draft'),6)$$,'PT409',null,'sixth individual counted item blocked');
select is(public.withdraw_listing((select id from fixture where name='active'),1)->>'status','draft','active withdrawal frees one slot');
select is(public.get_my_listing((select id from fixture where name='active'))->>'last_approved_content_version','1','withdrawal preserves approval history');
select is(public.submit_listing((select id from fixture where name='draft'),6)->>'status','pending','freed slot can be submitted');
select is(public.withdraw_listing((select id from fixture where name='reserved'),1)->>'status','draft','reserved withdrawal allowed at full cap');
reset role;
update public.seller_profiles set account_status='suspended',listing_limit_override=0 where user_id='11111111-1111-4111-8111-111111111111';
set local role authenticated;
select throws_ok($$select public.create_listing_draft('balls')$$,'42501',null,'suspended create blocked');
select throws_ok($$select public.update_listing_draft((select id from fixture where name='second'),1,'{"title":"Edit"}')$$,'42501',null,'suspended edit blocked');
select throws_ok($$select public.submit_listing((select id from fixture where name='active'),2)$$,'42501',null,'suspended submit blocked');
select is(public.withdraw_listing((select id from fixture where name='draft'),7)->>'status','draft','suspended owner may withdraw even above lowered cap');
reset role;
update public.seller_profiles set account_status='active' where user_id='11111111-1111-4111-8111-111111111111';
set local role authenticated;
select throws_ok($$select public.submit_listing((select id from fixture where name='draft'),8)$$,'PT409',null,'zero override blocks submission');
reset role;
update public.seller_profiles set listing_limit_override=5 where user_id='11111111-1111-4111-8111-111111111111';
set local role authenticated;
select is(public.submit_listing((select id from fixture where name='draft'),8)->>'status','pending','explicit override permits next slot');
reset role;
-- Exercise capability RLS independently of RPC filtering.
grant padelhub_listing_writer,padelhub_listing_guard to postgres;
grant usage on schema extensions to padelhub_listing_writer,padelhub_listing_guard;
set local role padelhub_listing_writer;
select is((select count(*)::integer from public.seller_profiles),1,'writer sees own profile only');
select is((select count(*)::integer from public.media_assets where owner_id='22222222-2222-4222-8222-222222222222'),0,'writer cannot read foreign assets');
select throws_ok($$update public.platform_settings set id=true$$,'42501',null,'lock privilege cannot change settings');
select throws_ok($$update public.seller_profiles set user_id=user_id$$,'42501',null,'lock privilege cannot change profile');
select throws_ok($$update public.media_assets set id=id$$,'42501',null,'lock privilege cannot change asset');
select throws_ok($$update public.listings set last_approved_content_version=content_version$$,'42501',null,'writer cannot approve');
reset role;
set local role padelhub_listing_guard;
select throws_ok($$delete from public.listings$$,'42501',null,'guard remains read only');
reset role;
-- Racket completeness and business cap at twenty, with only synthetic media.
set local role authenticated;
set local request.jwt.claims='{"sub":"22222222-2222-4222-8222-222222222222","session_id":"00000000-0000-4000-8000-000000000002","amr":[{"method":"password","timestamp":1795000000}]}';
select public.update_seller_profile(1,'{"is_public":true,"account_type":"business"}');
select public.update_my_contact(2,1,'+201000000002',true);
insert into fixture values('racket',(public.create_listing_draft('rackets')->>'id')::uuid);
reset role;
insert into fixture values('r1',test_fixtures.asset('22222222-2222-4222-8222-222222222222')),
 ('r2',test_fixtures.asset('22222222-2222-4222-8222-222222222222')),
 ('r3',test_fixtures.asset('22222222-2222-4222-8222-222222222222'));
set local role authenticated;
select is(public.update_listing_draft((select id from fixture where name='racket'),1,
 '{"title":"Synthetic racket","brand_slug":"head","model":"Test","description":"Synthetic test description","governorate_slug":"giza","condition":"used","condition_disclosure":"Test wear","offer_type":"swap","swap_preference":"Round racket","racket_damage_repair_disclosure":"No repairs"}',
 array[(select id from fixture where name='r1'),(select id from fixture where name='r2')])->>'version','2','racket swap draft can save two photos');
select throws_ok($$select public.submit_listing((select id from fixture where name='racket'),2)$$,'23514',null,'racket requires three photos');
select is(public.update_listing_draft((select id from fixture where name='racket'),2,'{}',array[(select id from fixture where name='r3'),(select id from fixture where name='r1'),(select id from fixture where name='r2')])->>'version','3','racket third photo and reorder saved');
select is(public.get_my_listing((select id from fixture where name='racket'))->'media_ids'->>0,(select id::text from fixture where name='r3'),'photo order reflected in bundle');
select throws_ok($$select public.update_listing_draft((select id from fixture where name='racket'),3,'{"category":"balls"}')$$,'23514',null,'category change must clear incompatible fields');
reset role;
set constraints all deferred;
select test_fixtures.listing('22222222-2222-4222-8222-222222222222','pending') from generate_series(1,19);
insert into fixture values('business_extra',test_fixtures.listing('22222222-2222-4222-8222-222222222222'));
set constraints all immediate;
set local role authenticated;
select is(public.submit_listing((select id from fixture where name='racket'),3)->>'status','pending','business twentieth submission succeeds');
select throws_ok($$select public.submit_listing((select id from fixture where name='business_extra'),1)$$,'PT409',null,'business twenty-first submission denied');
select is(public.withdraw_listing((select id from fixture where name='racket'),4)->>'status','draft','racket withdrawn for incomplete edit');
select is(public.update_listing_draft((select id from fixture where name='racket'),5,'{"category":"balls","offer_type":"sale","swap_preference":null,"racket_damage_repair_disclosure":null,"title":null}',array[]::uuid[])->>'category','balls','draft category change clears incompatible fields and permits partial content');
select is(jsonb_array_length(public.get_my_listing((select id from fixture where name='racket'))->'media_ids'),0,'explicit attachment removal accepted in draft');
select throws_ok($$select public.submit_listing((select id from fixture where name='racket'),6)$$,'23514',null,'incomplete edited draft cannot resubmit');
reset role;
select is((select count(*)::integer from public.media_assets where id in (select id from fixture where name in ('r1','r2','r3'))),3,'detaching photos does not delete saved assets');
-- Rejected corrections remain private and require resubmission.
update public.listings set status='rejected' where id=(select id from fixture where name='business_extra');
set local role authenticated;
select is(public.update_listing_draft((select id from fixture where name='business_extra'),1,'{"title":"Corrected balls"}')->>'status','rejected','rejected correction remains rejected');
select throws_ok($$select public.update_listing_draft((select id from fixture where name='business_extra'),2,'{"category":"rackets"}')$$,'22023',null,'rejected category change denied');
select is(public.submit_listing((select id from fixture where name='business_extra'),2)->>'status','pending','corrected rejection requires pending review');
reset role;
select * from finish();
rollback;
