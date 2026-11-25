-- Phase UI-C: Enforce uniform 3-minimum / 4-maximum listing photo rules across
-- all equipment categories (rackets, balls, shoes, bags) with safe legacy
-- compatibility for existing 5–6 photo listings, and enrich owner listing
-- summaries for the Seller Dashboard.
-- Forward-only migration: never deletes or detaches existing media rows.
begin;

grant padelhub_listing_guard, padelhub_listing_writer, padelhub_review_writer, padelhub_photo_writer to postgres;

-- 1. Deferred photo-count invariant:
--    - All new submissions, pending states, approvals, and direct active/pending
--      inserts require 3–4 attached photos across every category.
--    - Existing already-published listings (active/reserved/sold/traded) retain
--      legacy compatibility (1–6 non-racket, 3–6 racket) across post-approval
--      lifecycle updates (e.g. marking sold/traded or updating availability)
--      so pre-existing 5–6 photo listings never break or lose attached photos.
create or replace function private.check_photo_count() returns trigger
language plpgsql security definer set search_path='' as $$
declare
 target uuid;
 l public.listings;
 photos integer;
 legacy_approved_transition boolean := false;
begin
 if tg_table_name = 'listings' then
  target := coalesce(new.id, old.id);
  legacy_approved_transition := tg_op = 'UPDATE'
   and old.status in ('active', 'reserved', 'sold', 'traded')
   and new.status in ('active', 'reserved', 'sold', 'traded');
 else
  target := coalesce(new.listing_id, old.listing_id);
 end if;

 select * into l from public.listings where id = target;
 if found and l.status in ('pending', 'active', 'reserved', 'sold', 'traded') then
  select count(*) into photos from public.listing_media where listing_id = target;
  if legacy_approved_transition then
   if photos < (case when l.category = 'rackets' then 3 else 1 end) or photos > 6 then
    raise exception 'invalid listing photo count' using errcode = '23514';
   end if;
  elsif photos < 3 or photos > 4 then
   raise exception 'invalid listing photo count' using errcode = '23514';
  end if;
 end if;
 return null;
end $$;

-- 2. Direct synchronous photo upload attachment:
--    - Maximum 4 attached photos per listing when adding a new photo.
--    - Replacing an existing photo preserves its exact sort_order (including
--      slots 4–5 on legacy 5–6 photo drafts) without consuming another slot.
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
 p_replace uuid default null
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 l public.listings;
 slot integer;
 retained bigint;
 attached_count integer;
begin
 perform 1 from public.seller_profiles where user_id = p_owner and account_status = 'active' for update;
 if not found then raise exception 'Profile unavailable' using errcode = '42501'; end if;

 select * into l from public.listings where id = p_listing and seller_id = p_owner for update;
 if not found then raise exception 'Listing unavailable' using errcode = '42501'; end if;
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

 return jsonb_build_object('id', p_asset, 'version', l.version + 1);
end $$;

-- 3. Draft editor update: enforce <= 4 photos when p_media_ids is supplied;
--    text-only updates (p_media_ids is null) leave existing attachments untouched.
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

-- 4. Listing submission: require 3–4 ready photos for all categories.
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

-- 5. Admin review decision: require 3–4 ready reviewed photos on approval for all categories.
create or replace function private.decide_listing(
 p_listing_id uuid,
 p_expected_listing_version integer,
 p_expected_content_version integer,
 p_expected_profile_version integer,
 p_reviewed_manifest jsonb,
 p_decision text,
 p_reason text
) returns jsonb
language plpgsql set search_path='' as $$
declare
 caller uuid := private.verified_reviewer();
 seller uuid;
 p public.seller_profiles;
 l public.listings;
 settings public.platform_settings;
 manifest jsonb;
 photos integer;
 counted integer;
 cap integer;
 actor text;
begin
 if current_setting('transaction_isolation') <> 'read committed' then
  raise exception 'Review decisions require READ COMMITTED isolation' using errcode = '25001';
 end if;
 if p_decision not in ('approved', 'rejected') or p_decision is null then
  raise exception 'Invalid decision' using errcode = '22023';
 end if;
 if char_length(p_reason) > 1000 or (p_decision = 'rejected' and char_length(btrim(coalesce(p_reason, ''))) = 0) then
  raise exception 'Rejection reason required, at most 1000 characters' using errcode = '22023';
 end if;
 select * into settings from public.platform_settings where id for share;
 if not found then raise exception 'Settings unavailable' using errcode = '55000'; end if;
 select seller_id into seller from public.listings where id = p_listing_id;
 if not found then raise exception 'Listing unavailable' using errcode = '42501'; end if;
 select * into p from public.seller_profiles where user_id = seller for update;
 if not found then raise exception 'Profile unavailable' using errcode = '42501'; end if;
 select * into l from public.listings where id = p_listing_id for update;
 if not found then raise exception 'Listing unavailable' using errcode = '42501'; end if;
 if l.status <> 'pending'
  or l.version is distinct from p_expected_listing_version
  or l.content_version is distinct from p_expected_content_version
  or p.version is distinct from p_expected_profile_version then
  raise exception 'Stale review; reload listing and profile' using errcode = 'PT409';
 end if;
 perform a.id from public.media_assets a join public.listing_media m on m.media_id = a.id where m.listing_id = l.id order by a.id for update of a;
 manifest := private.review_media_manifest(l.id);
 if p_reviewed_manifest is distinct from manifest then
  raise exception 'Stale reviewed media manifest' using errcode = 'PT409';
 end if;
 if p_decision = 'approved' then
  if p.account_status <> 'active' or not p.is_public or not p.public_contact_consent or not exists(
   select 1 from private.seller_contacts where user_id = seller and whatsapp_e164 is not null
  ) then
   raise exception 'Public active profile and explicit contact consent required' using errcode = '23514';
  end if;
  cap := coalesce(
   p.listing_limit_override,
   case when p.account_type = 'business' then settings.business_active_pending_limit else settings.individual_active_pending_limit end
  );
  select count(*) into counted from public.listings where seller_id = seller and status in ('active', 'pending');
  if counted > cap then raise exception 'Approval exceeds current listing limit' using errcode = 'PT409'; end if;
  select count(*) into photos
  from public.listing_media m
  join public.media_assets a on a.id = m.media_id
  where m.listing_id = l.id and m.owner_id = seller and a.owner_id = seller and a.purpose = 'listing_photo' and a.status = 'ready';
  if photos <> jsonb_array_length(manifest) or photos < 3 or photos > 4 then
   raise exception 'Invalid reviewed photos' using errcode = '23514';
  end if;
  -- Existing listing_complete CHECK is re-evaluated on this update.
  update public.listings
  set status = 'active', last_approved_content_version = content_version,
      approved_at = now(), published_at = coalesce(published_at, now()),
      version = version + 1, updated_at = now()
  where id = l.id;
 else
  update public.listings set status = 'rejected', version = version + 1, updated_at = now() where id = l.id;
 end if;
 insert into private.listing_moderation_state(
  listing_id, last_decision, decision_reason, decided_by, decided_at,
  reviewed_listing_version, reviewed_content_version, reviewed_profile_version, reviewed_media_manifest
 ) values (
  l.id, p_decision, p_reason, caller, now(), l.version, l.content_version, p.version, manifest
 ) on conflict(listing_id) do update set
  last_decision = excluded.last_decision,
  decision_reason = excluded.decision_reason,
  decided_by = excluded.decided_by,
  decided_at = excluded.decided_at,
  reviewed_listing_version = excluded.reviewed_listing_version,
  reviewed_content_version = excluded.reviewed_content_version,
  reviewed_profile_version = excluded.reviewed_profile_version,
  reviewed_media_manifest = excluded.reviewed_media_manifest;
 select role into actor from private.admin_roles where user_id = caller;
 insert into private.audit_logs(actor_user_id, actor_role, action, target_type, target_id, before_state, after_state, reason)
 values (
  caller, actor, 'listing.' || p_decision, 'listing', l.id::text,
  jsonb_build_object('status', l.status, 'version', l.version, 'content_version', l.content_version, 'profile_version', p.version),
  jsonb_build_object(
   'status', case when p_decision = 'approved' then 'active' else 'rejected' end,
   'version', l.version + 1,
   'reviewed_content_version', l.content_version,
   'reviewed_profile_version', p.version,
   'reviewed_media_manifest', manifest
  ),
  p_reason
 );
 return jsonb_build_object(
  'id', l.id,
  'status', case when p_decision = 'approved' then 'active' else 'rejected' end,
  'version', l.version + 1
 );
end $$;

-- 6. Enrich owner listing dashboard projection (backwards-compatible additive fields;
--    reuses existing padelhub_listing_writer RLS policies without extra table grants).
create or replace function public.get_my_listings() returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid := private.verified_profile_caller();
begin
 return coalesce((
  select jsonb_agg(
   jsonb_build_object(
    'id', l.id,
    'category', l.category,
    'title', l.title,
    'status', l.status,
    'offer_type', l.offer_type,
    'price_egp', l.price_egp,
    'is_negotiable', l.is_negotiable,
    'condition', l.condition,
    'version', l.version,
    'updated_at', l.updated_at,
    'cover_media_id', (
     select m.media_id
     from public.listing_media m
     where m.listing_id = l.id
     order by m.sort_order
     limit 1
    ),
    'photo_count', (
     select count(*)::integer
     from public.listing_media m
     where m.listing_id = l.id
    ),
    'rejection_reason', (
     select r.decision_reason
     from private.listing_moderation_state r
     where r.listing_id = l.id
       and l.status = 'rejected'
       and r.last_decision = 'rejected'
    )
   )
   order by l.updated_at desc, l.id desc
  )
  from public.listings l
  where l.seller_id = caller
 ), '[]'::jsonb);
end $$;

-- 7. Enrich photo draft selector summary with status and photo_count.
create or replace function public.get_my_photo_drafts() returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid := private.verified_profile_caller();
begin
 return coalesce((
  select jsonb_agg(
   jsonb_build_object(
    'id', l.id,
    'category', l.category,
    'title', l.title,
    'version', l.version,
    'status', l.status,
    'photo_count', (
     select count(*)::integer
     from public.listing_media m
     where m.listing_id = l.id
    )
   )
   order by l.updated_at desc, l.id desc
  )
  from public.listings l
  where l.seller_id = caller and l.status in ('draft', 'rejected')
 ), '[]'::jsonb);
end $$;

revoke padelhub_listing_guard, padelhub_listing_writer, padelhub_review_writer, padelhub_photo_writer from postgres;
NOTIFY pgrst, 'reload schema';
commit;
