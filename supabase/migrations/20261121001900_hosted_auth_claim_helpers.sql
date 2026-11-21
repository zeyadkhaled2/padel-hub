-- Hosted Supabase compatibility: remove runtime dependency of least-privilege
-- capability roles on direct `auth` schema USAGE (owned by `supabase_admin` on
-- hosted projects, where `postgres` cannot delegate `USAGE ON SCHEMA auth`).
-- Narrow, parameterless `postgres`-owned SECURITY DEFINER helpers read only the
-- caller's own JWT claims and verified `auth.users` status; capability roles
-- remain NOLOGIN NOINHERIT NOBYPASSRLS.
begin;
grant padelhub_profile_writer,padelhub_listing_writer,padelhub_review_writer to postgres;

create function private.auth_uid() returns uuid
language sql stable security definer set search_path='' as $$
 select auth.uid();
$$;

create function private.auth_jwt() returns jsonb
language sql stable security definer set search_path='' as $$
 select auth.jwt();
$$;

create function private.verified_auth_caller() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare caller uuid := auth.uid();
begin
 if caller is null or not exists(
  select 1 from auth.users
  where id = caller
    and email_confirmed_at is not null
    and deleted_at is null
    and (banned_until is null or banned_until <= now())
 ) then
  raise exception 'Verified account required' using errcode = '42501';
 end if;
 return caller;
end $$;

revoke all on function private.auth_uid(), private.auth_jwt(), private.verified_auth_caller()
 from public, anon, authenticated, service_role;
grant execute on function private.auth_uid(), private.verified_auth_caller()
 to padelhub_profile_writer, padelhub_listing_writer, padelhub_review_writer;
grant execute on function private.auth_jwt()
 to padelhub_review_writer;

create or replace function private.verified_profile_caller() returns uuid
language plpgsql set search_path='' as $$
begin
 return private.verified_auth_caller();
end $$;

create or replace function private.verified_reviewer() returns uuid
language plpgsql set search_path='' as $$
declare caller uuid := private.verified_profile_caller();
begin
 if private.auth_jwt()->>'aal' is distinct from 'aal2' then
  raise exception 'Admin MFA required' using errcode = '42501';
 end if;
 perform 1 from private.admin_roles
  where user_id = caller and revoked_at is null and role in ('admin','moderator') for share;
 if not found then
  raise exception 'Active admin role required' using errcode = '42501';
 end if;
 return caller;
end $$;

create or replace function public.get_my_admin_access() returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid := private.verified_profile_caller(); allowed boolean;
begin
 select exists(
  select 1 from private.admin_roles
  where user_id = caller and revoked_at is null and role in ('admin','moderator')
 ) into allowed;
 return jsonb_build_object('is_admin', allowed, 'mfa_verified', allowed and private.auth_jwt()->>'aal' = 'aal2');
end $$;

-- Update all capability-role RLS policies on public.* and private.* to use private.auth_uid().
alter policy profile_writer_read on public.seller_profiles
 using(user_id=(select private.auth_uid()));
alter policy profile_writer_insert on public.seller_profiles
 with check(user_id=(select private.auth_uid()));
alter policy profile_writer_update on public.seller_profiles
 using(user_id=(select private.auth_uid())) with check(user_id=(select private.auth_uid()));
alter policy contact_writer_read on private.seller_contacts
 using(user_id=(select private.auth_uid()));
alter policy contact_writer_insert on private.seller_contacts
 with check(user_id=(select private.auth_uid()));
alter policy contact_writer_update on private.seller_contacts
 using(user_id=(select private.auth_uid())) with check(user_id=(select private.auth_uid()));
alter policy registry_writer_insert on public.username_registry
 with check(user_id=(select private.auth_uid()) and kind='active_profile');
alter policy registry_writer_update on public.username_registry
 using(user_id=(select private.auth_uid())) with check(user_id=(select private.auth_uid()) and kind in ('active_profile','alias'));
alter policy alias_writer_read on public.username_aliases
 using(user_id=(select private.auth_uid()));
alter policy alias_writer_insert on public.username_aliases
 with check(user_id=(select private.auth_uid()));
alter policy alias_writer_update on public.username_aliases
 using(user_id=(select private.auth_uid())) with check(user_id=(select private.auth_uid()));
alter policy listings_writer_count on public.listings
 using(seller_id=(select private.auth_uid()));
alter policy audit_writer_append on private.audit_logs
 with check(actor_user_id=(select private.auth_uid()) and actor_role='owner' and target_type='profile' and target_id=(select private.auth_uid())::text);

alter policy listing_writer_read on public.seller_profiles
 using(user_id=(select private.auth_uid()));
alter policy listing_writer_read on public.listings
 using(seller_id=(select private.auth_uid()));
alter policy listing_writer_read on public.listing_media
 using(owner_id=(select private.auth_uid()));
alter policy listing_writer_read on public.media_assets
 using(owner_id=(select private.auth_uid()));
alter policy listing_contact_read on private.seller_contacts
 using(user_id=(select private.auth_uid()));
alter policy listing_lock on public.seller_profiles
 using(user_id=(select private.auth_uid())) with check(false);
alter policy listing_lock on public.media_assets
 using(owner_id=(select private.auth_uid())) with check(false);
alter policy listing_insert on public.listings
 with check(seller_id=(select private.auth_uid()) and status='draft');
alter policy listing_update on public.listings
 using(seller_id=(select private.auth_uid())) with check(seller_id=(select private.auth_uid()) and status in ('draft','pending','rejected','sold','traded','archived'));
alter policy attachment_insert on public.listing_media
 with check(owner_id=(select private.auth_uid()));
alter policy attachment_delete on public.listing_media
 using(owner_id=(select private.auth_uid()));
alter policy listing_audit_append on private.audit_logs
 with check(actor_user_id=(select private.auth_uid()) and actor_role='owner' and target_type='listing');
alter policy owner_decision_read on private.listing_moderation_state
 using(exists(select 1 from public.listings l where l.id=listing_id and l.seller_id=(select private.auth_uid())));

alter policy review_read on private.admin_roles
 using(user_id=(select private.auth_uid()));
alter policy review_lock on private.admin_roles
 using(user_id=(select private.auth_uid())) with check(false);
alter policy review_insert on private.listing_moderation_state
 with check(decided_by=(select private.auth_uid()) and last_decision in ('approved','rejected'));
alter policy review_update on private.listing_moderation_state
 using(true) with check(decided_by=(select private.auth_uid()) and last_decision in ('approved','rejected'));
alter policy review_audit on private.audit_logs
 with check(actor_user_id=(select private.auth_uid()) and actor_role in ('admin','moderator') and target_type='listing');
alter policy moderation_profile_audit on private.audit_logs
 with check(actor_user_id=(select private.auth_uid()) and actor_role in ('admin','moderator') and target_type='profile');

revoke padelhub_profile_writer,padelhub_listing_writer,padelhub_review_writer from postgres;
NOTIFY pgrst, 'reload schema';
commit;
