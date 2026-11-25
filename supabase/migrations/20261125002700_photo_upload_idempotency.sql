-- Media Optimization V1: Bounded upload idempotency for resilient mobile retries.
-- Prevents duplicate attachments or unintended repeated replacements when a mobile
-- network drops after PostgreSQL commits save_listing_photo but before the browser
-- receives the HTTP 201 response.
-- Forward-only migration: never deletes media_assets or Storage objects.
begin;

grant padelhub_photo_writer to postgres;

-- 1. Bounded per-owner/listing upload idempotency receipts (private, FORCE RLS, zero client grants).
create table private.photo_upload_idempotency (
 owner_id uuid not null references public.seller_profiles(user_id) on delete cascade,
 listing_id uuid not null references public.listings(id) on delete cascade,
 upload_key uuid not null,
 expected_version integer not null check (expected_version >= 1),
 replace_photo_id uuid,
 asset_id uuid not null references public.media_assets(id) on delete restrict,
 resulting_version integer not null check (resulting_version >= 2),
 created_at timestamptz not null default now(),
 primary key (owner_id, listing_id, upload_key)
);

create index photo_upload_idempotency_owner_created
 on private.photo_upload_idempotency (owner_id, created_at);

alter table private.photo_upload_idempotency enable row level security;
alter table private.photo_upload_idempotency force row level security;

revoke all on table private.photo_upload_idempotency from public, anon, authenticated;
grant select, insert, delete on table private.photo_upload_idempotency to padelhub_photo_writer;

create policy photo_idempotency_writer on private.photo_upload_idempotency
 for all to padelhub_photo_writer
 using (true)
 with check (true);

-- 2. Service-only lookup RPC so Next.js can reconcile ambiguous uploads and avoid
--    redundant Sharp/Storage work on idempotent retries.
create function public.get_photo_upload_receipt(
 p_owner uuid,
 p_listing uuid,
 p_upload_key uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 rec private.photo_upload_idempotency;
begin
 if p_owner is null or p_listing is null or p_upload_key is null then
  return null;
 end if;

 select * into rec
 from private.photo_upload_idempotency
 where owner_id = p_owner
   and listing_id = p_listing
   and upload_key = p_upload_key
   and created_at >= now() - interval '24 hours';

 if not found then
  return null;
 end if;

 return jsonb_build_object(
  'id', rec.asset_id,
  'version', rec.resulting_version,
  'expected_version', rec.expected_version,
  'replace_photo_id', rec.replace_photo_id
 );
end $$;

-- 3. Extend public.save_listing_photo with an optional trailing p_upload_key uuid default null
--    (backwards-compatible with all existing 12-argument callers).
drop function public.save_listing_photo(
 uuid, uuid, integer, uuid, uuid, text, integer, integer, integer, text, jsonb, uuid
);

create function public.save_listing_photo(
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

grant create on schema public to padelhub_photo_writer;
alter function public.get_photo_upload_receipt(uuid, uuid, uuid) owner to padelhub_photo_writer;
alter function public.save_listing_photo(
 uuid, uuid, integer, uuid, uuid, text, integer, integer, integer, text, jsonb, uuid, uuid
) owner to padelhub_photo_writer;

revoke all on function public.get_photo_upload_receipt(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_photo_upload_receipt(uuid, uuid, uuid) to service_role;

revoke all on function public.save_listing_photo(
 uuid, uuid, integer, uuid, uuid, text, integer, integer, integer, text, jsonb, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.save_listing_photo(
 uuid, uuid, integer, uuid, uuid, text, integer, integer, integer, text, jsonb, uuid, uuid
) to service_role;

revoke create on schema public from padelhub_photo_writer;
revoke padelhub_photo_writer from postgres;

notify pgrst, 'reload schema';
commit;
