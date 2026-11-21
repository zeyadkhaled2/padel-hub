-- Verify hosted Supabase compatibility: all capability-role RPCs and RLS policies
-- continue to work when writer roles have ZERO `USAGE ON SCHEMA auth` privilege,
-- while private auth-claim helpers remain inaccessible to anon/authenticated/service_role.
begin;
create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(20);
grant usage on schema extensions to authenticated,anon;

insert into auth.users(id, email_confirmed_at) values
 ('11111111-1111-4111-8111-111111111111', now()),
 ('22222222-2222-4222-8222-222222222222', null),
 ('33333333-3333-4333-8333-333333333333', now()),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now());
insert into private.admin_roles(user_id, role) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'admin');

-- 1. Verify zero public/private policies still reference auth.* directly.
select is(
 (select count(*)::integer from pg_policies
  where schemaname in ('public','private')
    and (coalesce(qual,'') ~ '\bauth\.' or coalesce(with_check,'') ~ '\bauth\.')),
 0,
 'no public/private RLS policy requires direct auth schema access'
);

-- 2. Verify private auth helpers are not callable by anon, authenticated, or service_role.
select ok(not has_function_privilege('anon', 'private.auth_uid()', 'EXECUTE'), 'anon cannot execute private.auth_uid');
select ok(not has_function_privilege('authenticated', 'private.auth_uid()', 'EXECUTE'), 'authenticated cannot execute private.auth_uid');
select ok(not has_function_privilege('service_role', 'private.auth_uid()', 'EXECUTE'), 'service_role cannot execute private.auth_uid');
select ok(not has_function_privilege('anon', 'private.auth_jwt()', 'EXECUTE'), 'anon cannot execute private.auth_jwt');
select ok(not has_function_privilege('authenticated', 'private.auth_jwt()', 'EXECUTE'), 'authenticated cannot execute private.auth_jwt');
select ok(not has_function_privilege('authenticated', 'private.verified_auth_caller()', 'EXECUTE'), 'authenticated cannot execute private.verified_auth_caller');
select ok(not has_function_privilege('service_role', 'private.verified_auth_caller()', 'EXECUTE'), 'service_role cannot execute private.verified_auth_caller');

-- 3. Simulate hosted Supabase where writer roles have NO USAGE on schema auth.
revoke usage on schema auth from padelhub_profile_writer, padelhub_listing_writer, padelhub_review_writer;
select ok(
 not has_schema_privilege('padelhub_profile_writer', 'auth', 'USAGE')
 and not has_schema_privilege('padelhub_listing_writer', 'auth', 'USAGE')
 and not has_schema_privilege('padelhub_review_writer', 'auth', 'USAGE'),
 'writer roles have zero auth schema USAGE in hosted simulation'
);

-- 4. Unverified caller is still rejected.
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok(
 $$select public.get_my_profile_bundle()$$,
 '42501',
 'Verified account required',
 'unverified caller rejected without direct auth schema USAGE'
);

-- 5. Verified owner profile, contact, listing draft, and owner list succeed without auth schema USAGE.
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(
 (public.create_seller_profile('hosted_seller', 'Hosted Seller', 'cairo'))->>'username',
 'hosted_seller',
 'create_seller_profile works without writer auth schema USAGE'
);
select is(
 (public.update_seller_profile(1, '{"is_public":true}'))->>'is_public',
 'true',
 'update_seller_profile works without writer auth schema USAGE'
);
select is(
 (public.update_my_contact(2, 1, '+201000000099', true))->>'public_contact_consent',
 'true',
 'update_my_contact works without writer auth schema USAGE'
);
select is(
 (public.create_listing_draft('rackets'))->>'category',
 'rackets',
 'create_listing_draft works without writer auth schema USAGE'
);
select is(
 jsonb_array_length(public.get_my_listings()),
 1,
 'get_my_listings works without writer auth schema USAGE'
);

-- 6. Prepare a pending listing fixture and verify admin review, approval, and reporting without auth schema USAGE.
reset role;
create temp table hosted_fixture as select test_fixtures.listing('11111111-1111-4111-8111-111111111111', 'pending') as id;
grant select on hosted_fixture to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","aal":"aal1"}';
select is(
 public.get_my_admin_access(),
 '{"is_admin":true,"mfa_verified":false}'::jsonb,
 'aal1 admin access reports mfa_verified=false without writer auth schema USAGE'
);

set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","aal":"aal2"}';
select is(
 public.get_my_admin_access(),
 '{"is_admin":true,"mfa_verified":true}'::jsonb,
 'aal2 admin access reports mfa_verified=true without writer auth schema USAGE'
);
select is(
 (public.admin_pending_listings(1)->>'total')::integer,
 1,
 'admin_pending_listings works without writer auth schema USAGE'
);
select is(
 (select public.admin_approve_listing(
   f.id,
   (r->'listing'->>'version')::integer,
   (r->'listing'->>'content_version')::integer,
   (r->'profile'->>'version')::integer,
   r->'media_manifest'
 )->>'status'
 from hosted_fixture f, lateral public.admin_get_listing_review(f.id) r),
 'active',
 'admin_get_listing_review and admin_approve_listing work without writer auth schema USAGE'
);

-- 7. Another verified user can report the active listing without writer auth schema USAGE.
set local request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select lives_ok(
 $$select public.report_content('listing', (select id from hosted_fixture), 'spam', 'Synthetic hosted test report')$$,
 'report_content works without writer auth schema USAGE'
);

select * from finish();
rollback;
