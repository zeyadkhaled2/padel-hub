-- Pending deletion is a database mutation boundary, including profile-less accounts.
begin;
grant padelhub_profile_writer,padelhub_listing_writer,padelhub_photo_writer to postgres;

-- Always lock the existing Auth row before profile/listing rows. Deletion updates
-- this row, so a stale REPEATABLE READ snapshot fails with 40001 after waiting.
create function private.lock_account(p_owner uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from auth.users where id=p_owner for no key update;
 if not found then raise exception 'Account unavailable' using errcode='42501'; end if;
end $$;
create function private.require_mutable_account(p_owner uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_account(p_owner);
 if exists(select 1 from private.account_deletion_requests where user_id=p_owner and status='pending') then
  raise exception 'Account deletion pending' using errcode='42501';
 end if;
end $$;
revoke all on function private.lock_account(uuid),private.require_mutable_account(uuid) from public,anon,authenticated,service_role;
grant execute on function private.lock_account(uuid) to padelhub_profile_writer;
grant execute on function private.require_mutable_account(uuid) to padelhub_profile_writer,padelhub_listing_writer,padelhub_photo_writer;

-- Mark the shared lock row changed when request status changes. This also covers
-- operator cancellation and protects fixed-snapshot transactions from stale reads.
create function private.serialize_deletion_request() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update auth.users set updated_at=clock_timestamp() where id=new.user_id;
 return new;
end $$;
revoke all on function private.serialize_deletion_request() from public,anon,authenticated,service_role;
create trigger serialize_deletion_request before insert or update on private.account_deletion_requests
 for each row execute function private.serialize_deletion_request();

create or replace function public.create_seller_profile(p_username text,p_display_name text,p_governorate_slug text,p_account_type text default 'individual') returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.verified_profile_caller();
begin
 perform private.require_mutable_account(caller);
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

create or replace function public.rename_seller_username(p_expected_version integer,p_username text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.verified_profile_caller(); p public.seller_profiles;
begin
 perform private.require_mutable_account(caller);
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

create or replace function public.update_seller_profile(p_expected_version integer,p_patch jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.verified_profile_caller(); p public.seller_profiles; k text; v jsonb;
 individual_limit integer; business_limit integer; target_type text; counted integer;
begin
 perform private.require_mutable_account(caller);
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

create or replace function public.update_my_contact(p_expected_profile_version integer,p_expected_contact_version integer,p_whatsapp_e164 text,p_public_contact_consent boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.verified_profile_caller(); p public.seller_profiles; c private.seller_contacts; consent boolean;
begin
 perform private.require_mutable_account(caller);
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

create or replace function public.create_listing_draft(p_category text) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.verified_profile_caller(); listing uuid;
begin
 perform private.require_mutable_account(caller);
 perform 1 from public.seller_profiles where user_id=caller and account_status='active' for update;
 if not found then raise exception 'Profile unavailable' using errcode='42501'; end if;
 insert into public.listings(seller_id,category) values(caller,p_category) returning id into listing;
 perform private.record_listing_action(caller,listing,'listing.create',1);
 return public.get_my_listing(listing);
end $$;

create or replace function public.update_listing_draft(
 p_listing_id uuid,
 p_expected_version integer,
 p_patch jsonb,
 p_media_ids uuid[] default null
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 caller uuid := private.verified_profile_caller();
 l public.listings;
 edited public.listings;
 k text;
 v jsonb;
 media_count integer;
begin
 perform private.require_mutable_account(caller);
 if p_patch is null or jsonb_typeof(p_patch) <> 'object' or (p_patch = '{}' and p_media_ids is null) then
  raise exception 'Draft patch required' using errcode = '22023';
 end if;
 for k, v in select * from jsonb_each(p_patch) loop
  if k not in (
   'shoe_size_eu', 'category', 'title', 'brand_slug', 'brand_custom', 'model', 'description',
   'governorate_slug', 'district_text', 'condition', 'condition_disclosure', 'offer_type',
   'price_egp', 'is_negotiable', 'swap_preference', 'racket_damage_repair_disclosure',
   'racket_year', 'racket_shape', 'racket_weight_grams', 'racket_purchase_date',
   'balls_quantity_packaging', 'balls_availability_note'
  ) then
   raise exception 'Field not editable' using errcode = '22023';
  end if;
  if k = 'shoe_size_eu' then
   if v <> 'null'::jsonb and jsonb_typeof(v) <> 'number' then
    raise exception 'Numeric shoe size required' using errcode = '22023';
   end if;
  elsif k = 'is_negotiable' then
   if jsonb_typeof(v) <> 'boolean' then
    raise exception 'Boolean required' using errcode = '22023';
   end if;
  elsif k in ('price_egp', 'racket_year', 'racket_weight_grams') then
   if v <> 'null'::jsonb and (jsonb_typeof(v) <> 'number' or v::text !~ '^[0-9]+$') then
    raise exception 'Integer required' using errcode = '22023';
   end if;
  elsif v <> 'null'::jsonb and jsonb_typeof(v) <> 'string' then
   raise exception 'Text required' using errcode = '22023';
  end if;
 end loop;

 perform 1 from public.seller_profiles where user_id = caller and account_status = 'active' for update;
 if not found then raise exception 'Profile unavailable' using errcode = '42501'; end if;

 select * into l from public.listings where id = p_listing_id and seller_id = caller for update;
 if not found then raise exception 'Listing unavailable' using errcode = '42501'; end if;
 if p_expected_version is distinct from l.version then
  raise exception 'Stale listing version' using errcode = 'PT409';
 end if;
 if l.status not in ('draft', 'rejected') then
  raise exception 'Withdraw before editing' using errcode = 'PT409';
 end if;
 if l.status <> 'draft' and p_patch ? 'category' and p_patch->>'category' is distinct from l.category then
  raise exception 'Category editable only in draft' using errcode = '22023';
 end if;

 edited := jsonb_populate_record(l, p_patch);

 if p_media_ids is not null then
  if cardinality(p_media_ids) > 4
   or array_ndims(p_media_ids) > 1
   or array_position(p_media_ids, null) is not null
   or (select count(distinct x) from unnest(p_media_ids) x) <> cardinality(p_media_ids) then
   raise exception 'Invalid media list' using errcode = '22023';
  end if;
  -- Stable asset lock ordering; readiness is checked before replacing attachments.
  perform id from public.media_assets where id = any(p_media_ids) and owner_id = caller order by id for update;
  select count(*) into media_count
  from public.media_assets
  where id = any(p_media_ids) and owner_id = caller and purpose = 'listing_photo' and status = 'ready';
  if media_count <> cardinality(p_media_ids) then
   raise exception 'Media unavailable or not ready' using errcode = '23514';
  end if;
  delete from public.listing_media where listing_id = l.id;
  insert into public.listing_media(listing_id, owner_id, media_id, sort_order)
  select l.id, caller, x, (ord - 1)::smallint
  from unnest(p_media_ids) with ordinality as a(x, ord);
 end if;

 update public.listings set
  shoe_size_eu = edited.shoe_size_eu,
  category = edited.category,
  title = edited.title,
  brand_slug = edited.brand_slug,
  brand_custom = edited.brand_custom,
  model = edited.model,
  description = edited.description,
  governorate_slug = edited.governorate_slug,
  district_text = edited.district_text,
  condition = edited.condition,
  condition_disclosure = edited.condition_disclosure,
  offer_type = edited.offer_type,
  price_egp = edited.price_egp,
  is_negotiable = edited.is_negotiable,
  swap_preference = edited.swap_preference,
  racket_damage_repair_disclosure = edited.racket_damage_repair_disclosure,
  racket_year = edited.racket_year,
  racket_shape = edited.racket_shape,
  racket_weight_grams = edited.racket_weight_grams,
  racket_purchase_date = edited.racket_purchase_date,
  balls_quantity_packaging = edited.balls_quantity_packaging,
  balls_availability_note = edited.balls_availability_note,
  version = version + 1,
  content_version = content_version + 1,
  updated_at = now()
 where id = l.id;

 perform private.record_listing_action(caller, l.id, 'listing.edit', l.version + 1);
 return public.get_my_listing(l.id);
end $$;

create or replace function public.submit_listing(p_listing_id uuid, p_expected_version integer)
returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 caller uuid := private.verified_profile_caller();
 p public.seller_profiles;
 l public.listings;
 settings public.platform_settings;
 cap integer;
 counted integer;
 photos integer;
begin
 perform private.require_mutable_account(caller);
 -- A waiter must recount with a fresh statement snapshot after the seller lock.
 -- Reject fixed-snapshot transactions rather than relying on the API default.
 if current_setting('transaction_isolation') <> 'read committed' then
  raise exception 'Submission requires READ COMMITTED isolation' using errcode = '25001';
 end if;
 select * into settings from public.platform_settings where id for share;
 if not found then raise exception 'Settings unavailable' using errcode = '55000'; end if;
 select * into p from public.seller_profiles where user_id = caller for update;
 if not found or p.account_status <> 'active' then raise exception 'Profile unavailable' using errcode = '42501'; end if;
 select * into l from public.listings where id = p_listing_id and seller_id = caller for update;
 if not found then raise exception 'Listing unavailable' using errcode = '42501'; end if;
 if p_expected_version is distinct from l.version then raise exception 'Stale listing version' using errcode = 'PT409'; end if;
 if l.status not in ('draft', 'rejected') then raise exception 'Listing is not a draft or rejected' using errcode = 'PT409'; end if;
 if not p.is_public or not p.public_contact_consent or not exists(
  select 1 from private.seller_contacts where user_id = caller and whatsapp_e164 is not null
 ) then
  raise exception 'Public profile and explicit contact consent required' using errcode = '23514';
 end if;
 cap := coalesce(
  p.listing_limit_override,
  case when p.account_type = 'business' then settings.business_active_pending_limit else settings.individual_active_pending_limit end
 );
 select count(*) into counted from public.listings where seller_id = caller and status in ('active', 'pending');
 if counted >= cap then raise exception 'Listing limit reached' using errcode = 'PT409'; end if;
 perform a.id from public.media_assets a join public.listing_media m on m.media_id = a.id where m.listing_id = l.id order by a.id for update of a;
 select count(*) into photos
 from public.listing_media m
 join public.media_assets a on a.id = m.media_id
 where m.listing_id = l.id and a.owner_id = caller and a.status = 'ready' and a.purpose = 'listing_photo';
 if photos < 3 or photos > 4 then
  raise exception 'Invalid listing photo count' using errcode = '23514';
 end if;
 update public.listings set status = 'pending', version = version + 1, submitted_at = now(), updated_at = now() where id = l.id;
 perform private.record_listing_action(caller, l.id, 'listing.submit', l.version + 1);
 return public.get_my_listing(l.id);
end $$;

create or replace function public.withdraw_listing(p_listing_id uuid,p_expected_version integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.verified_profile_caller(); l public.listings;
begin
 perform private.require_mutable_account(caller);
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

create or replace function public.change_listing_status(
 p_listing_id uuid,
 p_expected_version integer,
 p_action text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 caller uuid := private.verified_profile_caller();
 l public.listings;
 next_status text;
begin
 perform private.require_mutable_account(caller);
 if p_action is null or p_action not in ('sold', 'traded', 'archive', 'relist', 'reopen') then
  raise exception 'Invalid listing action' using errcode = '22023';
 end if;

 -- Keep the same lock order as submission and moderation.
 perform 1 from public.platform_settings where id for share;
 if not found then
  raise exception 'Settings unavailable' using errcode = '55000';
 end if;
 perform 1 from public.seller_profiles where user_id = caller and account_status = 'active' for update;
 if not found then
  raise exception 'Profile unavailable' using errcode = '42501';
 end if;
 select * into l from public.listings where id = p_listing_id and seller_id = caller for update;
 if not found then
  raise exception 'Listing unavailable' using errcode = '42501';
 end if;
 if l.version is distinct from p_expected_version then
  raise exception 'Stale listing version' using errcode = 'PT409';
 end if;

 if p_action in ('sold', 'traded') then
  if l.status <> 'active' then
   raise exception 'Listing is not active' using errcode = 'PT409';
  end if;
  if (p_action = 'sold' and l.offer_type not in ('sale', 'both')) or
     (p_action = 'traded' and (l.category <> 'rackets' or l.offer_type not in ('swap', 'both'))) then
   raise exception 'Action does not match offer' using errcode = '22023';
  end if;
  next_status := p_action;
 elsif p_action = 'archive' then
  if l.status not in ('pending', 'active') then
   raise exception 'Listing cannot be archived' using errcode = 'PT409';
  end if;
  next_status := 'archived';
 elsif p_action = 'reopen' then
  if l.status not in ('sold', 'traded', 'archived') then
   raise exception 'Listing cannot be reopened' using errcode = 'PT409';
  end if;
  next_status := 'draft';
 else
  if l.status not in ('sold', 'traded', 'archived') then
   raise exception 'Listing cannot be relisted' using errcode = 'PT409';
  end if;
  next_status := 'draft';
 end if;

 update public.listings
 set status = next_status, version = version + 1, updated_at = now()
 where id = l.id;
 perform private.record_listing_action(caller, l.id, 'listing.' || p_action, l.version + 1);

 -- Reuse all submission checks for one-step relist. Failure rolls back the entire
 -- relist, including the temporary draft transition; no publication without a fresh
 -- admin decision. 'reopen' stops in private draft so sellers can update photos/details.
 if p_action = 'relist' then
  return public.submit_listing(l.id, l.version + 1);
 end if;
 return public.get_my_listing(l.id);
end $$;

create or replace function public.detach_listing_photo(
 p_listing_id uuid,
 p_expected_version integer,
 p_media_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 caller uuid := private.verified_profile_caller();
 l public.listings;
 remaining uuid[];
begin
 perform private.require_mutable_account(caller);
 if p_listing_id is null or p_expected_version is null or p_media_id is null then
  raise exception 'Photo attachment required' using errcode = '22023';
 end if;

 perform 1 from public.seller_profiles where user_id = caller and account_status = 'active' for update;
 if not found then
  raise exception 'Profile unavailable' using errcode = '42501';
 end if;

 select * into l from public.listings where id = p_listing_id and seller_id = caller for update;
 if not found then
  raise exception 'Listing unavailable' using errcode = '42501';
 end if;
 if l.version is distinct from p_expected_version then
  raise exception 'Stale listing version' using errcode = 'PT409';
 end if;
 if l.status not in ('draft', 'rejected') then
  raise exception 'Withdraw before editing' using errcode = 'PT409';
 end if;

 perform 1 from public.listing_media
 where listing_id = l.id and owner_id = caller and media_id = p_media_id;
 if not found then
  raise exception 'Photo attachment not found' using errcode = 'PT409';
 end if;

 select coalesce(array_agg(m.media_id order by m.sort_order), array[]::uuid[])
 into remaining
 from public.listing_media m
 where m.listing_id = l.id and m.owner_id = caller and m.media_id <> p_media_id;

 if cardinality(remaining) > 0 then
  -- Stable deterministic lock ordering before guard_attachment runs on re-insert.
  perform a.id
  from public.media_assets a
  where a.id = any(remaining) and a.owner_id = caller
  order by a.id
  for update;
 end if;

 -- Detach link rows only; underlying media_assets and media-private Storage
 -- objects are intentionally preserved and never deleted automatically.
 delete from public.listing_media where listing_id = l.id;

 if cardinality(remaining) > 0 then
  insert into public.listing_media(listing_id, owner_id, media_id, sort_order)
  select l.id, caller, x, (ord - 1)::smallint
  from unnest(remaining) with ordinality as a(x, ord);
 end if;

 update public.listings
 set version = version + 1, content_version = content_version + 1, updated_at = now()
 where id = l.id;

 perform private.record_listing_action(caller, l.id, 'listing.photo_detach', l.version + 1);
 return public.get_my_listing(l.id);
end $$;

create or replace function public.consume_photo_upload(p_owner uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare hits integer;
begin
 perform private.require_mutable_account(p_owner);
 insert into private.rate_limit_windows(bucket_key,hit_count) values('photo:'||p_owner::text,1)
 on conflict(bucket_key) do update set
  hit_count=case when private.rate_limit_windows.window_started_at<now()-interval '10 minutes' then 1 else private.rate_limit_windows.hit_count+1 end,
  window_started_at=case when private.rate_limit_windows.window_started_at<now()-interval '10 minutes' then now() else private.rate_limit_windows.window_started_at end
 returning hit_count into hits;
 return hits<=20;
end $$;

create or replace function public.save_listing_photo(
 p_owner uuid,
 p_listing uuid,
 p_version integer,
 p_asset uuid,
 p_attempt uuid,
 p_mime text,
 p_bytes integer,
 p_width integer,
 p_height integer,
 p_hash text,
 p_manifest jsonb,
 p_replace uuid default null,
 p_upload_key uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 l public.listings;
 slot integer;
 retained bigint;
 attached_count integer;
 existing_receipt private.photo_upload_idempotency;
begin
 perform private.require_mutable_account(p_owner);
 perform 1 from public.seller_profiles where user_id = p_owner and account_status = 'active' for update;
 if not found then raise exception 'Profile unavailable' using errcode = '42501'; end if;

 select * into l from public.listings where id = p_listing and seller_id = p_owner for update;
 if not found then raise exception 'Listing unavailable' using errcode = '42501'; end if;

 -- Check idempotency receipt under the listing row lock so concurrent or delayed retries
 -- of the exact same upload attempt never create duplicate attachments or repeat replacements.
 if p_upload_key is not null then
  select * into existing_receipt
  from private.photo_upload_idempotency
  where owner_id = p_owner
    and listing_id = l.id
    and upload_key = p_upload_key;

  if found then
   if existing_receipt.expected_version is distinct from p_version
      or existing_receipt.replace_photo_id is distinct from p_replace then
    raise exception 'Conflicting upload idempotency key reuse' using errcode = 'PT409';
   end if;
   return jsonb_build_object(
    'id', existing_receipt.asset_id,
    'version', greatest(l.version, existing_receipt.resulting_version),
    'media_ids', coalesce(
     (select jsonb_agg(lm.media_id order by lm.sort_order)
      from public.listing_media lm
      where lm.listing_id = l.id),
     '[]'::jsonb
    ),
    'idempotent', true
   );
  end if;
 end if;

 if l.version is distinct from p_version or l.status not in ('draft', 'rejected') then
  raise exception 'Reload draft before uploading' using errcode = 'PT409';
 end if;

 -- Simple safety allowance, including replaced files; never automatically erase them.
 select coalesce(sum(byte_size), 0) into retained from public.media_assets where owner_id = p_owner;
 if retained + p_bytes > 268435456 then
  raise exception 'Account photo storage allowance reached' using errcode = 'PT409';
 end if;

 if p_replace is not null then
  select sort_order into slot from public.listing_media where listing_id = l.id and media_id = p_replace;
  if not found then raise exception 'Replacement unavailable' using errcode = 'PT409'; end if;
 else
  select count(*) into attached_count from public.listing_media where listing_id = l.id;
  if attached_count >= 4 then
   raise exception 'Four photos maximum' using errcode = 'PT409';
  end if;
  select s into slot
  from generate_series(0, 3) s
  where not exists (select 1 from public.listing_media where listing_id = l.id and sort_order = s)
  order by s
  limit 1;
  if slot is null then raise exception 'Four photos maximum' using errcode = 'PT409'; end if;
 end if;

 insert into public.media_assets(
  id, owner_id, purpose, status, private_storage_path, input_mime_type,
  byte_size, width_px, height_px, exif_stripped, ready_attempt_id, ready_manifest, content_sha256
 ) values (
  p_asset, p_owner, 'listing_photo', 'ready', p_manifest->'full'->>'key', p_mime,
  p_bytes, p_width, p_height, true, p_attempt, p_manifest, p_hash
 );

 if p_replace is not null then
  delete from public.listing_media where listing_id = l.id and media_id = p_replace;
 end if;
 insert into public.listing_media(listing_id, owner_id, media_id, sort_order)
 values (l.id, p_owner, p_asset, slot);

 update public.listings
 set version = version + 1, content_version = content_version + 1, updated_at = now()
 where id = l.id;

 if p_upload_key is not null then
  -- Prune expired receipt rows only (>24h old); never touches media_assets or Storage objects.
  delete from private.photo_upload_idempotency
  where owner_id = p_owner
    and created_at < now() - interval '24 hours';

  insert into private.photo_upload_idempotency(
   owner_id, listing_id, upload_key, expected_version, replace_photo_id, asset_id, resulting_version
  ) values (
   p_owner, l.id, p_upload_key, p_version, p_replace, p_asset, l.version + 1
  );
 end if;

 return jsonb_build_object('id', p_asset, 'version', l.version + 1);
end $$;

create or replace function public.request_account_deletion(p_reason text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 caller uuid := private.verified_profile_caller();
 clean_reason text := nullif(btrim(coalesce(p_reason, '')), '');
 p public.seller_profiles;
 existing_req private.account_deletion_requests;
 saved_req private.account_deletion_requests;
 taken_offline boolean := false;
begin
 perform private.lock_account(caller);
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

revoke padelhub_profile_writer,padelhub_listing_writer,padelhub_photo_writer from postgres;
notify pgrst, 'reload schema';
commit;
