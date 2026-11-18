begin;
do $$ begin if not exists(select 1 from pg_roles where rolname='padelhub_market_reader') then
 create role padelhub_market_reader nologin noinherit nobypassrls; end if; end $$;
grant padelhub_market_reader,padelhub_review_writer to postgres;
grant usage on schema public,private to padelhub_market_reader;
grant select on public.listings,public.seller_profiles,public.listing_media,public.media_assets,private.listing_moderation_state,private.seller_contacts to padelhub_market_reader;
create policy market_read on public.listings for select to padelhub_market_reader using(true);
create policy market_read on public.seller_profiles for select to padelhub_market_reader using(true);
create policy market_read on public.listing_media for select to padelhub_market_reader using(true);
create policy market_read on public.media_assets for select to padelhub_market_reader using(true);
create policy market_read on private.listing_moderation_state for select to padelhub_market_reader using(true);
create policy market_read on private.seller_contacts for select to padelhub_market_reader using(true);
grant execute on function private.review_media_manifest(uuid) to padelhub_market_reader;

-- One visibility predicate for browse, detail and fresh contact authorization.
create function private.market_visible(p_listing uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.listings l
 join public.seller_profiles p on p.user_id=l.seller_id
 join private.seller_contacts c on c.user_id=p.user_id
 join private.listing_moderation_state r on r.listing_id=l.id
 where l.id=p_listing and l.status in ('active','reserved','sold','traded')
 and p.is_public and p.account_status='active' and p.public_contact_consent and c.whatsapp_e164 is not null
 and l.last_approved_content_version=l.content_version and r.last_decision='approved'
 and r.reviewed_content_version=l.content_version and r.reviewed_media_manifest=private.review_media_manifest(l.id)
 and not exists(select 1 from public.listing_media m join public.media_assets a on a.id=m.media_id where m.listing_id=l.id and a.status<>'ready'));
$$;
create function private.market_item(p_listing uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',l.id,'title',l.title,'category',l.category,'status',l.status,
 'brand_slug',l.brand_slug,'brand_custom',l.brand_custom,'model',l.model,'description',l.description,
 'governorate_slug',l.governorate_slug,'district_text',l.district_text,'condition',l.condition,
 'condition_disclosure',l.condition_disclosure,'offer_type',l.offer_type,'price_egp',l.price_egp,
 'is_negotiable',l.is_negotiable,'swap_preference',l.swap_preference,
 'racket_damage_repair_disclosure',l.racket_damage_repair_disclosure,'racket_year',l.racket_year,
 'racket_shape',l.racket_shape,'racket_weight_grams',l.racket_weight_grams,'racket_purchase_date',l.racket_purchase_date,
 'balls_quantity_packaging',l.balls_quantity_packaging,'balls_availability_note',l.balls_availability_note,
 'last_confirmed_available_at',l.last_confirmed_available_at,'published_at',l.published_at,
 'seller',jsonb_build_object('display_name',p.display_name,'username',p.username,'account_type',p.account_type),
 'media_ids',(select jsonb_agg(m.media_id order by m.sort_order) from public.listing_media m where m.listing_id=l.id))
 from public.listings l join public.seller_profiles p on p.user_id=l.seller_id where l.id=p_listing;
$$;
create function public.get_public_listing(p_listing uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select private.market_item(p_listing) where private.market_visible(p_listing);
$$;
create function public.search_public_listings(p_query text default '',p_category text default '',p_governorate text default '',
 p_brand text default '',p_condition text default '',p_offer text default '',p_min integer default null,p_max integer default null,
 p_sort text default '',p_page integer default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_page is null or p_page<1 or p_page>10000 or char_length(p_query)>120 or p_min<0 or p_max>500000 or p_max<p_min
 or p_category not in ('','rackets','balls') or p_condition not in ('','new','used') or p_offer not in ('','sale','swap','both')
 or p_sort not in ('','low','high') then raise exception 'Invalid search' using errcode='22023'; end if;
 with matches as materialized (
 select l.* from public.listings l where l.status='active' and private.market_visible(l.id)
 and (p_category='' or l.category=p_category) and (p_governorate='' or l.governorate_slug=p_governorate)
 and (p_brand='' or l.brand_slug=p_brand) and (p_condition='' or l.condition=p_condition) and (p_offer='' or l.offer_type=p_offer)
 and (p_min is null or l.price_egp>=p_min) and (p_max is null or l.price_egp<=p_max)
 and (p_query='' or strpos(lower(concat_ws(' ',l.title,l.model,l.brand_slug,l.brand_custom,l.description)),lower(btrim(p_query)))>0)
 ), ordered as (
 select id,row_number() over(order by case when p_sort='low' then price_egp end asc nulls last,
 case when p_sort='high' then price_egp end desc nulls last,published_at desc nulls last,id) pos from matches
 ), paged as (select * from ordered order by pos limit 24 offset ((p_page-1)*24))
 select jsonb_build_object('total',(select count(*) from matches),'items',coalesce((select jsonb_agg(private.market_item(id) order by pos) from paged),'[]'::jsonb)) into result;
 return result;
end $$;
-- Only the server redirect reads a consented number; it is never in browse/detail responses.
create function public.get_listing_contact(p_listing uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('title',l.title,'phone',c.whatsapp_e164) from public.listings l
 join private.seller_contacts c on c.user_id=l.seller_id
 where l.id=p_listing and l.status='active' and private.market_visible(l.id);
$$;
grant create on schema public,private to padelhub_market_reader;
alter function private.market_visible(uuid) owner to padelhub_market_reader;
alter function private.market_item(uuid) owner to padelhub_market_reader;
alter function public.get_public_listing(uuid) owner to padelhub_market_reader;
alter function public.search_public_listings(text,text,text,text,text,text,integer,integer,text,integer) owner to padelhub_market_reader;
alter function public.get_listing_contact(uuid) owner to padelhub_market_reader;
revoke all on function private.market_visible(uuid),private.market_item(uuid) from public,anon,authenticated;
revoke all on function public.get_public_listing(uuid),public.search_public_listings(text,text,text,text,text,text,integer,integer,text,integer) from public;
grant execute on function public.get_public_listing(uuid),public.search_public_listings(text,text,text,text,text,text,integer,integer,text,integer) to anon,authenticated;
revoke all on function public.get_listing_contact(uuid) from public,anon,authenticated;
grant execute on function public.get_listing_contact(uuid) to service_role;
revoke create on schema public,private from padelhub_market_reader;
revoke padelhub_market_reader,padelhub_review_writer from postgres;
commit;
