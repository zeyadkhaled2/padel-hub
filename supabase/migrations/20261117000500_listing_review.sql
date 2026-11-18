-- T02-E: MFA-admin review and atomic pending decisions. No role provisioning API.
begin;
do $$ begin
 if not exists(select 1 from pg_roles where rolname='padelhub_review_writer') then
  create role padelhub_review_writer nologin noinherit nobypassrls;
 end if;
end $$;
grant padelhub_review_writer,padelhub_profile_writer to postgres;
grant usage on schema public,private,auth to padelhub_review_writer;
grant execute on function auth.uid(),auth.jwt(),private.verified_profile_caller() to padelhub_review_writer;
revoke padelhub_profile_writer from postgres;
grant select(id,email_confirmed_at,banned_until,deleted_at) on auth.users to padelhub_review_writer;
create policy review_writer_identity on auth.users for select to padelhub_review_writer using(id=(select auth.uid()));
grant select on public.listings to padelhub_review_writer;
create policy review_read on public.listings for select to padelhub_review_writer using(true);
grant select on public.seller_profiles to padelhub_review_writer;
create policy review_read on public.seller_profiles for select to padelhub_review_writer using(true);
grant select on public.platform_settings to padelhub_review_writer;
create policy review_read on public.platform_settings for select to padelhub_review_writer using(true);
grant select on public.listing_media to padelhub_review_writer;
create policy review_read on public.listing_media for select to padelhub_review_writer using(true);
grant select on public.media_assets to padelhub_review_writer;
create policy review_read on public.media_assets for select to padelhub_review_writer using(true);
grant select on private.seller_contacts to padelhub_review_writer;
create policy review_read on private.seller_contacts for select to padelhub_review_writer using(true);
grant select on private.listing_moderation_state to padelhub_review_writer;
create policy review_read on private.listing_moderation_state for select to padelhub_review_writer using(true);
grant select on private.admin_roles to padelhub_review_writer;
create policy review_read on private.admin_roles for select to padelhub_review_writer using(user_id=(select auth.uid()));
grant update(user_id) on public.seller_profiles to padelhub_review_writer;
create policy review_lock on public.seller_profiles for update to padelhub_review_writer using(true) with check(false);
grant update(id) on public.platform_settings to padelhub_review_writer;
create policy review_lock on public.platform_settings for update to padelhub_review_writer using(true) with check(false);
grant update(id) on public.media_assets to padelhub_review_writer;
create policy review_lock on public.media_assets for update to padelhub_review_writer using(true) with check(false);
grant update(user_id) on private.admin_roles to padelhub_review_writer;
create policy review_lock on private.admin_roles for update to padelhub_review_writer using(user_id=(select auth.uid())) with check(false);
grant update(status,last_approved_content_version,approved_at,published_at,version,updated_at) on public.listings to padelhub_review_writer;
create policy review_update on public.listings for update to padelhub_review_writer using(true) with check(status in ('active','rejected'));
alter table private.listing_moderation_state add column reviewed_listing_version integer check(reviewed_listing_version>=1), add column reviewed_profile_version integer check(reviewed_profile_version>=1);
grant insert(listing_id,last_decision,decision_reason,decided_by,decided_at,reviewed_content_version,reviewed_media_manifest,reviewed_listing_version,reviewed_profile_version),
 update(last_decision,decision_reason,decided_by,decided_at,reviewed_content_version,reviewed_media_manifest,reviewed_listing_version,reviewed_profile_version) on private.listing_moderation_state to padelhub_review_writer;
create policy review_insert on private.listing_moderation_state for insert to padelhub_review_writer with check(decided_by=(select auth.uid()) and last_decision in ('approved','rejected'));
create policy review_update on private.listing_moderation_state for update to padelhub_review_writer using(true) with check(decided_by=(select auth.uid()) and last_decision in ('approved','rejected'));
grant insert(actor_user_id,actor_role,action,target_type,target_id,before_state,after_state,reason) on private.audit_logs to padelhub_review_writer;
grant usage on sequence private.audit_logs_id_seq to padelhub_review_writer;
create policy review_audit on private.audit_logs for insert to padelhub_review_writer with check(actor_user_id=(select auth.uid()) and actor_role in ('admin','moderator') and target_type='listing');

create function private.verified_reviewer() returns uuid language plpgsql set search_path='' as $$
declare caller uuid:=private.verified_profile_caller();
begin
 if auth.jwt()->>'aal' is distinct from 'aal2' then raise exception 'Admin MFA required' using errcode='42501'; end if;
 -- A role revocation serializes with an in-flight review/decision.
 perform 1 from private.admin_roles where user_id=caller and revoked_at is null and role in ('admin','moderator') for share;
 if not found then raise exception 'Active admin role required' using errcode='42501'; end if;
 return caller;
end $$;
create function private.review_media_manifest(p_listing_id uuid) returns jsonb language sql set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('media_id',a.id,'sort_order',m.sort_order,
 'ready_attempt_id',a.ready_attempt_id,'content_sha256',a.content_sha256,'variants',a.ready_manifest) order by m.sort_order),'[]'::jsonb)
 from public.listing_media m join public.media_assets a on a.id=m.media_id where m.listing_id=p_listing_id;
$$;
create function public.admin_get_listing_review(p_listing_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.verified_reviewer(); seller uuid; p public.seller_profiles; l public.listings; listing_json jsonb;
begin
 select seller_id into seller from public.listings where id=p_listing_id;
 if not found then raise exception 'Listing unavailable' using errcode='42501'; end if;
 select * into p from public.seller_profiles where user_id=seller for update;
 select * into l from public.listings where id=p_listing_id for update;
 if not found then raise exception 'Listing unavailable' using errcode='42501'; end if;
 perform a.id from public.media_assets a join public.listing_media m on m.media_id=a.id where m.listing_id=l.id order by a.id for update of a;
 listing_json:=jsonb_build_object(
 'id',l.id,
 'seller_id',l.seller_id,
 'category',l.category,
 'status',l.status,
 'title',l.title,
 'brand_slug',l.brand_slug,
 'brand_custom',l.brand_custom,
 'model',l.model,
 'description',l.description,
 'governorate_slug',l.governorate_slug,
 'district_text',l.district_text,
 'condition',l.condition,
 'condition_disclosure',l.condition_disclosure,
 'offer_type',l.offer_type,
 'price_egp',l.price_egp,
 'is_negotiable',l.is_negotiable,
 'swap_preference',l.swap_preference,
 'racket_damage_repair_disclosure',l.racket_damage_repair_disclosure,
 'racket_year',l.racket_year,
 'racket_shape',l.racket_shape,
 'racket_weight_grams',l.racket_weight_grams,
 'racket_purchase_date',l.racket_purchase_date,
 'balls_quantity_packaging',l.balls_quantity_packaging,
 'balls_availability_note',l.balls_availability_note,
 'version',l.version,
 'content_version',l.content_version,
 'last_approved_content_version',l.last_approved_content_version,
 'submitted_at',l.submitted_at);
 return jsonb_build_object('listing',listing_json,'profile',jsonb_build_object('user_id',p.user_id,'version',p.version,
 'username',p.username,'display_name',p.display_name,'account_type',p.account_type,'account_status',p.account_status,
 'is_public',p.is_public,'public_contact_consent',p.public_contact_consent,
 'has_contact',exists(select 1 from private.seller_contacts where user_id=p.user_id and whatsapp_e164 is not null)),
 'media_manifest',private.review_media_manifest(l.id));
end $$;
create function private.decide_listing(p_listing_id uuid,p_expected_listing_version integer,p_expected_content_version integer,
 p_expected_profile_version integer,p_reviewed_manifest jsonb,p_decision text,p_reason text) returns jsonb language plpgsql set search_path='' as $$
declare caller uuid:=private.verified_reviewer(); seller uuid; p public.seller_profiles; l public.listings;
 settings public.platform_settings; manifest jsonb; photos integer; counted integer; cap integer; actor text;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'Review decisions require READ COMMITTED isolation' using errcode='25001'; end if;
 if p_decision not in ('approved','rejected') or p_decision is null then raise exception 'Invalid decision' using errcode='22023'; end if;
 if char_length(p_reason)>1000 or (p_decision='rejected' and char_length(btrim(coalesce(p_reason,'')))=0) then raise exception 'Rejection reason required, at most 1000 characters' using errcode='22023'; end if;
 select * into settings from public.platform_settings where id for share;
 if not found then raise exception 'Settings unavailable' using errcode='55000'; end if;
 select seller_id into seller from public.listings where id=p_listing_id;
 if not found then raise exception 'Listing unavailable' using errcode='42501'; end if;
 select * into p from public.seller_profiles where user_id=seller for update;
 if not found then raise exception 'Profile unavailable' using errcode='42501'; end if;
 select * into l from public.listings where id=p_listing_id for update;
 if not found then raise exception 'Listing unavailable' using errcode='42501'; end if;
 if l.status<>'pending' or l.version is distinct from p_expected_listing_version or l.content_version is distinct from p_expected_content_version or p.version is distinct from p_expected_profile_version then
  raise exception 'Stale review; reload listing and profile' using errcode='PT409'; end if;
 perform a.id from public.media_assets a join public.listing_media m on m.media_id=a.id where m.listing_id=l.id order by a.id for update of a;
 manifest:=private.review_media_manifest(l.id);
 if p_reviewed_manifest is distinct from manifest then raise exception 'Stale reviewed media manifest' using errcode='PT409'; end if;
 if p_decision='approved' then
  if p.account_status<>'active' or not p.is_public or not p.public_contact_consent or not exists(select 1 from private.seller_contacts where user_id=seller and whatsapp_e164 is not null) then
   raise exception 'Public active profile and explicit contact consent required' using errcode='23514'; end if;
  cap:=coalesce(p.listing_limit_override,case when p.account_type='business' then settings.business_active_pending_limit else settings.individual_active_pending_limit end);
  select count(*) into counted from public.listings where seller_id=seller and status in ('active','pending');
  if counted>cap then raise exception 'Approval exceeds current listing limit' using errcode='PT409'; end if;
  select count(*) into photos from public.listing_media m join public.media_assets a on a.id=m.media_id
   where m.listing_id=l.id and m.owner_id=seller and a.owner_id=seller and a.purpose='listing_photo' and a.status='ready';
  if photos<>jsonb_array_length(manifest) or photos<(case when l.category='rackets' then 3 else 1 end) or photos>6 then
   raise exception 'Invalid reviewed photos' using errcode='23514'; end if;
  -- Existing listing_complete CHECK is re-evaluated on this update.
  update public.listings set status='active',last_approved_content_version=content_version,
   approved_at=now(),published_at=coalesce(published_at,now()),version=version+1,updated_at=now() where id=l.id;
 else
  update public.listings set status='rejected',version=version+1,updated_at=now() where id=l.id;
 end if;
 insert into private.listing_moderation_state(listing_id,last_decision,decision_reason,decided_by,decided_at,
 reviewed_listing_version,reviewed_content_version,reviewed_profile_version,reviewed_media_manifest)
 values(l.id,p_decision,p_reason,caller,now(),l.version,l.content_version,p.version,manifest)
 on conflict(listing_id) do update set last_decision=excluded.last_decision,decision_reason=excluded.decision_reason,
 decided_by=excluded.decided_by,decided_at=excluded.decided_at,reviewed_listing_version=excluded.reviewed_listing_version,
 reviewed_content_version=excluded.reviewed_content_version,reviewed_profile_version=excluded.reviewed_profile_version,reviewed_media_manifest=excluded.reviewed_media_manifest;
 select role into actor from private.admin_roles where user_id=caller;
 insert into private.audit_logs(actor_user_id,actor_role,action,target_type,target_id,before_state,after_state,reason)
 values(caller,actor,'listing.'||p_decision,'listing',l.id::text,
 jsonb_build_object('status',l.status,'version',l.version,'content_version',l.content_version,'profile_version',p.version),
 jsonb_build_object('status',case when p_decision='approved' then 'active' else 'rejected' end,'version',l.version+1,
 'reviewed_content_version',l.content_version,'reviewed_profile_version',p.version,'reviewed_media_manifest',manifest),p_reason);
 return jsonb_build_object('id',l.id,'status',case when p_decision='approved' then 'active' else 'rejected' end,'version',l.version+1);
end $$;
create function public.admin_approve_listing(p_listing_id uuid,p_expected_listing_version integer,p_expected_content_version integer,p_expected_profile_version integer,p_reviewed_manifest jsonb)
returns jsonb language sql security definer set search_path='' as $$
 select private.decide_listing(p_listing_id,p_expected_listing_version,p_expected_content_version,p_expected_profile_version,p_reviewed_manifest,'approved',null);
$$;
create function public.admin_reject_listing(p_listing_id uuid,p_expected_listing_version integer,p_expected_content_version integer,p_expected_profile_version integer,p_reviewed_manifest jsonb,p_reason text)
returns jsonb language sql security definer set search_path='' as $$
 select private.decide_listing(p_listing_id,p_expected_listing_version,p_expected_content_version,p_expected_profile_version,p_reviewed_manifest,'rejected',p_reason);
$$;
grant create on schema public,private to padelhub_review_writer;
alter function private.verified_reviewer() owner to padelhub_review_writer;
revoke all on function private.verified_reviewer() from public,anon,authenticated;
alter function private.review_media_manifest(uuid) owner to padelhub_review_writer;
revoke all on function private.review_media_manifest(uuid) from public,anon,authenticated;
alter function private.decide_listing(uuid,integer,integer,integer,jsonb,text,text) owner to padelhub_review_writer;
revoke all on function private.decide_listing(uuid,integer,integer,integer,jsonb,text,text) from public,anon,authenticated;
alter function public.admin_get_listing_review(uuid) owner to padelhub_review_writer;
revoke all on function public.admin_get_listing_review(uuid) from public,anon,authenticated;
grant execute on function public.admin_get_listing_review(uuid) to authenticated;
alter function public.admin_approve_listing(uuid,integer,integer,integer,jsonb) owner to padelhub_review_writer;
revoke all on function public.admin_approve_listing(uuid,integer,integer,integer,jsonb) from public,anon,authenticated;
grant execute on function public.admin_approve_listing(uuid,integer,integer,integer,jsonb) to authenticated;
alter function public.admin_reject_listing(uuid,integer,integer,integer,jsonb,text) owner to padelhub_review_writer;
revoke all on function public.admin_reject_listing(uuid,integer,integer,integer,jsonb,text) from public,anon,authenticated;
grant execute on function public.admin_reject_listing(uuid,integer,integer,integer,jsonb,text) to authenticated;
revoke create on schema public,private from padelhub_review_writer;
revoke padelhub_review_writer from postgres;
commit;
