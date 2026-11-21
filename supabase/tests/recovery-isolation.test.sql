-- Verify server-side password-recovery session isolation at the PostgreSQL RPC boundary,
-- including direct owner/admin RPC access, MFA-enrolled aal2 recovery sessions,
-- malformed/missing AMR claims, and single-use signup-confirmation session allowlisting.
begin;
create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(45);
grant usage on schema extensions to authenticated,anon,service_role;

insert into auth.users(id, email_confirmed_at, recovery_sent_at) values
 ('11111111-1111-4111-8111-111111111111', now(), now()),
 ('22222222-2222-4222-8222-222222222222', now(), null),
 ('33333333-3333-4333-8333-333333333333', now(), null),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now(), now());

insert into auth.sessions(id, user_id, created_at) values
 ('10000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', now()),
 ('20000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', now()),
 ('20000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', now()),
 ('30000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', now()),
 ('30000000-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333', now()),
 ('a0000000-0000-4000-8000-00000000000a', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now());

insert into private.admin_roles(user_id, role) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'admin');

-- 1. Privilege and RLS-policy hygiene (6 assertions)
select ok(not has_table_privilege('anon', 'private.confirmed_signup_sessions', 'SELECT'), 'anon cannot read confirmed_signup_sessions');
select ok(not has_table_privilege('authenticated', 'private.confirmed_signup_sessions', 'SELECT'), 'authenticated cannot read confirmed_signup_sessions');
select ok(not has_table_privilege('service_role', 'private.confirmed_signup_sessions', 'SELECT'), 'service_role cannot directly read confirmed_signup_sessions');
select ok(not has_function_privilege('authenticated', 'private.is_active_account_session(uuid)', 'EXECUTE'), 'authenticated cannot call private.is_active_account_session');
select ok(not has_function_privilege('authenticated', 'public.approve_signup_confirmation_session(uuid,uuid)', 'EXECUTE'), 'authenticated cannot call approve_signup_confirmation_session');
select ok(has_function_privilege('service_role', 'public.approve_signup_confirmation_session(uuid,uuid)', 'EXECUTE'), 'service_role can call approve_signup_confirmation_session');

-- 2. Primary password and OAuth sessions succeed for owner reads & mutations (4 assertions)
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1","session_id":"10000000-0000-4000-8000-000000000001","amr":[{"method":"password","timestamp":1795000000}]}';
select is(public.is_my_account_session_active(), true, 'password session is active');
select is((public.create_seller_profile('rec_iso_owner', 'Recovery Iso Owner', 'cairo'))->>'username', 'rec_iso_owner', 'password session creates seller profile');

set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1","session_id":"10000000-0000-4000-8000-000000000001","amr":[{"method":"oauth","timestamp":1795000000}]}';
select is(public.is_my_account_session_active(), true, 'oauth session is active');
select is((public.update_seller_profile(1, '{"is_public":true}'))->>'is_public', 'true', 'oauth session updates seller profile');

-- 3. Unregistered OTP recovery session is blocked from reads and owner mutations (6 assertions)
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1","session_id":"10000000-0000-4000-8000-000000000001","amr":[{"method":"otp","timestamp":1795000000}]}';
select is(public.is_my_account_session_active(), false, 'recovery otp session reports inactive');
select throws_ok($$select public.get_my_profile_bundle()$$, '42501', 'Verified account required', 'recovery otp denied get_my_profile_bundle');
select throws_ok($$select public.update_seller_profile(2, '{"bio":"should fail"}')$$, '42501', 'Verified account required', 'recovery otp denied update_seller_profile');
select throws_ok($$select public.create_listing_draft('rackets')$$, '42501', 'Verified account required', 'recovery otp denied create_listing_draft');
select throws_ok($$select public.get_my_listings()$$, '42501', 'Verified account required', 'recovery otp denied get_my_listings');
select throws_ok($$select public.get_my_photo_drafts()$$, '42501', 'Verified account required', 'recovery otp denied get_my_photo_drafts');

-- 4. Explicit recovery, magiclink, mixed primary+otp, empty amr, and session_id-without-amr all fail closed (5 assertions)
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1","session_id":"10000000-0000-4000-8000-000000000001","amr":[{"method":"recovery","timestamp":1795000000}]}';
select throws_ok($$select public.get_my_profile_bundle()$$, '42501', 'Verified account required', 'explicit recovery amr denied');

set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1","session_id":"10000000-0000-4000-8000-000000000001","amr":[{"method":"magiclink","timestamp":1795000000}]}';
select throws_ok($$select public.get_my_profile_bundle()$$, '42501', 'Verified account required', 'magiclink amr denied');

set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1","session_id":"10000000-0000-4000-8000-000000000001","amr":[{"method":"password","timestamp":1795000000},{"method":"otp","timestamp":1795000001}]}';
select throws_ok($$select public.get_my_profile_bundle()$$, '42501', 'Verified account required', 'mixed password+otp amr denied');

set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1","session_id":"10000000-0000-4000-8000-000000000001","amr":[]}';
select throws_ok($$select public.get_my_profile_bundle()$$, '42501', 'Verified account required', 'empty amr fails closed');

set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1","session_id":"10000000-0000-4000-8000-000000000001"}';
select throws_ok($$select public.get_my_profile_bundle()$$, '42501', 'Verified account required', 'session_id without amr fails closed');

set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}';
select throws_ok($$select public.get_my_profile_bundle()$$, '42501', 'Verified account required', 'missing both amr and session_id fails closed');

-- 5. MFA-enrolled admin in aal2 recovery session (otp + totp) is STILL denied admin RPCs, while password + totp succeeds (5 assertions)
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","aal":"aal2","session_id":"a0000000-0000-4000-8000-00000000000a","amr":[{"method":"otp","timestamp":1795000000},{"method":"totp","timestamp":1795000001}]}';
select is(public.is_my_account_session_active(), false, 'aal2 recovery otp+totp session reports inactive');
select throws_ok($$select public.get_my_admin_access()$$, '42501', 'Verified account required', 'aal2 recovery admin denied get_my_admin_access');
select throws_ok($$select public.admin_pending_listings(1)$$, '42501', 'Verified account required', 'aal2 recovery admin denied admin_pending_listings');
select throws_ok($$select public.get_listing_metrics(true)$$, '42501', 'Verified account required', 'aal2 recovery admin denied admin metrics');

set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","aal":"aal2","session_id":"a0000000-0000-4000-8000-00000000000a","amr":[{"method":"password","timestamp":1795000000},{"method":"totp","timestamp":1795000001}]}';
select is(public.get_my_admin_access(), '{"is_admin":true,"mfa_verified":true}'::jsonb, 'aal2 password+totp admin succeeds');

-- 6. Single-use initial signup confirmation session approval & logout revocation (5 assertions)
reset role;
set local role service_role;
select is(
 public.approve_signup_confirmation_session('10000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111'),
 false,
 'signup approval refuses account with recovery_sent_at set'
);
select is(
 public.approve_signup_confirmation_session('20000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222'),
 true,
 'signup approval registers initial confirmation session once'
);
select is(
 public.approve_signup_confirmation_session('20000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222'),
 false,
 'signup approval refuses a second session for the same user'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal1","session_id":"20000000-0000-4000-8000-000000000002","amr":[{"method":"otp","timestamp":1795000000}]}';
select is(public.is_my_account_session_active(), true, 'approved initial signup otp session is active');
select lives_ok($$select public.get_my_profile_bundle()$$, 'approved initial signup otp session can call get_my_profile_bundle');

set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal1","session_id":"20000000-0000-4000-8000-000000000003","amr":[{"method":"otp","timestamp":1795000000}]}';
select throws_ok($$select public.get_my_profile_bundle()$$, '42501', 'Verified account required', 'unapproved second otp session for same user is denied');

-- Deleting the auth.sessions row immediately invalidates the approved signup session.
reset role;
delete from auth.sessions where id = '20000000-0000-4000-8000-000000000002';
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal1","session_id":"20000000-0000-4000-8000-000000000002","amr":[{"method":"otp","timestamp":1795000000}]}';
select is(public.is_my_account_session_active(), false, 'deleted signup session becomes inactive immediately');

-- 7. GoTrue PKCE email/signup AMR fails closed unless allowlisted, rejects mixed/recovery claims, and revokes on logout (11 assertions)
set local request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal1","session_id":"30000000-0000-4000-8000-000000000001","amr":[{"method":"email/signup","timestamp":1795000000}]}';
select is(public.is_my_account_session_active(), false, 'unapproved pkce email/signup session reports inactive');
select throws_ok($$select public.get_my_profile_bundle()$$, '42501', 'Verified account required', 'unapproved pkce email/signup session denied');

set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","aal":"aal2","session_id":"a0000000-0000-4000-8000-00000000000a","amr":[{"method":"email/signup","timestamp":1795000000},{"method":"totp","timestamp":1795000001}]}';
select throws_ok($$select public.get_my_admin_access()$$, '42501', 'Verified account required', 'unapproved aal2 email/signup+totp admin denied');

set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1","session_id":"10000000-0000-4000-8000-000000000001","amr":[{"method":"password","timestamp":1795000000},{"method":"email/signup","timestamp":1795000001}]}';
select throws_ok($$select public.get_my_profile_bundle()$$, '42501', 'Verified account required', 'mixed password+email/signup amr denied');

set local request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal1","session_id":"30000000-0000-4000-8000-000000000001","amr":[{"method":"email/signup","timestamp":1795000000},{"method":"otp","timestamp":1795000001}]}';
select throws_ok($$select public.get_my_profile_bundle()$$, '42501', 'Verified account required', 'mixed email/signup+otp amr denied');

reset role;
set local role service_role;
select is(
 public.approve_signup_confirmation_session('30000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333'),
 true,
 'signup approval registers initial pkce email/signup session once'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal1","session_id":"30000000-0000-4000-8000-000000000001","amr":[{"method":"email/signup","timestamp":1795000000}]}';
select is(public.is_my_account_session_active(), true, 'approved pkce email/signup session is active');
select lives_ok($$select public.get_my_profile_bundle()$$, 'approved pkce email/signup session can call get_my_profile_bundle');

set local request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal1","session_id":"30000000-0000-4000-8000-000000000001","amr":[{"method":"email/signup","timestamp":1795000000},{"method":"recovery","timestamp":1795000001}]}';
select throws_ok($$select public.get_my_profile_bundle()$$, '42501', 'Verified account required', 'mixed email/signup+recovery amr denied even for approved session');

set local request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal1","session_id":"30000000-0000-4000-8000-000000000002","amr":[{"method":"email/signup","timestamp":1795000000}]}';
select throws_ok($$select public.get_my_profile_bundle()$$, '42501', 'Verified account required', 'unapproved second pkce email/signup session for same user is denied');

reset role;
delete from auth.sessions where id = '30000000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal1","session_id":"30000000-0000-4000-8000-000000000001","amr":[{"method":"email/signup","timestamp":1795000000}]}';
select is(public.is_my_account_session_active(), false, 'deleted pkce email/signup session becomes inactive immediately');

select * from finish();
rollback;
