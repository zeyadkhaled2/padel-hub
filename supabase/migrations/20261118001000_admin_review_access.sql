begin;
grant padelhub_review_writer,padelhub_listing_writer to postgres;
create function public.get_my_admin_access() returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.verified_profile_caller(); allowed boolean;
begin
 select exists(select 1 from private.admin_roles where user_id=caller and revoked_at is null and role in ('admin','moderator')) into allowed;
 return jsonb_build_object('is_admin',allowed,'mfa_verified',allowed and auth.jwt()->>'aal'='aal2');
end $$;
create function public.admin_pending_listings(p_page integer default 1) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.verified_reviewer(); result jsonb;
begin
 if p_page is null or p_page<1 or p_page>10000 then raise exception 'Invalid page' using errcode='22023'; end if;
 select jsonb_build_object('total',(select count(*) from public.listings where status='pending'),
 'items',coalesce((select jsonb_agg(row_to_json(q) order by q.submitted_at,q.id) from
 (select l.id,l.title,l.category,l.submitted_at,p.display_name from public.listings l join public.seller_profiles p on p.user_id=l.seller_id
 where l.status='pending' order by l.submitted_at nulls last,l.id limit 24 offset ((p_page-1)*24)) q),'[]'::jsonb)) into result;
 return result;
end $$;
create function public.admin_photo_delivery(p_listing uuid,p_asset uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.verified_reviewer(); manifest jsonb;
begin
 select a.ready_manifest into manifest from public.listing_media m join public.media_assets a on a.id=m.media_id
 join public.listings l on l.id=m.listing_id
 where l.id=p_listing and a.id=p_asset and l.status='pending' and a.status='ready' and a.purpose='listing_photo' and a.owner_id=l.seller_id;
 return manifest;
end $$;
grant select on private.listing_moderation_state to padelhub_listing_writer;
create policy owner_decision_read on private.listing_moderation_state for select to padelhub_listing_writer
 using(exists(select 1 from public.listings l where l.id=listing_id and l.seller_id=(select auth.uid())));
create function public.get_my_listing_decision(p_listing uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.verified_profile_caller(); result jsonb;
begin
 select jsonb_build_object('decision',r.last_decision,'reason',r.decision_reason,'decided_at',r.decided_at) into result
 from private.listing_moderation_state r join public.listings l on l.id=r.listing_id
 where l.id=p_listing and l.seller_id=caller and l.status='rejected' and r.last_decision='rejected';
 return result;
end $$;
grant create on schema public to padelhub_review_writer,padelhub_listing_writer;
alter function public.get_my_admin_access() owner to padelhub_review_writer;
alter function public.admin_pending_listings(integer) owner to padelhub_review_writer;
alter function public.admin_photo_delivery(uuid,uuid) owner to padelhub_review_writer;
alter function public.get_my_listing_decision(uuid) owner to padelhub_listing_writer;
revoke all on function public.get_my_admin_access(),public.admin_pending_listings(integer),public.admin_photo_delivery(uuid,uuid),public.get_my_listing_decision(uuid) from public,anon;
grant execute on function public.get_my_admin_access(),public.admin_pending_listings(integer),public.admin_photo_delivery(uuid,uuid),public.get_my_listing_decision(uuid) to authenticated;
revoke create on schema public from padelhub_review_writer,padelhub_listing_writer;
revoke padelhub_review_writer,padelhub_listing_writer from postgres;
commit;
