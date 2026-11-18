-- Owner drafts and submit/withdraw only; no approval or public projection.
begin;
do $$ begin
 if not exists(select 1 from pg_roles where rolname='padelhub_listing_writer') then create role padelhub_listing_writer nologin noinherit nobypassrls; end if;
 if not exists(select 1 from pg_roles where rolname='padelhub_listing_guard') then create role padelhub_listing_guard nologin noinherit nobypassrls; end if;
end $$;
grant padelhub_listing_writer,padelhub_listing_guard to postgres;
grant usage on schema public,private,auth to padelhub_listing_writer;
grant usage on schema public,private to padelhub_listing_guard;
grant execute on function auth.uid() to padelhub_listing_writer;
grant padelhub_profile_writer to postgres;
grant execute on function private.verified_profile_caller() to padelhub_listing_writer;
revoke padelhub_profile_writer from postgres;
grant select(id,email_confirmed_at,banned_until,deleted_at) on auth.users to padelhub_listing_writer;
create policy listing_writer_identity on auth.users for select to padelhub_listing_writer using(id=(select auth.uid()));
grant select on public.seller_profiles,private.seller_contacts,public.platform_settings,public.listings,public.listing_media,public.media_assets to padelhub_listing_writer;
-- Column UPDATE grants permit row locks only; false WITH CHECK blocks writes.
grant update(user_id) on public.seller_profiles to padelhub_listing_writer;
grant update(id) on public.platform_settings,public.media_assets to padelhub_listing_writer;
create policy listing_writer_read on public.seller_profiles for select to padelhub_listing_writer using(user_id=(select auth.uid()));
create policy listing_writer_read on public.listings for select to padelhub_listing_writer using(seller_id=(select auth.uid()));
create policy listing_writer_read on public.listing_media for select to padelhub_listing_writer using(owner_id=(select auth.uid()));
create policy listing_writer_read on public.media_assets for select to padelhub_listing_writer using(owner_id=(select auth.uid()));
create policy listing_contact_read on private.seller_contacts for select to padelhub_listing_writer using(user_id=(select auth.uid()));
create policy listing_settings_read on public.platform_settings for select to padelhub_listing_writer using(true);
create policy listing_lock on public.seller_profiles for update to padelhub_listing_writer using(user_id=(select auth.uid())) with check(false);
create policy listing_lock on public.media_assets for update to padelhub_listing_writer using(owner_id=(select auth.uid())) with check(false);
create policy listing_lock on public.platform_settings for update to padelhub_listing_writer using(true) with check(false);
grant insert(seller_id,category),update(category,title,brand_slug,brand_custom,model,description,governorate_slug,district_text,condition,condition_disclosure,offer_type,price_egp,is_negotiable,swap_preference,racket_damage_repair_disclosure,racket_year,racket_shape,racket_weight_grams,racket_purchase_date,balls_quantity_packaging,balls_availability_note,status,version,content_version,submitted_at,updated_at) on public.listings to padelhub_listing_writer;
grant insert(listing_id,owner_id,media_id,sort_order),delete on public.listing_media to padelhub_listing_writer;
create policy listing_insert on public.listings for insert to padelhub_listing_writer with check(seller_id=(select auth.uid()) and status='draft');
create policy listing_update on public.listings for update to padelhub_listing_writer using(seller_id=(select auth.uid())) with check(seller_id=(select auth.uid()) and status in ('draft','pending','rejected'));
create policy attachment_insert on public.listing_media for insert to padelhub_listing_writer with check(owner_id=(select auth.uid()));
create policy attachment_delete on public.listing_media for delete to padelhub_listing_writer using(owner_id=(select auth.uid()));
grant insert(actor_user_id,actor_role,action,target_type,target_id,after_state) on private.audit_logs to padelhub_listing_writer;
grant usage on sequence private.audit_logs_id_seq to padelhub_listing_writer;
create policy listing_audit_append on private.audit_logs for insert to padelhub_listing_writer with check(actor_user_id=(select auth.uid()) and actor_role='owner' and target_type='listing');
-- Deferred checks outlive SECURITY DEFINER frames. This role can only read.
grant select on public.listings,public.listing_media to padelhub_listing_guard;
create policy listing_guard_read on public.listings for select to padelhub_listing_guard using(true);
create policy attachment_guard_read on public.listing_media for select to padelhub_listing_guard using(true);
grant create on schema private to padelhub_listing_guard;
alter function private.check_photo_count() security definer;
alter function private.check_photo_count() owner to padelhub_listing_guard;
revoke create on schema private from padelhub_listing_guard;

create function private.record_listing_action(caller uuid,listing uuid,action_name text,new_version integer) returns void language sql set search_path='' as $$
 insert into private.audit_logs(actor_user_id,actor_role,action,target_type,target_id,after_state)
 values(caller,'owner',action_name,'listing',listing::text,jsonb_build_object('version',new_version));
$$;
create function public.get_my_listing(p_listing_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.verified_profile_caller(); result jsonb;
begin
 select jsonb_build_object('id',l.id,'seller_id',l.seller_id,'status',l.status,
'category',l.category,
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
 'submitted_at',l.submitted_at,
 'created_at',l.created_at,
 'updated_at',l.updated_at, 'media_ids',coalesce((select jsonb_agg(m.media_id order by m.sort_order) from public.listing_media m where m.listing_id=l.id),
 '[]'::jsonb))
 into result from public.listings l where l.id=p_listing_id and l.seller_id=caller;
 return result;
end $$;
create function public.create_listing_draft(p_category text) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.verified_profile_caller(); listing uuid;
begin
 perform 1 from public.seller_profiles where user_id=caller and account_status='active' for update;
 if not found then raise exception 'Profile unavailable' using errcode='42501'; end if;
 insert into public.listings(seller_id,category) values(caller,p_category) returning id into listing;
 perform private.record_listing_action(caller,listing,'listing.create',1);
 return public.get_my_listing(listing);
end $$;
create function public.update_listing_draft(p_listing_id uuid,p_expected_version integer,p_patch jsonb,p_media_ids uuid[] default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.verified_profile_caller(); l public.listings; edited public.listings; k text; v jsonb; media_count integer;
begin
 if p_patch is null or jsonb_typeof(p_patch)<>'object' or (p_patch='{}' and p_media_ids is null) then raise exception 'Draft patch required' using errcode='22023'; end if;
 for k,v in select * from jsonb_each(p_patch) loop
  if k not in ('category','title','brand_slug','brand_custom','model','description','governorate_slug','district_text','condition','condition_disclosure','offer_type','price_egp','is_negotiable','swap_preference','racket_damage_repair_disclosure','racket_year','racket_shape','racket_weight_grams','racket_purchase_date','balls_quantity_packaging','balls_availability_note') then raise exception 'Field not editable' using errcode='22023'; end if;
  if k='is_negotiable' then
   if jsonb_typeof(v)<>'boolean' then raise exception 'Boolean required' using errcode='22023'; end if;
  elsif k in ('price_egp','racket_year','racket_weight_grams') then
   if v<>'null'::jsonb and (jsonb_typeof(v)<>'number' or v::text !~ '^[0-9]+$') then raise exception 'Integer required' using errcode='22023'; end if;
  elsif v<>'null'::jsonb and jsonb_typeof(v)<>'string' then raise exception 'Text required' using errcode='22023';
  end if;
 end loop;
 perform 1 from public.seller_profiles where user_id=caller and account_status='active' for update;
 if not found then raise exception 'Profile unavailable' using errcode='42501'; end if;
 select * into l from public.listings where id=p_listing_id and seller_id=caller for update;
 if not found then raise exception 'Listing unavailable' using errcode='42501'; end if;
 if p_expected_version is distinct from l.version then raise exception 'Stale listing version' using errcode='PT409'; end if;
 if l.status not in ('draft','rejected') then raise exception 'Withdraw before editing' using errcode='PT409'; end if;
 if l.status<>'draft' and p_patch?'category' and p_patch->>'category' is distinct from l.category then raise exception 'Category editable only in draft' using errcode='22023'; end if;
 edited:=jsonb_populate_record(l,p_patch);
 if p_media_ids is not null then
  if cardinality(p_media_ids)>6 or array_ndims(p_media_ids)>1 or array_position(p_media_ids,null) is not null or
     (select count(distinct x) from unnest(p_media_ids) x)<>cardinality(p_media_ids) then raise exception 'Invalid media list' using errcode='22023'; end if;
  -- Stable asset lock ordering; readiness is checked before replacing attachments.
  perform id from public.media_assets where id=any(p_media_ids) and owner_id=caller order by id for update;
  select count(*) into media_count from public.media_assets where id=any(p_media_ids) and owner_id=caller and purpose='listing_photo' and status='ready';
  if media_count<>cardinality(p_media_ids) then raise exception 'Media unavailable or not ready' using errcode='23514'; end if;
  delete from public.listing_media where listing_id=l.id;
  insert into public.listing_media(listing_id,owner_id,media_id,sort_order)
  select l.id,caller,x,(ord-1)::smallint from unnest(p_media_ids) with ordinality as a(x,ord);
 end if;
 update public.listings set
 category=edited.category,
 title=edited.title,
 brand_slug=edited.brand_slug,
 brand_custom=edited.brand_custom,
 model=edited.model,
 description=edited.description,
 governorate_slug=edited.governorate_slug,
 district_text=edited.district_text,
 condition=edited.condition,
 condition_disclosure=edited.condition_disclosure,
 offer_type=edited.offer_type,
 price_egp=edited.price_egp,
 is_negotiable=edited.is_negotiable,
 swap_preference=edited.swap_preference,
 racket_damage_repair_disclosure=edited.racket_damage_repair_disclosure,
 racket_year=edited.racket_year,
 racket_shape=edited.racket_shape,
 racket_weight_grams=edited.racket_weight_grams,
 racket_purchase_date=edited.racket_purchase_date,
 balls_quantity_packaging=edited.balls_quantity_packaging,
 balls_availability_note=edited.balls_availability_note,version=version+1,content_version=content_version+1,updated_at=now() where id=l.id;
 perform private.record_listing_action(caller,l.id,'listing.edit',l.version+1);
 return public.get_my_listing(l.id);
end $$;
create function public.submit_listing(p_listing_id uuid,p_expected_version integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.verified_profile_caller(); p public.seller_profiles; l public.listings; settings public.platform_settings; cap integer; counted integer; photos integer;
begin
 -- A waiter must recount with a fresh statement snapshot after the seller lock.
 -- Reject fixed-snapshot transactions rather than relying on the API default.
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'Submission requires READ COMMITTED isolation' using errcode='25001'; end if;
 select * into settings from public.platform_settings where id for share;
 if not found then raise exception 'Settings unavailable' using errcode='55000'; end if;
 select * into p from public.seller_profiles where user_id=caller for update;
 if not found or p.account_status<>'active' then raise exception 'Profile unavailable' using errcode='42501'; end if;
 select * into l from public.listings where id=p_listing_id and seller_id=caller for update;
 if not found then raise exception 'Listing unavailable' using errcode='42501'; end if;
 if p_expected_version is distinct from l.version then raise exception 'Stale listing version' using errcode='PT409'; end if;
 if l.status not in ('draft','rejected') then raise exception 'Listing is not a draft or rejected' using errcode='PT409'; end if;
 if not p.is_public or not p.public_contact_consent or not exists(select 1 from private.seller_contacts where user_id=caller and whatsapp_e164 is not null) then
  raise exception 'Public profile and explicit contact consent required' using errcode='23514'; end if;
 cap:=coalesce(p.listing_limit_override,case when p.account_type='business' then settings.business_active_pending_limit else settings.individual_active_pending_limit end);
 select count(*) into counted from public.listings where seller_id=caller and status in ('active','pending');
 if counted>=cap then raise exception 'Listing limit reached' using errcode='PT409'; end if;
 perform a.id from public.media_assets a join public.listing_media m on m.media_id=a.id where m.listing_id=l.id order by a.id for update of a;
 select count(*) into photos from public.listing_media m join public.media_assets a on a.id=m.media_id where m.listing_id=l.id and a.owner_id=caller and a.status='ready' and a.purpose='listing_photo';
 if photos<(case when l.category='rackets' then 3 else 1 end) or photos>6 then raise exception 'Invalid listing photo count' using errcode='23514'; end if;
 update public.listings set status='pending',version=version+1,submitted_at=now(),updated_at=now() where id=l.id;
 perform private.record_listing_action(caller,l.id,'listing.submit',l.version+1);
 return public.get_my_listing(l.id);
end $$;
create function public.withdraw_listing(p_listing_id uuid,p_expected_version integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.verified_profile_caller(); l public.listings;
begin
 perform 1 from public.platform_settings where id for share;
 if not found then raise exception 'Settings unavailable' using errcode='55000'; end if;
 perform 1 from public.seller_profiles where user_id=caller for update;
 if not found then raise exception 'Profile unavailable' using errcode='42501'; end if;
 select * into l from public.listings where id=p_listing_id and seller_id=caller for update;
 if not found then raise exception 'Listing unavailable' using errcode='42501'; end if;
 if p_expected_version is distinct from l.version then raise exception 'Stale listing version' using errcode='PT409'; end if;
 if l.status not in ('pending','active','reserved') then raise exception 'Listing cannot be withdrawn' using errcode='PT409'; end if;
 update public.listings set status='draft',version=version+1,updated_at=now() where id=l.id;
 perform private.record_listing_action(caller,l.id,'listing.withdraw',l.version+1);
 return public.get_my_listing(l.id);
end $$;
grant create on schema public,private to padelhub_listing_writer;
alter function private.record_listing_action(uuid,uuid,text,integer) owner to padelhub_listing_writer;
alter function public.get_my_listing(uuid) owner to padelhub_listing_writer;
revoke all on function public.get_my_listing(uuid) from public,anon;
grant execute on function public.get_my_listing(uuid) to authenticated;
alter function public.create_listing_draft(text) owner to padelhub_listing_writer;
revoke all on function public.create_listing_draft(text) from public,anon;
grant execute on function public.create_listing_draft(text) to authenticated;
alter function public.update_listing_draft(uuid,integer,jsonb,uuid[]) owner to padelhub_listing_writer;
revoke all on function public.update_listing_draft(uuid,integer,jsonb,uuid[]) from public,anon;
grant execute on function public.update_listing_draft(uuid,integer,jsonb,uuid[]) to authenticated;
alter function public.submit_listing(uuid,integer) owner to padelhub_listing_writer;
revoke all on function public.submit_listing(uuid,integer) from public,anon;
grant execute on function public.submit_listing(uuid,integer) to authenticated;
alter function public.withdraw_listing(uuid,integer) owner to padelhub_listing_writer;
revoke all on function public.withdraw_listing(uuid,integer) from public,anon;
grant execute on function public.withdraw_listing(uuid,integer) to authenticated;
revoke create on schema public,private from padelhub_listing_writer;
revoke padelhub_listing_writer,padelhub_listing_guard from postgres;
commit;
