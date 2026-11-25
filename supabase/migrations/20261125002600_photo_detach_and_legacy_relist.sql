-- Phase UI-C follow-up:
-- 1. Allow owners to safely detach a photo from editable drafts/rejected listings
--    without deleting the underlying media_assets record or Storage objects.
--    Compacts remaining sort_order cleanly (0..N-1) so legacy 5–6 photo drafts
--    can trim down to 3–4 photos without hitting a dead end.
-- 2. Allow owners to reopen sold, traded, or archived listings back to private
--    draft status ('reopen' action in change_listing_status) so older listings
--    with <3 or >4 photos can update photos/details before submitting for fresh
--    manual admin approval.
-- Forward-only migration: never deletes Storage objects or media_assets rows.
begin;

grant padelhub_listing_writer to postgres;

-- 1. Safe single-photo detachment from editable drafts/rejected listings.
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

grant create on schema public to padelhub_listing_writer;
alter function public.detach_listing_photo(uuid, integer, uuid) owner to padelhub_listing_writer;
revoke all on function public.detach_listing_photo(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.detach_listing_photo(uuid, integer, uuid) to authenticated;
revoke create on schema public from padelhub_listing_writer;

-- 2. Extend change_listing_status with 'reopen' (sold/traded/archived -> draft)
--    while preserving exact atomic 'relist' behavior and rollback semantics.
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

revoke padelhub_listing_writer from postgres;

notify pgrst, 'reload schema';
commit;
