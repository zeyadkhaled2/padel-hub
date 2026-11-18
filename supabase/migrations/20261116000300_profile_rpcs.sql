-- Profile/contact capability only. No public listing/media policies or admin RPCs.
begin;
do $$ begin
 if not exists(select 1 from pg_roles where rolname='padelhub_profile_writer') then
  create role padelhub_profile_writer nologin noinherit nobypassrls;
 end if;
 if not exists(select 1 from pg_roles where rolname='padelhub_profile_guard') then
  create role padelhub_profile_guard nologin noinherit nobypassrls;
 end if;
end $$;
grant padelhub_profile_writer,padelhub_profile_guard to postgres;
grant usage on schema public,private,auth to padelhub_profile_writer;
grant usage on schema public,private to padelhub_profile_guard;
grant execute on function auth.uid() to padelhub_profile_writer;
grant select(id,email_confirmed_at,banned_until,deleted_at) on auth.users to padelhub_profile_writer;
create policy profile_writer_identity on auth.users for select to padelhub_profile_writer using(id=(select auth.uid()));

grant select on public.seller_profiles,public.username_registry,public.username_aliases,private.seller_contacts to padelhub_profile_guard;
create policy profile_guard_read on public.seller_profiles for select to padelhub_profile_guard using(true);
create policy registry_guard_read on public.username_registry for select to padelhub_profile_guard using(true);
create policy alias_guard_read on public.username_aliases for select to padelhub_profile_guard using(true);
create policy contact_guard_read on private.seller_contacts for select to padelhub_profile_guard using(true);
-- Deferred invariants execute after the caller's definer frame has returned.
-- A separate SELECT-only guard preserves checks regardless of caller visibility.
grant create on schema private to padelhub_profile_guard;
create or replace function private.check_alias_claim() returns trigger language plpgsql set search_path='' as $$
begin
 if exists(select 1 from public.username_aliases a join public.username_registry r using(username_lower)
           where (a.is_active and r.kind<>'alias') or a.user_id is distinct from r.user_id) then
  raise exception 'alias needs matching alias claim' using errcode='23514'; end if;
 return null;
end $$;
alter function private.check_profile_links() security definer;
alter function private.check_profile_links() owner to padelhub_profile_guard;
alter function private.check_alias_claim() security definer;
alter function private.check_alias_claim() owner to padelhub_profile_guard;
revoke create on schema private from padelhub_profile_guard;

grant select on public.seller_profiles,private.seller_contacts,public.username_registry,public.username_aliases to padelhub_profile_writer;
grant insert(user_id,username,display_name,governorate_slug,account_type) on public.seller_profiles to padelhub_profile_writer;
grant update(username,display_name,governorate_slug,account_type,bio,district_text,favorite_racket,is_public,public_contact_consent,public_contact_consented_at,version,updated_at) on public.seller_profiles to padelhub_profile_writer;
grant insert(user_id,whatsapp_e164) on private.seller_contacts to padelhub_profile_writer;
grant update(whatsapp_e164,whatsapp_updated_at,version,updated_at) on private.seller_contacts to padelhub_profile_writer;
grant insert(username_lower,kind,user_id),update(kind,updated_at) on public.username_registry to padelhub_profile_writer;
grant insert(username_lower,user_id,is_active),update(is_active,retired_at) on public.username_aliases to padelhub_profile_writer;
grant select(id,individual_active_pending_limit,business_active_pending_limit),update(id) on public.platform_settings to padelhub_profile_writer;
grant select(seller_id,status) on public.listings to padelhub_profile_writer;
grant insert(actor_user_id,actor_role,action,target_type,target_id,after_state) on private.audit_logs to padelhub_profile_writer;
grant usage on sequence private.audit_logs_id_seq to padelhub_profile_writer;

create policy profile_writer_read on public.seller_profiles for select to padelhub_profile_writer using(user_id=(select auth.uid()));
create policy profile_writer_insert on public.seller_profiles for insert to padelhub_profile_writer with check(user_id=(select auth.uid()));
create policy profile_writer_update on public.seller_profiles for update to padelhub_profile_writer using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy contact_writer_read on private.seller_contacts for select to padelhub_profile_writer using(user_id=(select auth.uid()));
create policy contact_writer_insert on private.seller_contacts for insert to padelhub_profile_writer with check(user_id=(select auth.uid()));
create policy contact_writer_update on private.seller_contacts for update to padelhub_profile_writer using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy registry_writer_read on public.username_registry for select to padelhub_profile_writer using(true);
create policy registry_writer_insert on public.username_registry for insert to padelhub_profile_writer with check(user_id=(select auth.uid()) and kind='active_profile');
create policy registry_writer_update on public.username_registry for update to padelhub_profile_writer using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and kind in ('active_profile','alias'));
create policy alias_writer_read on public.username_aliases for select to padelhub_profile_writer using(user_id=(select auth.uid()));
create policy alias_writer_insert on public.username_aliases for insert to padelhub_profile_writer with check(user_id=(select auth.uid()));
create policy alias_writer_update on public.username_aliases for update to padelhub_profile_writer using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy settings_writer_read on public.platform_settings for select to padelhub_profile_writer using(true);
-- FOR SHARE needs UPDATE privilege; actual settings UPDATE remains prohibited.
create policy settings_writer_lock on public.platform_settings for update to padelhub_profile_writer using(true) with check(false);
create policy listings_writer_count on public.listings for select to padelhub_profile_writer using(seller_id=(select auth.uid()));
create policy audit_writer_append on private.audit_logs for insert to padelhub_profile_writer with check(actor_user_id=(select auth.uid()) and actor_role='owner' and target_type='profile' and target_id=(select auth.uid())::text);

create function private.verified_profile_caller() returns uuid language plpgsql set search_path='' as $$
declare caller uuid:=auth.uid();
begin
 if caller is null or not exists(select 1 from auth.users where id=caller and email_confirmed_at is not null and deleted_at is null and (banned_until is null or banned_until<=now())) then
  raise exception 'Verified account required' using errcode='42501';
 end if;
 return caller;
end $$;
create function private.claim_profile_username(caller uuid, desired text) returns void language plpgsql set search_path='' as $$
declare claimed uuid; claim_kind text;
begin
 if desired is null or desired !~ '^[A-Za-z0-9_]{3,24}$' then raise exception 'Invalid username' using errcode='22023'; end if;
 insert into public.username_registry(username_lower,kind,user_id) values(lower(desired),'active_profile',caller) on conflict do nothing;
 select user_id,kind into claimed,claim_kind from public.username_registry where username_lower=lower(desired) for update;
 if claimed is distinct from caller or claim_kind='reserved' then raise exception 'Username unavailable' using errcode='23505'; end if;
 update public.username_registry set kind='active_profile',updated_at=now() where username_lower=lower(desired);
 update public.username_aliases set is_active=false,retired_at=now() where username_lower=lower(desired);
end $$;
create function private.record_profile_action(caller uuid, action_name text, new_version integer) returns void language sql set search_path='' as $$
 insert into private.audit_logs(actor_user_id,actor_role,action,target_type,target_id,after_state)
 values(caller,'owner',action_name,'profile',caller::text,jsonb_build_object('version',new_version));
$$;

create function public.get_my_profile_bundle() returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.verified_profile_caller(); result jsonb;
begin
 select jsonb_build_object('user_id',p.user_id,'public_id',p.public_id,'username',p.username,'display_name',p.display_name,
 'account_type',p.account_type,'bio',p.bio,'governorate_slug',p.governorate_slug,'district_text',p.district_text,
 'favorite_racket',p.favorite_racket,'is_public',p.is_public,'account_status',p.account_status,'version',p.version,
 'public_contact_consent',p.public_contact_consent,'whatsapp_e164',c.whatsapp_e164,'contact_version',c.version)
 into result from public.seller_profiles p join private.seller_contacts c on c.user_id=p.user_id where p.user_id=caller;
 return result;
end $$;
create function public.create_seller_profile(p_username text,p_display_name text,p_governorate_slug text,p_account_type text default 'individual') returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.verified_profile_caller();
begin
 -- The seller row does not yet exist; serialize same-account creation only.
 perform pg_advisory_xact_lock(hashtextextended(caller::text,0));
 if exists(select 1 from public.seller_profiles where user_id=caller) then raise exception 'Profile already exists' using errcode='23505'; end if;
 if p_username is null or p_username !~ '^[A-Za-z0-9_]{3,24}$' then raise exception 'Invalid username' using errcode='22023'; end if;
 insert into public.seller_profiles(user_id,username,display_name,governorate_slug,account_type)
 values(caller,p_username,p_display_name,p_governorate_slug,p_account_type);
 perform private.claim_profile_username(caller,p_username);
 insert into private.seller_contacts(user_id) values(caller);
 perform private.record_profile_action(caller,'profile.create',1);
 return public.get_my_profile_bundle();
end $$;
create function public.rename_seller_username(p_expected_version integer,p_username text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.verified_profile_caller(); p public.seller_profiles;
begin
 select * into p from public.seller_profiles where user_id=caller for update;
 if not found or p.account_status<>'active' then raise exception 'Profile unavailable' using errcode='42501'; end if;
 if p_expected_version is distinct from p.version then raise exception 'Stale profile version' using errcode='PT409'; end if;
 if p_username is null or p_username !~ '^[A-Za-z0-9_]{3,24}$' then raise exception 'Invalid username' using errcode='22023'; end if;
 if lower(p_username)<>p.username_lower then
  perform private.claim_profile_username(caller,p_username);
  update public.username_registry set kind='alias',updated_at=now() where username_lower=p.username_lower;
  insert into public.username_aliases(username_lower,user_id,is_active) values(p.username_lower,caller,true)
  on conflict(username_lower) do update set is_active=true,retired_at=null;
 end if;
 update public.seller_profiles set username=p_username,version=version+1,updated_at=now() where user_id=caller;
 perform private.record_profile_action(caller,'profile.rename',p.version+1);
 return public.get_my_profile_bundle();
end $$;
create function public.update_seller_profile(p_expected_version integer,p_patch jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.verified_profile_caller(); p public.seller_profiles; k text; v jsonb;
 individual_limit integer; business_limit integer; target_type text; counted integer;
begin
 if p_patch is null or jsonb_typeof(p_patch)<>'object' or p_patch='{}' then raise exception 'Profile patch required' using errcode='22023'; end if;
 for k,v in select * from jsonb_each(p_patch) loop
  if k not in ('display_name','governorate_slug','account_type','bio','district_text','favorite_racket','is_public') then raise exception 'Field not editable' using errcode='22023'; end if;
  if k='is_public' then
   if jsonb_typeof(v)<>'boolean' then raise exception 'Boolean required' using errcode='22023'; end if;
  elsif jsonb_typeof(v)<>'string' and not(k in ('bio','district_text','favorite_racket') and v='null'::jsonb) then
   raise exception 'Text required' using errcode='22023';
  end if;
 end loop;
 select individual_active_pending_limit,business_active_pending_limit into individual_limit,business_limit from public.platform_settings where id for share;
 if not found then raise exception 'Settings unavailable' using errcode='55000'; end if;
 select * into p from public.seller_profiles where user_id=caller for update;
 if not found then raise exception 'Profile unavailable' using errcode='42501'; end if;
 if p_expected_version is distinct from p.version then raise exception 'Stale profile version' using errcode='PT409'; end if;
 if p.account_status<>'active' and p_patch<>'{"is_public":false}'::jsonb then raise exception 'Profile suspended' using errcode='42501'; end if;
 target_type:=coalesce(p_patch->>'account_type',p.account_type);
 if p.account_type='business' and target_type='individual' then
  select count(*) into counted from public.listings where seller_id=caller and status in ('active','pending');
  if counted>coalesce(p.listing_limit_override,individual_limit) then raise exception 'Listing limit exceeded' using errcode='PT409'; end if;
 end if;
 update public.seller_profiles set
 display_name=case when p_patch?'display_name' then p_patch->>'display_name' else display_name end,
 governorate_slug=case when p_patch?'governorate_slug' then p_patch->>'governorate_slug' else governorate_slug end,
 account_type=target_type,bio=case when p_patch?'bio' then p_patch->>'bio' else bio end,
 district_text=case when p_patch?'district_text' then p_patch->>'district_text' else district_text end,
 favorite_racket=case when p_patch?'favorite_racket' then p_patch->>'favorite_racket' else favorite_racket end,
 is_public=case when p_patch?'is_public' then (p_patch->>'is_public')::boolean else is_public end,
 version=version+1,updated_at=now() where user_id=caller;
 perform private.record_profile_action(caller,'profile.update',p.version+1);
 return public.get_my_profile_bundle();
end $$;
create function public.update_my_contact(p_expected_profile_version integer,p_expected_contact_version integer,p_whatsapp_e164 text,p_public_contact_consent boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.verified_profile_caller(); p public.seller_profiles; c private.seller_contacts; consent boolean;
begin
 if p_public_contact_consent is null then raise exception 'Explicit consent choice required' using errcode='22023'; end if;
 if p_whatsapp_e164 is not null and p_whatsapp_e164 !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Invalid contact number' using errcode='22023'; end if;
 select * into p from public.seller_profiles where user_id=caller for update;
 if not found then raise exception 'Profile unavailable' using errcode='42501'; end if;
 select * into c from private.seller_contacts where user_id=caller for update;
 if not found then raise exception 'Contact unavailable' using errcode='42501'; end if;
 if p_expected_profile_version is distinct from p.version or p_expected_contact_version is distinct from c.version then raise exception 'Stale contact version' using errcode='PT409'; end if;
 consent:=p_whatsapp_e164 is not null and p_public_contact_consent;
 if p.account_status<>'active' and (consent or (p_whatsapp_e164 is not null and p_whatsapp_e164 is distinct from c.whatsapp_e164)) then raise exception 'Profile suspended' using errcode='42501'; end if;
 update private.seller_contacts set whatsapp_e164=p_whatsapp_e164,whatsapp_updated_at=now(),version=version+1,updated_at=now() where user_id=caller;
 update public.seller_profiles set public_contact_consent=consent,public_contact_consented_at=case when consent then now() else null end,version=version+1,updated_at=now() where user_id=caller;
 perform private.record_profile_action(caller,'profile.contact',p.version+1);
 return public.get_my_profile_bundle();
end $$;

grant create on schema public,private to padelhub_profile_writer;
alter function private.verified_profile_caller() owner to padelhub_profile_writer;
alter function private.claim_profile_username(uuid,text) owner to padelhub_profile_writer;
alter function private.record_profile_action(uuid,text,integer) owner to padelhub_profile_writer;
alter function public.get_my_profile_bundle() owner to padelhub_profile_writer;
alter function public.create_seller_profile(text,text,text,text) owner to padelhub_profile_writer;
alter function public.rename_seller_username(integer,text) owner to padelhub_profile_writer;
alter function public.update_seller_profile(integer,jsonb) owner to padelhub_profile_writer;
alter function public.update_my_contact(integer,integer,text,boolean) owner to padelhub_profile_writer;
revoke create on schema public,private from padelhub_profile_writer;
revoke all on function public.get_my_profile_bundle(),public.create_seller_profile(text,text,text,text),public.rename_seller_username(integer,text),public.update_seller_profile(integer,jsonb),public.update_my_contact(integer,integer,text,boolean) from public,anon;
grant execute on function public.get_my_profile_bundle(),public.create_seller_profile(text,text,text,text),public.rename_seller_username(integer,text),public.update_seller_profile(integer,jsonb),public.update_my_contact(integer,integer,text,boolean) to authenticated;
-- No application role can SET ROLE into these capabilities.
revoke padelhub_profile_writer,padelhub_profile_guard from postgres;
commit;
