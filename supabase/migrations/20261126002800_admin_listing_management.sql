-- Admin B: bounded inventory, inspection metadata, and direct removal.
-- Reuses the NOLOGIN/NOBYPASSRLS review capability. No new table grants or indexes.
begin;
grant padelhub_review_writer to postgres;

create function public.admin_listing_inventory(
 p_query text default '', p_status text default '', p_category text default '',
 p_account_type text default '', p_governorate text default '',
 p_sort text default 'created', p_page integer default 1
) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.verified_reviewer(); result jsonb;
begin
 if p_query is null or char_length(p_query)>120 or p_status is null or
 p_status not in ('','draft','pending','rejected','active','reserved','sold','traded','archived','removed') or
 p_category is null or p_category not in ('','rackets','balls','shoes','bags') or
 p_account_type is null or p_account_type not in ('','individual','business') or
 p_governorate is null or (p_governorate<>'' and p_governorate not in ('cairo','giza','alexandria','dakahlia','red_sea','beheira','fayoum','gharbia','ismailia','menoufia','minya','qalyubia','new_valley','suez','aswan','assiut','beni_suef','port_said','damietta','sharqia','south_sinai','kafr_el_sheikh','matrouh','luxor','qena','north_sinai','sohag')) or
 p_sort is null or p_sort not in ('created','updated','pending') or p_page is null or p_page not between 1 and 10000 then
  raise exception 'Invalid inventory query' using errcode='22023';
 end if;
 with matches as materialized (
  select l.id,l.title,l.category,l.status,l.offer_type,l.price_egp,l.swap_preference,
   l.created_at,l.updated_at,l.submitted_at,p.display_name,p.username
  from public.listings l left join public.seller_profiles p on p.user_id=l.seller_id
  where (p_status='' or l.status=p_status) and (p_category='' or l.category=p_category)
   and (p_account_type='' or p.account_type=p_account_type)
   and (p_governorate='' or l.governorate_slug=p_governorate)
   and (btrim(p_query)='' or lower(l.id::text)=lower(btrim(p_query)) or
    strpos(lower(concat_ws(' ',l.title,l.brand_slug,l.brand_custom,l.model,p.display_name,p.username)),lower(btrim(p_query)))>0)
 ), ordered as (
  select *,row_number() over(order by
   case when p_sort='pending' then case when status='pending' then 0 else 1 end end,
   case when p_sort='pending' and status='pending' then submitted_at end asc nulls last,
   case when p_sort='updated' then updated_at end desc,
   case when p_sort in ('created','pending') then created_at end desc,id) pos from matches
 ), paged as (select * from ordered order by pos limit 24 offset (p_page-1)*24)
 select jsonb_build_object('total',(select count(*) from matches),
  'counts',(select jsonb_object_agg(status,n) from (select status,count(*) n from public.listings group by status) c),
  'items',coalesce((select jsonb_agg((to_jsonb(q)-'pos') || jsonb_build_object(
   'public_visible',private.market_visible(q.id),
   'cover_media_id',(select m.media_id from public.listing_media m join public.media_assets a on a.id=m.media_id
    join public.listings l on l.id=m.listing_id where m.listing_id=q.id and a.status='ready'
    and a.purpose='listing_photo' and a.owner_id=l.seller_id and m.owner_id=l.seller_id
    order by m.sort_order,m.media_id limit 1)) order by q.pos) from paged q),'[]'::jsonb)) into result;
 return result;
end $$;

-- Existing exact review snapshot remains the source of truth for all decisions.
create function public.admin_listing_inspection(p_listing_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.verified_reviewer(); snapshot jsonb; details jsonb;
begin
 snapshot:=public.admin_get_listing_review(p_listing_id);
 select jsonb_build_object('created_at',l.created_at,'updated_at',l.updated_at,
  'approved_at',l.approved_at,'published_at',l.published_at,
  'public_visible',private.market_visible(l.id),
  'decision',(select jsonb_build_object('action',a.action,'reason',a.reason,'created_at',a.created_at)
    from private.audit_logs a where a.target_type='listing' and a.target_id=l.id::text
     and a.action in ('listing.approved','listing.rejected','listing.removed','report.remove')
    order by a.created_at desc,a.id desc limit 1)) into details from public.listings l where l.id=p_listing_id;
 return snapshot || jsonb_build_object('inspection',details);
end $$;

-- All attached ready photos may be inspected, including removed/rejected listings.
-- Active role + MFA are checked on every proxy read, before AND after retrieval.
create or replace function public.admin_photo_delivery(p_listing uuid,p_asset uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.verified_reviewer(); manifest jsonb;
begin
 select a.ready_manifest into manifest from public.listing_media m join public.media_assets a on a.id=m.media_id
 join public.listings l on l.id=m.listing_id where l.id=p_listing and a.id=p_asset
 and a.status='ready' and a.purpose='listing_photo' and a.owner_id=l.seller_id and m.owner_id=l.seller_id;
 return manifest;
end $$;

create function public.admin_remove_listing(p_listing_id uuid,p_expected_listing_version integer,
 p_expected_content_version integer,p_expected_profile_version integer,p_reviewed_manifest jsonb,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.verified_reviewer(); seller uuid; p public.seller_profiles; l public.listings; actor text;
begin
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'Removal requires READ COMMITTED' using errcode='25001'; end if;
 if char_length(btrim(coalesce(p_reason,''))) not between 1 and 1000 then
  raise exception 'Removal reason required' using errcode='22023'; end if;
 select seller_id into seller from public.listings where id=p_listing_id;
 if not found then raise exception 'Listing unavailable' using errcode='42501'; end if;
 select * into p from public.seller_profiles where user_id=seller for update;
 if not found then raise exception 'Profile unavailable' using errcode='42501'; end if;
 select * into l from public.listings where id=p_listing_id for update;
 if not found then raise exception 'Listing unavailable' using errcode='42501'; end if;
 if l.version is distinct from p_expected_listing_version or l.content_version is distinct from p_expected_content_version
 or p.version is distinct from p_expected_profile_version then raise exception 'Stale inspection' using errcode='PT409'; end if;
 perform a.id from public.media_assets a join public.listing_media m on m.media_id=a.id
  where m.listing_id=l.id order by a.id for update of a;
 if p_reviewed_manifest is distinct from private.review_media_manifest(l.id) then
  raise exception 'Stale inspected photos' using errcode='PT409'; end if;
 if not private.market_visible(l.id) then raise exception 'Listing is not public' using errcode='PT409'; end if;
 update public.listings set status='removed',version=version+1,updated_at=now() where id=l.id;
 select role into actor from private.admin_roles where user_id=caller;
 insert into private.audit_logs(actor_user_id,actor_role,action,target_type,target_id,before_state,after_state,reason)
 values(caller,actor,'listing.removed','listing',l.id::text,
  jsonb_build_object('status',l.status,'version',l.version,'content_version',l.content_version,'profile_version',p.version),
  jsonb_build_object('status','removed','version',l.version+1),btrim(p_reason));
end $$;

grant create on schema public to padelhub_review_writer;
alter function public.admin_listing_inventory(text,text,text,text,text,text,integer) owner to padelhub_review_writer;
alter function public.admin_listing_inspection(uuid) owner to padelhub_review_writer;
alter function public.admin_remove_listing(uuid,integer,integer,integer,jsonb,text) owner to padelhub_review_writer;
revoke all on function public.admin_listing_inventory(text,text,text,text,text,text,integer),
 public.admin_listing_inspection(uuid),public.admin_remove_listing(uuid,integer,integer,integer,jsonb,text) from public,anon;
grant execute on function public.admin_listing_inventory(text,text,text,text,text,text,integer),
 public.admin_listing_inspection(uuid),public.admin_remove_listing(uuid,integer,integer,integer,jsonb,text) to authenticated;
revoke create on schema public from padelhub_review_writer;
revoke padelhub_review_writer from postgres;
commit;
