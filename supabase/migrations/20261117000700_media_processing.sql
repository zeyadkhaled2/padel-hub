-- Direct, synchronous equipment-photo saves. No processing queue or workers.
begin;
do $$ begin
 if not exists(select 1 from pg_roles where rolname='padelhub_photo_writer') then
  create role padelhub_photo_writer nologin noinherit nobypassrls;
 end if;
end $$;
grant padelhub_photo_writer,padelhub_listing_writer,padelhub_review_writer to postgres;
grant usage on schema public,private to padelhub_photo_writer;
grant select on public.seller_profiles,public.listings,public.listing_media,public.media_assets,private.listing_moderation_state to padelhub_photo_writer;
grant update(user_id) on public.seller_profiles to padelhub_photo_writer;
grant update(version,content_version,updated_at) on public.listings to padelhub_photo_writer;
grant insert on public.media_assets,public.listing_media to padelhub_photo_writer;
grant delete on public.listing_media to padelhub_photo_writer;
grant execute on function private.valid_media_manifest(jsonb,uuid,uuid) to padelhub_photo_writer;
grant execute on function private.review_media_manifest(uuid) to padelhub_photo_writer;
create policy photo_read on public.seller_profiles for select to padelhub_photo_writer using(true);
create policy photo_lock on public.seller_profiles for update to padelhub_photo_writer using(true) with check(false);
create policy photo_read on public.listings for select to padelhub_photo_writer using(true);
create policy photo_update on public.listings for update to padelhub_photo_writer using(true) with check(status in ('draft','rejected'));
create policy photo_read on public.listing_media for select to padelhub_photo_writer using(true);
create policy photo_insert on public.listing_media for insert to padelhub_photo_writer with check(true);
create policy photo_detach on public.listing_media for delete to padelhub_photo_writer using(true);
create policy photo_read on public.media_assets for select to padelhub_photo_writer using(true);
create policy photo_insert on public.media_assets for insert to padelhub_photo_writer with check(purpose='listing_photo' and status='ready');
-- guard_attachment locks the ready asset during insertion.
grant update(id) on public.media_assets to padelhub_photo_writer;
create policy photo_lock on public.media_assets for update to padelhub_photo_writer using(true) with check(false);
create policy photo_review_read on private.listing_moderation_state for select to padelhub_photo_writer using(true);
grant select,insert,update on private.rate_limit_windows to padelhub_photo_writer;
create policy photo_rate on private.rate_limit_windows for all to padelhub_photo_writer using(bucket_key like 'photo:%') with check(bucket_key like 'photo:%');
create function public.consume_photo_upload(p_owner uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare hits integer;
begin
 insert into private.rate_limit_windows(bucket_key,hit_count) values('photo:'||p_owner::text,1)
 on conflict(bucket_key) do update set
  hit_count=case when private.rate_limit_windows.window_started_at<now()-interval '10 minutes' then 1 else private.rate_limit_windows.hit_count+1 end,
  window_started_at=case when private.rate_limit_windows.window_started_at<now()-interval '10 minutes' then now() else private.rate_limit_windows.window_started_at end
 returning hit_count into hits;
 return hits<=20;
end $$;

-- Server-only boundary: caller identity is obtained by getUser(), never form data.
create function public.save_listing_photo(p_owner uuid,p_listing uuid,p_version integer,p_asset uuid,p_attempt uuid,p_mime text,p_bytes integer,p_width integer,p_height integer,p_hash text,p_manifest jsonb,p_replace uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.listings; slot integer; retained bigint;
begin
 perform 1 from public.seller_profiles where user_id=p_owner and account_status='active' for update;
 if not found then raise exception 'Profile unavailable' using errcode='42501'; end if;
 select * into l from public.listings where id=p_listing and seller_id=p_owner for update;
 if not found then raise exception 'Listing unavailable' using errcode='42501'; end if;
 if l.version is distinct from p_version or l.status not in ('draft','rejected') then raise exception 'Reload draft before uploading' using errcode='PT409'; end if;
 -- Simple safety allowance, including replaced files; never automatically erase them.
 select coalesce(sum(byte_size),0) into retained from public.media_assets where owner_id=p_owner;
 if retained+p_bytes>268435456 then raise exception 'Account photo storage allowance reached' using errcode='PT409'; end if;
 if p_replace is not null then
  select sort_order into slot from public.listing_media where listing_id=l.id and media_id=p_replace;
  if not found then raise exception 'Replacement unavailable' using errcode='PT409'; end if;
 else
  select s into slot from generate_series(0,5) s where not exists(select 1 from public.listing_media where listing_id=l.id and sort_order=s) order by s limit 1;
  if slot is null then raise exception 'Six photos maximum' using errcode='PT409'; end if;
 end if;
 insert into public.media_assets(id,owner_id,purpose,status,private_storage_path,input_mime_type,byte_size,width_px,height_px,exif_stripped,ready_attempt_id,ready_manifest,content_sha256)
 values(p_asset,p_owner,'listing_photo','ready',p_manifest->'full'->>'key',p_mime,p_bytes,p_width,p_height,true,p_attempt,p_manifest,p_hash);
 if p_replace is not null then delete from public.listing_media where listing_id=l.id and media_id=p_replace; end if;
 insert into public.listing_media(listing_id,owner_id,media_id,sort_order) values(l.id,p_owner,p_asset,slot);
 update public.listings set version=version+1,content_version=content_version+1,updated_at=now() where id=l.id;
 return jsonb_build_object('id',p_asset,'version',l.version+1);
end $$;

-- Fresh lookup before and after object retrieval; never return original files.
create function public.get_photo_delivery(p_asset uuid,p_viewer uuid,p_listing uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.media_assets;
begin
 select * into a from public.media_assets where id=p_asset and status='ready' and purpose='listing_photo';
 if not found then return null; end if;
 if a.owner_id is distinct from p_viewer then
  if p_listing is null or not exists(
   select 1 from public.listings l join public.seller_profiles p on p.user_id=l.seller_id
   join public.listing_media m on m.listing_id=l.id and m.media_id=a.id
   join private.listing_moderation_state r on r.listing_id=l.id
   where l.id=p_listing and p.is_public and p.account_status='active'
    and l.status in ('active','reserved','sold','traded')
    and l.last_approved_content_version=l.content_version and r.last_decision='approved'
    and r.reviewed_content_version=l.content_version and r.reviewed_media_manifest=private.review_media_manifest(l.id)
  ) then return null; end if;
 end if;
 return a.ready_manifest;
end $$;

create function public.get_my_photo_drafts() returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.verified_profile_caller();
begin
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'category',category,'title',title,'version',version) order by updated_at desc)
 from public.listings where seller_id=caller and status in ('draft','rejected')),'[]'::jsonb);
end $$;
grant create on schema public to padelhub_photo_writer,padelhub_listing_writer;
alter function public.save_listing_photo(uuid,uuid,integer,uuid,uuid,text,integer,integer,integer,text,jsonb,uuid) owner to padelhub_photo_writer;
alter function public.get_photo_delivery(uuid,uuid,uuid) owner to padelhub_photo_writer;
alter function public.consume_photo_upload(uuid) owner to padelhub_photo_writer;
revoke all on function public.consume_photo_upload(uuid) from public,anon,authenticated;
grant execute on function public.consume_photo_upload(uuid) to service_role;
alter function public.get_my_photo_drafts() owner to padelhub_listing_writer;
revoke all on function public.save_listing_photo(uuid,uuid,integer,uuid,uuid,text,integer,integer,integer,text,jsonb,uuid),public.get_photo_delivery(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.save_listing_photo(uuid,uuid,integer,uuid,uuid,text,integer,integer,integer,text,jsonb,uuid),public.get_photo_delivery(uuid,uuid,uuid) to service_role;
revoke all on function public.get_my_photo_drafts() from public,anon;
grant execute on function public.get_my_photo_drafts() to authenticated;
revoke create on schema public from padelhub_photo_writer,padelhub_listing_writer;
revoke padelhub_photo_writer,padelhub_listing_writer,padelhub_review_writer from postgres;
commit;
