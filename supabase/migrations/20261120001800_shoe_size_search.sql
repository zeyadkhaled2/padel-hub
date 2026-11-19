begin;
grant padelhub_market_reader to postgres;
drop function public.search_public_listings(text,text,text,text,text,text,integer,integer,text,integer);
create function public.search_public_listings(p_query text default '',p_category text default '',p_governorate text default '',
 p_brand text default '',p_condition text default '',p_offer text default '',p_min integer default null,p_max integer default null,
 p_sort text default '',p_page integer default 1,p_shoe_size numeric default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_shoe_size is not null and (p_shoe_size<20 or p_shoe_size>55 or mod(p_shoe_size,0.5)<>0) then raise exception 'Invalid shoe size' using errcode='22023'; end if;
 if p_page is null or p_page<1 or p_page>10000 or char_length(p_query)>120 or p_min<0 or p_max>500000 or p_max<p_min
 or p_category not in ('','rackets','balls','shoes','bags') or p_condition not in ('','new','used') or p_offer not in ('','sale','swap','both')
 or p_sort not in ('','low','high') then raise exception 'Invalid search' using errcode='22023'; end if;
 with matches as materialized (
 select l.* from public.listings l where l.status='active' and private.market_visible(l.id)
 and (p_shoe_size is null or (l.category='shoes' and l.shoe_size_eu=p_shoe_size))
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
grant create on schema public to padelhub_market_reader;
alter function public.search_public_listings(text,text,text,text,text,text,integer,integer,text,integer,numeric) owner to padelhub_market_reader;
revoke all on function public.search_public_listings(text,text,text,text,text,text,integer,integer,text,integer,numeric) from public;
grant execute on function public.search_public_listings(text,text,text,text,text,text,integer,integer,text,integer,numeric) to anon,authenticated;
revoke create on schema public from padelhub_market_reader;
revoke padelhub_market_reader from postgres;
NOTIFY pgrst, 'reload schema';
commit;
