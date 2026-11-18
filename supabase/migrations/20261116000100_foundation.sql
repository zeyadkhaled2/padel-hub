-- T02-B foundation only: no application RPCs or public-read policies yet.
begin;
create schema if not exists private;
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
revoke all on schema private from public, anon, authenticated;
revoke create on schema public from public, anon, authenticated;
-- Per-schema defaults cannot subtract the global PUBLIC EXECUTE default.
alter default privileges for role postgres revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public, private revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public, private revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public, private revoke execute on functions from public, anon, authenticated;

create table public.platform_settings (
 id boolean primary key default true check (id),
 individual_active_pending_limit integer not null default 5 check (individual_active_pending_limit between 1 and 100),
 business_active_pending_limit integer not null default 20 check (business_active_pending_limit between 1 and 500),
 max_media_bytes integer not null default 8388608 check (max_media_bytes between 1048576 and 20971520),
 quota_warning_threshold_pct smallint not null default 70 check (quota_warning_threshold_pct between 50 and 95),
 updated_at timestamptz not null default now(), updated_by uuid references auth.users on delete set null
);
create table public.egypt_governorates (
 slug text primary key check (slug ~ '^[a-z0-9_]{2,40}$'), name_en text not null, name_ar text not null,
 sort_order smallint not null, is_active boolean not null default true
);
create table public.curated_brands (
 slug text primary key, display_name text not null, supports_rackets boolean not null default true,
 supports_balls boolean not null default false, is_other boolean not null default false,
 sort_order smallint not null, check (is_other = (slug = 'other'))
);
create table public.seller_profiles (
 user_id uuid primary key references auth.users on delete cascade,
 public_id uuid not null unique default gen_random_uuid(),
 username text not null check (username ~ '^[A-Za-z0-9_]{3,24}$'),
 username_lower text generated always as (lower(username)) stored not null unique,
 display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
 account_type text not null default 'individual' check (account_type in ('individual','business')),
 bio text check (char_length(bio)<=500), governorate_slug text not null references public.egypt_governorates,
 district_text text check (char_length(btrim(district_text))<=80),
 favorite_racket text check (char_length(btrim(favorite_racket))<=120), avatar_media_id uuid unique,
 avatar_generation bigint not null default 0 check (avatar_generation>=0),
 avatar_purpose text generated always as ('profile_avatar'::text) stored not null,
 is_public boolean not null default false, public_contact_consent boolean not null default false,
 public_contact_consented_at timestamptz,
 account_status text not null default 'active' check (account_status in ('active','suspended','hidden')),
 listing_limit_override integer check (listing_limit_override between 0 and 500),
 version integer not null default 1 check (version>=1),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.username_registry (
 username_lower text primary key check (username_lower ~ '^[a-z0-9_]{3,24}$'),
 kind text not null check (kind in ('reserved','active_profile','alias')),
 user_id uuid references public.seller_profiles on delete cascade,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check ((kind='reserved' and user_id is null) or (kind in ('active_profile','alias') and user_id is not null)),
 unique (username_lower,user_id)
);
create table public.username_aliases (
 username_lower text primary key, user_id uuid not null references public.seller_profiles on delete cascade,
 is_active boolean not null default true, created_at timestamptz not null default now(), retired_at timestamptz,
 foreign key (username_lower,user_id) references public.username_registry(username_lower,user_id) on delete cascade
);
create table public.listings (
 id uuid primary key default gen_random_uuid(), seller_id uuid not null references public.seller_profiles on delete cascade,
 category text not null check (category in ('rackets','balls')),
 status text not null default 'draft' check (status in ('draft','pending','rejected','active','reserved','sold','traded','archived','removed')),
 title text check (char_length(btrim(title)) between 1 and 120), brand_slug text references public.curated_brands,
 brand_custom text check (char_length(btrim(brand_custom)) between 1 and 60),
 model text check (char_length(btrim(model)) between 1 and 120), description text check (char_length(description)<=3000),
 governorate_slug text references public.egypt_governorates, district_text text check (char_length(btrim(district_text))<=80),
 condition text check (condition in ('new','used')), condition_disclosure text check (char_length(condition_disclosure)<=1000),
 offer_type text check (offer_type in ('sale','swap','both')), price_egp integer check (price_egp between 1 and 500000),
 is_negotiable boolean not null default false, swap_preference text check (char_length(btrim(swap_preference))<=500),
 racket_damage_repair_disclosure text check (char_length(racket_damage_repair_disclosure)<=1000),
 racket_year smallint check (racket_year between 2010 and 2035),
 racket_shape text check (racket_shape in ('round','teardrop','diamond','hybrid')),
 racket_weight_grams smallint check (racket_weight_grams between 300 and 420),
 racket_purchase_date date check (racket_purchase_date>=date '2010-01-01'),
 balls_quantity_packaging text check (char_length(btrim(balls_quantity_packaging))<=120),
 balls_availability_note text check (char_length(btrim(balls_availability_note))<=160),
 version integer not null default 1 check (version>=1), content_version integer not null default 1 check (content_version>=1),
 last_approved_content_version integer check (last_approved_content_version>=1),
 submitted_at timestamptz, approved_at timestamptz, published_at timestamptz, last_confirmed_available_at timestamptz,
 reserved_at timestamptz, terminal_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique (id,seller_id),
 check (status not in ('active','reserved','sold','traded') or (last_approved_content_version is not null and last_approved_content_version=content_version)),
 check (brand_custom is null or (brand_slug is not null and brand_slug='other')),
 check (category<>'balls' or offer_type is null or offer_type='sale'),
 check (category<>'rackets' or (balls_quantity_packaging is null and balls_availability_note is null)),
 check (category<>'balls' or (racket_damage_repair_disclosure is null and racket_year is null and racket_shape is null and racket_weight_grams is null and racket_purchase_date is null)),
 check (offer_type is null or (offer_type='sale' and swap_preference is null) or (offer_type='swap' and price_egp is null and not is_negotiable) or offer_type='both'),
 check (status<>'traded' or (category='rackets' and offer_type in ('swap','both'))),
 constraint listing_complete check (status in ('draft','rejected','archived','removed') or (
  char_length(btrim(coalesce(title,'')))>=3 and char_length(btrim(coalesce(model,'')))>=1
  and char_length(btrim(coalesce(description,'')))>=10 and char_length(btrim(coalesce(condition_disclosure,'')))>=3
  and governorate_slug is not null and brand_slug is not null and condition is not null and offer_type is not null
  and (brand_slug<>'other' or brand_custom is not null)
  and (offer_type not in ('sale','both') or price_egp is not null)
  and (offer_type not in ('swap','both') or char_length(btrim(coalesce(swap_preference,'')))>=3)
  and (category<>'rackets' or char_length(btrim(coalesce(racket_damage_repair_disclosure,'')))>=3)
  and (category<>'balls' or char_length(btrim(coalesce(balls_quantity_packaging,'')))>=2)))
);

-- Private, immutable manifest validator; not a public RPC or authorization helper.
create function private.valid_media_manifest(manifest jsonb, asset_id uuid, attempt uuid) returns boolean
language plpgsql immutable set search_path='' as $$
declare variant text; entry jsonb;
begin
 if manifest is null or jsonb_typeof(manifest)<>'object' then return false; end if;
 if (select count(*) from jsonb_object_keys(manifest))<>3 then return false; end if;
 foreach variant in array array['thumb','card','full'] loop
  entry := manifest->variant;
  if entry is null or jsonb_typeof(entry)<>'object'
    or jsonb_typeof(entry->'key') is distinct from 'string'
    or coalesce(entry->>'key','') !~ '^[A-Za-z0-9/_-]+[.]webp$'
    or (entry->>'key') is distinct from ('processed/'||asset_id::text||'/'||attempt::text||'/'||variant||'.webp')
    or coalesce(entry->>'sha256','') !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(entry->'bytes') is distinct from 'number'
    or (entry->>'bytes') !~ '^[0-9]+$' then return false; end if;
  if (entry->>'bytes')::numeric not between 1 and 8388608 then return false; end if;
 end loop;
 return true;
end $$;
create table public.media_assets (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.seller_profiles on delete cascade,
 purpose text not null check (purpose in ('profile_avatar','listing_photo')),
 status text not null default 'pending_upload' check (status in ('pending_upload','processing','ready','failed','deleted')),
 private_storage_path text not null unique, input_mime_type text not null check (input_mime_type in ('image/jpeg','image/png','image/webp')),
 byte_size integer not null check (byte_size between 1 and 8388608), mime_type text not null default 'image/webp' check (mime_type='image/webp'),
 width_px integer check (width_px between 64 and 8000), height_px integer check (height_px between 64 and 8000),
 exif_stripped boolean not null default false, ready_attempt_id uuid, ready_manifest jsonb, content_sha256 text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (id,owner_id,purpose),
 check (width_px::bigint*height_px<=25000000),
 check ((status='ready' and ready_attempt_id is not null and ready_manifest is not null
    and private.valid_media_manifest(ready_manifest,id,ready_attempt_id) and content_sha256 is not null and content_sha256 ~ '^[a-f0-9]{64}$'
    and exif_stripped and width_px is not null and height_px is not null)
  or (status in ('pending_upload','processing','failed','deleted') and ready_attempt_id is null and ready_manifest is null and content_sha256 is null))
);
alter table public.seller_profiles add foreign key (avatar_media_id,user_id,avatar_purpose)
 references public.media_assets(id,owner_id,purpose) on delete restrict;
create table public.listing_media (
 id uuid primary key default gen_random_uuid(), listing_id uuid not null, owner_id uuid not null,
 media_id uuid not null unique, purpose text generated always as ('listing_photo'::text) stored not null,
 sort_order smallint not null check (sort_order between 0 and 5), created_at timestamptz not null default now(),
 foreign key (listing_id,owner_id) references public.listings(id,seller_id) on delete cascade,
 foreign key (media_id,owner_id,purpose) references public.media_assets(id,owner_id,purpose) on delete restrict,
 unique (listing_id,sort_order) deferrable initially deferred
);
create table public.listing_engagement_counters (
 listing_id uuid primary key, seller_id uuid not null,
 approx_views_count integer not null default 0 check (approx_views_count>=0),
 approx_whatsapp_clicks_count integer not null default 0 check (approx_whatsapp_clicks_count>=0), updated_at timestamptz not null default now(),
 foreign key (listing_id,seller_id) references public.listings(id,seller_id) on delete cascade
);
create table private.admin_roles (
 user_id uuid primary key references auth.users on delete cascade, role text not null check (role in ('admin','moderator')),
 granted_by uuid, granted_at timestamptz not null default now(), revoked_at timestamptz
);
create table private.seller_contacts (
 user_id uuid primary key references public.seller_profiles on delete cascade,
 whatsapp_e164 text check (whatsapp_e164 ~ '^\+[1-9][0-9]{7,14}$'), whatsapp_updated_at timestamptz,
 version integer not null default 1 check (version>=1), updated_at timestamptz not null default now()
);
create table private.profile_moderation_state (
 user_id uuid primary key references public.seller_profiles on delete cascade,
 action_reason text check (char_length(action_reason)<=1000), acted_by uuid, acted_at timestamptz
);
create table private.listing_moderation_state (
 listing_id uuid primary key references public.listings on delete cascade,
 last_decision text check (last_decision in ('approved','rejected','removed')), decision_reason text check (char_length(decision_reason)<=1000),
 decided_by uuid, decided_at timestamptz, last_rereview_trigger text,
 reviewed_content_version integer check (reviewed_content_version>=1), reviewed_media_manifest jsonb,
 check (last_decision not in ('rejected','removed') or char_length(btrim(coalesce(decision_reason,'')))>0)
);
create table private.media_jobs (
 id uuid primary key default gen_random_uuid(), operation text not null check (operation in ('process','stale_attempt_cleanup','explicit_delete')),
 media_id uuid references public.media_assets on delete set null, subject_id uuid not null,
 attempt_id uuid not null unique default gen_random_uuid(), target_processing_attempt_id uuid,
 storage_bucket text not null check (storage_bucket='media-private'), key_manifest jsonb not null check (jsonb_typeof(key_manifest)='array'),
 state text not null default 'queued' check (state in ('queued','processing','succeeded','failed_retryable','cancelled','dead_letter')),
 lease_token uuid, lease_expires_at timestamptz, attempt_count integer not null default 0 check (attempt_count>=0),
 source_hash text check (source_hash ~ '^[a-f0-9]{64}$'), expected_media_state text, target_generation bigint,
 next_attempt_at timestamptz not null default now(), last_error text, created_at timestamptz not null default now(), completed_at timestamptz,
 check (state<>'processing' or (lease_token is not null and lease_expires_at is not null))
);
create table private.abuse_reports (
 id uuid primary key default gen_random_uuid(), reporter_user_id uuid references auth.users on delete set null,
 reporter_fingerprint_hash text, target_type text not null check (target_type in ('listing','profile')),
 target_listing_id uuid references public.listings on delete cascade, target_profile_id uuid references public.seller_profiles on delete cascade,
 reason_code text not null, details text check (char_length(details)<=1000),
 status text not null default 'open' check (status in ('open','reviewing','resolved_action_taken','dismissed')),
 handled_by uuid, resolution_note text check (char_length(resolution_note)<=1000), created_at timestamptz not null default now(), resolved_at timestamptz,
 check ((target_type='listing' and target_listing_id is not null and target_profile_id is null)
 or (target_type='profile' and target_profile_id is not null and target_listing_id is null))
);
create table private.audit_logs (
 id bigint generated always as identity primary key, actor_user_id uuid, actor_role text not null,
 action text not null, target_type text not null, target_id text not null, before_state jsonb, after_state jsonb,
 reason text, created_at timestamptz not null default now()
);
create table private.engagement_events (
 id bigint generated always as identity primary key, listing_id uuid not null, seller_id uuid not null,
 event_type text not null check (event_type in ('listing_view','whatsapp_click')), dedupe_key text not null,
 created_at timestamptz not null default now(), unique (listing_id,event_type,dedupe_key)
);
create table private.rate_limit_windows (
 bucket_key text primary key, window_started_at timestamptz not null default now(), hit_count integer not null default 0 check (hit_count>=0)
);

-- Enforce readiness even for privileged fixture/import paths. Invoker, not definer.
create function private.guard_attachment() returns trigger language plpgsql set search_path='' as $$
declare asset_id uuid; a public.media_assets;
begin
 if tg_table_name='listing_media' and tg_op='UPDATE' then
  if (new.id,new.listing_id,new.owner_id) is distinct from (old.id,old.listing_id,old.owner_id) then
   raise exception 'attachment identity immutable' using errcode='23514'; end if;
 end if;
 if tg_table_name='listing_media' then asset_id:=new.media_id; else asset_id:=new.avatar_media_id; end if;
 if asset_id is null then return new; end if;
 select * into a from public.media_assets where id=asset_id for update;
 if not found or a.status<>'ready' then raise exception 'attachment must be ready' using errcode='23514'; end if;
 return new;
end $$;
create trigger listing_attachment_ready before insert or update on public.listing_media for each row execute function private.guard_attachment();
create trigger avatar_attachment_ready before insert or update of avatar_media_id on public.seller_profiles for each row execute function private.guard_attachment();
create function private.guard_media_identity() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.id,new.owner_id,new.purpose,new.private_storage_path) is distinct from (old.id,old.owner_id,old.purpose,old.private_storage_path) then
  raise exception 'media identity is immutable' using errcode='23514'; end if;
 if old.status='ready' and (new.status<>'ready' or
   (new.ready_attempt_id,new.ready_manifest,new.content_sha256,new.width_px,new.height_px,new.exif_stripped,new.byte_size,new.input_mime_type)
   is distinct from (old.ready_attempt_id,old.ready_manifest,old.content_sha256,old.width_px,old.height_px,old.exif_stripped,old.byte_size,old.input_mime_type)) then
  -- Deletion workflow is not implemented; fail closed even for detached ready assets.
  raise exception 'ready asset immutable; deletion workflow required' using errcode='23514'; end if;
 return new;
end $$;
create trigger media_immutable before update on public.media_assets for each row execute function private.guard_media_identity();
create function private.check_photo_count() returns trigger language plpgsql set search_path='' as $$
declare target uuid; l public.listings; photos integer;
begin
 if tg_table_name='listings' then target:=coalesce(new.id,old.id); else target:=coalesce(new.listing_id,old.listing_id); end if;
 select * into l from public.listings where id=target;
 if found and l.status in ('pending','active','reserved','sold','traded') then
  select count(*) into photos from public.listing_media where listing_id=target;
  if photos<(case when l.category='rackets' then 3 else 1 end) or photos>6 then
   raise exception 'invalid listing photo count' using errcode='23514'; end if;
 end if;
 return null;
end $$;
create constraint trigger listing_photo_count after insert or update on public.listings deferrable initially deferred for each row execute function private.check_photo_count();
create constraint trigger attachment_photo_count after insert or update or delete on public.listing_media deferrable initially deferred for each row execute function private.check_photo_count();
create function private.guard_fixed_identity() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name='seller_profiles' then
  if (new.user_id,new.public_id) is distinct from (old.user_id,old.public_id) then raise exception 'profile identity immutable' using errcode='23514'; end if;
 else
  if (new.id,new.seller_id) is distinct from (old.id,old.seller_id) then raise exception 'listing identity immutable' using errcode='23514'; end if;
 end if;
 return new;
end $$;
create trigger profile_identity before update on public.seller_profiles for each row execute function private.guard_fixed_identity();
create trigger listing_identity before update on public.listings for each row execute function private.guard_fixed_identity();
-- Deferred to permit atomic contact+consent and registry+profile writes in future RPCs.
create function private.check_profile_links() returns trigger language plpgsql set search_path='' as $$
declare p public.seller_profiles; target uuid;
begin
 target:=coalesce(new.user_id,old.user_id);
 select * into p from public.seller_profiles where user_id=target;
 if not found then return null; end if;
 if not exists(select 1 from public.username_registry r where r.username_lower=p.username_lower and r.user_id=p.user_id and r.kind='active_profile') then
  raise exception 'profile needs matching username claim' using errcode='23514'; end if;
 if p.public_contact_consent and (p.public_contact_consented_at is null or not exists(select 1 from private.seller_contacts c where c.user_id=p.user_id and c.whatsapp_e164 is not null)) then
  raise exception 'consent needs contact and timestamp' using errcode='23514'; end if;
 return null;
end $$;
create constraint trigger profile_links after insert or update on public.seller_profiles deferrable initially deferred for each row execute function private.check_profile_links();
create constraint trigger contact_links after insert or update or delete on private.seller_contacts deferrable initially deferred for each row execute function private.check_profile_links();
create constraint trigger registry_links after insert or update or delete on public.username_registry deferrable initially deferred for each row execute function private.check_profile_links();
create function private.check_alias_claim() returns trigger language plpgsql set search_path='' as $$
begin
 if exists(select 1 from public.username_aliases a join public.username_registry r using(username_lower)
           where r.kind<>'alias' or a.user_id is distinct from r.user_id) then
  raise exception 'alias needs matching alias claim' using errcode='23514'; end if;
 return null;
end $$;
create constraint trigger alias_claim after insert or update on public.username_aliases deferrable initially deferred for each row execute function private.check_alias_claim();
create constraint trigger registry_alias_claim after update on public.username_registry deferrable initially deferred for each row execute function private.check_alias_claim();
create function private.deny_audit_change() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'audit is append only' using errcode='23514'; end $$;
create trigger audit_append_only before update or delete on private.audit_logs for each row execute function private.deny_audit_change();

create index profiles_public on public.seller_profiles(governorate_slug,created_at desc) where is_public and account_status='active';
create index registry_owner on public.username_registry(user_id);
create index aliases_owner on public.username_aliases(user_id,is_active);
create index listings_seller_status on public.listings(seller_id,status,updated_at desc);
create index listings_active_newest on public.listings(published_at desc,id desc) where status='active';
create index listings_active_price on public.listings(price_egp,published_at desc,id desc) where status='active' and price_egp is not null;
create index listings_active_filters on public.listings(category,governorate_slug,condition,brand_slug,offer_type,published_at desc) where status='active';
create index listings_pending on public.listings(submitted_at,id) where status='pending';
create index listings_search_trgm on public.listings using gin
 ((coalesce(title,'') || ' ' || coalesce(model,'') || ' ' || coalesce(brand_custom,'') || ' ' || coalesce(description,'')) extensions.gin_trgm_ops);
create index media_owner_status on public.media_assets(owner_id,status,created_at);
create index attachment_owner on public.listing_media(owner_id);
create index counters_seller on public.listing_engagement_counters(seller_id);
create index jobs_due on private.media_jobs(state,next_attempt_at) where state in ('queued','failed_retryable');
create index jobs_leases on private.media_jobs(lease_expires_at) where state='processing';
create index reports_queue on private.abuse_reports(status,created_at);
create index reports_listing on private.abuse_reports(target_listing_id);
create index reports_profile on private.abuse_reports(target_profile_id);
create index audit_target on private.audit_logs(target_type,target_id,created_at desc);
create index audit_actor on private.audit_logs(actor_user_id,created_at desc);

-- All 19 domain tables denied, including reference reads until separately reviewed.
do $$ declare t record; begin
 for t in select schemaname,tablename from pg_tables where schemaname in ('public','private') loop
  execute format('alter table %I.%I enable row level security',t.schemaname,t.tablename);
  execute format('alter table %I.%I force row level security',t.schemaname,t.tablename);
 end loop;
end $$;
revoke all on all tables in schema public,private from public,anon,authenticated;
revoke all on all sequences in schema public,private from public,anon,authenticated;
revoke all on all functions in schema private from public,anon,authenticated;
commit;
