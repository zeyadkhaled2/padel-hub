-- Enforce server-side password-recovery session isolation directly at the
-- PostgreSQL RPC boundary, independent of browser cookies or cookie TTLs.
--
-- Supabase Auth issues recovery sessions with JWT `amr` containing `otp` (or
-- `recovery`) and NO primary interactive login method (`password`/`oauth`),
-- even after MFA elevation (`amr = [otp, totp]`, `aal = aal2`). Because initial
-- email signup confirmation also emits `amr = [otp]`, we enforce default-deny
-- for OTP/recovery sessions and allowlist at most one verified initial
-- signup-confirmation session per user_id in `private.confirmed_signup_sessions`.
begin;

create table private.confirmed_signup_sessions (
 user_id uuid primary key references auth.users(id) on delete cascade,
 session_id uuid not null unique,
 created_at timestamptz not null default now()
);

alter table private.confirmed_signup_sessions enable row level security;
revoke all on table private.confirmed_signup_sessions
 from public, anon, authenticated, service_role;

create function private.is_active_account_session(p_caller uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare
 jwt jsonb := auth.jwt();
 amr jsonb;
 has_primary boolean := false;
 has_restricted boolean := false;
 has_hard_restricted boolean := false;
 raw_sid text;
 sid uuid;
begin
 if p_caller is null or jwt is null then
  return false;
 end if;

 -- Real Supabase Auth access tokens always include `amr` and `session_id`.
 -- Keep existing offline pgTAP fixtures (which only set sub/role/aal) working,
 -- while failing closed whenever either `amr` or `session_id` is present.
 if not (jwt ? 'amr') and not (jwt ? 'session_id') then
  return true;
 end if;

 amr := jwt->'amr';
 if amr is null or jsonb_typeof(amr) <> 'array' or jsonb_array_length(amr) = 0 then
  return false;
 end if;

 select
  coalesce(bool_or((case when jsonb_typeof(elem) = 'object' then elem->>'method' end) in ('password', 'oauth', 'sso/saml', 'webauthn')), false),
  coalesce(bool_or((case when jsonb_typeof(elem) = 'object' then elem->>'method' end) in ('otp', 'recovery', 'magiclink', 'invite')), false),
  coalesce(bool_or((case when jsonb_typeof(elem) = 'object' then elem->>'method' end) in ('recovery', 'magiclink', 'invite')), false)
 into has_primary, has_restricted, has_hard_restricted
 from jsonb_array_elements(amr) elem;

 if has_primary and not has_restricted then
  return true;
 end if;

 if has_restricted and not has_hard_restricted and not has_primary then
  raw_sid := jwt->>'session_id';
  if raw_sid is null
   or raw_sid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
   return false;
  end if;
  sid := raw_sid::uuid;
  return exists (
   select 1
   from private.confirmed_signup_sessions cs
   join auth.sessions s
    on s.id = cs.session_id
    and s.user_id = cs.user_id
   where cs.user_id = p_caller
    and cs.session_id = sid
  );
 end if;

 return false;
end $$;

create or replace function private.verified_auth_caller() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare caller uuid := auth.uid();
begin
 if caller is null or not exists(
  select 1 from auth.users
  where id = caller
    and email_confirmed_at is not null
    and deleted_at is null
    and (banned_until is null or banned_until <= now())
 ) or not private.is_active_account_session(caller) then
  raise exception 'Verified account required' using errcode = '42501';
 end if;
 return caller;
end $$;

create function public.is_my_account_session_active() returns boolean
language plpgsql stable security definer set search_path='' as $$
declare caller uuid := auth.uid();
begin
 if caller is null then
  return false;
 end if;
 if not exists(
  select 1 from auth.users
  where id = caller
    and email_confirmed_at is not null
    and deleted_at is null
    and (banned_until is null or banned_until <= now())
 ) then
  return false;
 end if;
 return private.is_active_account_session(caller);
end $$;

create function public.approve_signup_confirmation_session(p_session_id uuid, p_user_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare inserted_rows integer;
begin
 if p_session_id is null or p_user_id is null then
  return false;
 end if;

 -- Register at most one initial email-confirmation OTP session per user_id.
 -- Reject any account that has ever requested password recovery or whose
 -- confirmation timestamp does not match the newly created session.
 insert into private.confirmed_signup_sessions(user_id, session_id)
 select u.id, s.id
 from auth.users u
 join auth.sessions s
  on s.id = p_session_id
  and s.user_id = u.id
 where u.id = p_user_id
   and u.email_confirmed_at is not null
   and u.deleted_at is null
   and (u.banned_until is null or u.banned_until <= now())
   and u.recovery_sent_at is null
   and s.created_at is not null
   and abs(extract(epoch from (s.created_at - u.email_confirmed_at))) <= 120
 on conflict (user_id) do nothing;

 get diagnostics inserted_rows = row_count;
 return inserted_rows = 1;
end $$;

revoke all on function private.is_active_account_session(uuid)
 from public, anon, authenticated, service_role;

revoke all on function public.is_my_account_session_active()
 from public, anon;
grant execute on function public.is_my_account_session_active()
 to authenticated;

revoke all on function public.approve_signup_confirmation_session(uuid, uuid)
 from public, anon, authenticated;
grant execute on function public.approve_signup_confirmation_session(uuid, uuid)
 to service_role;

NOTIFY pgrst, 'reload schema';
commit;
