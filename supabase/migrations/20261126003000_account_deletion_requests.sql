-- Launch readiness: authenticated account deletion request queue.
-- Lets verified active accounts submit an authenticated deletion request that
-- immediately takes any public seller profile and WhatsApp contact offline while
-- preserving saved listings and photos until an operator completes the documented
-- manual deletion procedure (honoring the no-automatic-photo-deletion constraint).
-- Forward-only, hosted-safe migration using existing padelhub_profile_writer.
begin;

grant padelhub_profile_writer to postgres;

create table private.account_deletion_requests (
 user_id uuid primary key references auth.users(id) on delete cascade,
 public_id uuid,
 status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
 reason text check (char_length(reason) <= 500),
 requested_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create index account_deletion_requests_pending
 on private.account_deletion_requests (requested_at, user_id)
 where status = 'pending';

alter table private.account_deletion_requests enable row level security;
alter table private.account_deletion_requests force row level security;

revoke all on table private.account_deletion_requests from public, anon, authenticated;
grant select, insert, update on table private.account_deletion_requests to padelhub_profile_writer;

create policy account_deletion_owner_read on private.account_deletion_requests
 for select to padelhub_profile_writer
 using (user_id = (select private.auth_uid()));

create policy account_deletion_owner_insert on private.account_deletion_requests
 for insert to padelhub_profile_writer
 with check (user_id = (select private.auth_uid()) and status = 'pending');

create policy account_deletion_owner_update on private.account_deletion_requests
 for update to padelhub_profile_writer
 using (user_id = (select private.auth_uid()))
 with check (user_id = (select private.auth_uid()) and status = 'pending');

create function public.get_my_account_deletion_request() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 caller uuid := private.verified_profile_caller();
 rec private.account_deletion_requests;
begin
 select * into rec
 from private.account_deletion_requests
 where user_id = caller;

 if not found then
  return null;
 end if;

 return jsonb_build_object(
  'status', rec.status,
  'requested_at', rec.requested_at,
  'updated_at', rec.updated_at
 );
end $$;

create function public.request_account_deletion(p_reason text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 caller uuid := private.verified_profile_caller();
 clean_reason text := nullif(btrim(coalesce(p_reason, '')), '');
 p public.seller_profiles;
 existing_req private.account_deletion_requests;
 saved_req private.account_deletion_requests;
 taken_offline boolean := false;
begin
 if clean_reason is not null and char_length(clean_reason) > 500 then
  raise exception 'Deletion reason too long' using errcode = '22023';
 end if;

 -- Serialize same-account deletion requests even before a seller profile exists.
 perform pg_advisory_xact_lock(hashtextextended('delete_account:' || caller::text, 0));

 select * into p
 from public.seller_profiles
 where user_id = caller
 for update;

 if found and (p.is_public or p.public_contact_consent) then
  update public.seller_profiles
  set is_public = false,
      public_contact_consent = false,
      public_contact_consented_at = null,
      version = version + 1,
      updated_at = now()
  where user_id = caller;
  taken_offline := true;
 end if;

 select * into existing_req
 from private.account_deletion_requests
 where user_id = caller
 for update;

 if found and existing_req.status = 'pending' then
  if clean_reason is not null and clean_reason is distinct from existing_req.reason then
   update private.account_deletion_requests
   set reason = clean_reason,
       public_id = coalesce(p.public_id, existing_req.public_id),
       updated_at = now()
   where user_id = caller
   returning * into saved_req;
  else
   saved_req := existing_req;
  end if;
 else
  insert into private.account_deletion_requests (
   user_id, public_id, status, reason, requested_at, updated_at
  ) values (
   caller, p.public_id, 'pending', clean_reason, now(), now()
  )
  on conflict (user_id) do update
  set public_id = coalesce(excluded.public_id, private.account_deletion_requests.public_id),
      status = 'pending',
      reason = coalesce(excluded.reason, private.account_deletion_requests.reason),
      requested_at = now(),
      updated_at = now()
  returning * into saved_req;

  insert into private.audit_logs (
   actor_user_id, actor_role, action, target_type, target_id, after_state
  ) values (
   caller,
   'owner',
   'account.deletion_requested',
   'profile',
   caller::text,
   jsonb_build_object(
    'has_profile', p.user_id is not null,
    'profile_taken_offline', taken_offline
   )
  );
 end if;

 return jsonb_build_object(
  'status', saved_req.status,
  'requested_at', saved_req.requested_at,
  'updated_at', saved_req.updated_at,
  'profile_taken_offline', taken_offline
 );
end $$;

grant create on schema public to padelhub_profile_writer;
alter function public.get_my_account_deletion_request() owner to padelhub_profile_writer;
alter function public.request_account_deletion(text) owner to padelhub_profile_writer;
revoke create on schema public from padelhub_profile_writer;

revoke all on function public.get_my_account_deletion_request(), public.request_account_deletion(text)
 from public, anon;
grant execute on function public.get_my_account_deletion_request(), public.request_account_deletion(text)
 to authenticated;

revoke padelhub_profile_writer from postgres;

notify pgrst, 'reload schema';
commit;
