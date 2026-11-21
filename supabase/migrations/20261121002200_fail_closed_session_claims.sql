-- Defense-in-depth hardening: remove the offline-fixture compatibility exception
-- in `private.is_active_account_session` so every authenticated account/admin RPC
-- fails closed unless the JWT carries both a valid UUID `session_id` and an
-- allowed `amr` array.
begin;

create or replace function private.is_active_account_session(p_caller uuid) returns boolean
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

 raw_sid := jwt->>'session_id';
 if raw_sid is null
  or raw_sid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
  return false;
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

NOTIFY pgrst, 'reload schema';
commit;
