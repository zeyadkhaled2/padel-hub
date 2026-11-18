begin;
grant padelhub_listing_writer,padelhub_review_writer,padelhub_market_reader to postgres;
alter table public.listings drop constraint listings_category_check;
alter table public.listings add constraint listings_category_check check(category in ('rackets','balls','shoes','bags'));
alter table public.listings add column shoe_size_eu numeric;
alter table public.listings add constraint listing_shoe_size check (shoe_size_eu is null or (category='shoes' and shoe_size_eu between 20 and 55 and mod(shoe_size_eu*2,1)=0));
alter table public.listings add constraint listing_shoe_size_required check(category<>'shoes' or status in ('draft','rejected','archived','removed') or shoe_size_eu is not null);
alter table public.listings add constraint listing_accessories_sale check(category not in ('shoes','bags') or offer_type is null or offer_type='sale');
alter table public.listings add constraint listing_accessories_fields check(category not in ('shoes','bags') or (racket_damage_repair_disclosure is null and racket_year is null and racket_shape is null and racket_weight_grams is null and racket_purchase_date is null and balls_quantity_packaging is null and balls_availability_note is null));
grant update(shoe_size_eu) on public.listings to padelhub_listing_writer;
create or replace function public.update_listing_draft(p_listing_id uuid,p_expected_version integer,p_patch jsonb,p_media_ids uuid[] default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.verified_profile_caller(); l public.listings; edited public.listings; k text; v jsonb; media_count integer;
begin
 if p_patch is null or jsonb_typeof(p_patch)<>'object' or (p_patch='{}' and p_media_ids is null) then raise exception 'Draft patch required' using errcode='22023'; end if;
 for k,v in select * from jsonb_each(p_patch) loop
  if k not in ('shoe_size_eu','category','title','brand_slug','brand_custom','model','description','governorate_slug','district_text','condition','condition_disclosure','offer_type','price_egp','is_negotiable','swap_preference','racket_damage_repair_disclosure','racket_year','racket_shape','racket_weight_grams','racket_purchase_date','balls_quantity_packaging','balls_availability_note') then raise exception 'Field not editable' using errcode='22023'; end if;
  if k='shoe_size_eu' then
   if v<>'null'::jsonb and jsonb_typeof(v)<>'number' then raise exception 'Numeric shoe size required' using errcode='22023'; end if;
  elsif k='is_negotiable' then
   if jsonb_typeof(v)<>'boolean' then raise exception 'Boolean required' using errcode='22023'; end if;
  elsif k in ('price_egp','racket_year','racket_weight_grams') then
   if v<>'null'::jsonb and (jsonb_typeof(v)<>'number' or v::text !~ '^[0-9]+$') then raise exception 'Integer required' using errcode='22023'; end if;
  elsif v<>'null'::jsonb and jsonb_typeof(v)<>'string' then raise exception 'Text required' using errcode='22023';
  end if;
 end loop;
 perform 1 from public.seller_profiles where user_id=caller and account_status='active' for update;
 if not found then raise exception 'Profile unavailable' using errcode='42501'; end if;
 select * into l from public.listings where id=p_listing_id and seller_id=caller for update;
 if not found then raise exception 'Listing unavailable' using errcode='42501'; end if;
 if p_expected_version is distinct from l.version then raise exception 'Stale listing version' using errcode='PT409'; end if;
 if l.status not in ('draft','rejected') then raise exception 'Withdraw before editing' using errcode='PT409'; end if;
 if l.status<>'draft' and p_patch?'category' and p_patch->>'category' is distinct from l.category then raise exception 'Category editable only in draft' using errcode='22023'; end if;
 edited:=jsonb_populate_record(l,p_patch);
 if p_media_ids is not null then
  if cardinality(p_media_ids)>6 or array_ndims(p_media_ids)>1 or array_position(p_media_ids,null) is not null or
     (select count(distinct x) from unnest(p_media_ids) x)<>cardinality(p_media_ids) then raise exception 'Invalid media list' using errcode='22023'; end if;
  -- Stable asset lock ordering; readiness is checked before replacing attachments.
  perform id from public.media_assets where id=any(p_media_ids) and owner_id=caller order by id for update;
  select count(*) into media_count from public.media_assets where id=any(p_media_ids) and owner_id=caller and purpose='listing_photo' and status='ready';
  if media_count<>cardinality(p_media_ids) then raise exception 'Media unavailable or not ready' using errcode='23514'; end if;
  delete from public.listing_media where listing_id=l.id;
  insert into public.listing_media(listing_id,owner_id,media_id,sort_order)
  select l.id,caller,x,(ord-1)::smallint from unnest(p_media_ids) with ordinality as a(x,ord);
 end if;
 update public.listings set
 shoe_size_eu=edited.shoe_size_eu,
 category=edited.category,
 title=edited.title,
 brand_slug=edited.brand_slug,
 brand_custom=edited.brand_custom,
 model=edited.model,
 description=edited.description,
 governorate_slug=edited.governorate_slug,
 district_text=edited.district_text,
 condition=edited.condition,
 condition_disclosure=edited.condition_disclosure,
 offer_type=edited.offer_type,
 price_egp=edited.price_egp,
 is_negotiable=edited.is_negotiable,
 swap_preference=edited.swap_preference,
 racket_damage_repair_disclosure=edited.racket_damage_repair_disclosure,
 racket_year=edited.racket_year,
 racket_shape=edited.racket_shape,
 racket_weight_grams=edited.racket_weight_grams,
 racket_purchase_date=edited.racket_purchase_date,
 balls_quantity_packaging=edited.balls_quantity_packaging,
 balls_availability_note=edited.balls_availability_note,version=version+1,content_version=content_version+1,updated_at=now() where id=l.id;
 perform private.record_listing_action(caller,l.id,'listing.edit',l.version+1);
 return public.get_my_listing(l.id);
end $$;
create or replace function public.get_my_listing(p_listing_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.verified_profile_caller(); result jsonb;
begin
 select jsonb_build_object('id',l.id,'seller_id',l.seller_id,'status',l.status,
'category',l.category,
 'title',l.title,
 'brand_slug',l.brand_slug,
 'brand_custom',l.brand_custom,
 'model',l.model,
 'description',l.description,
 'governorate_slug',l.governorate_slug,
 'district_text',l.district_text,
 'condition',l.condition,
 'condition_disclosure',l.condition_disclosure,
 'offer_type',l.offer_type,
 'price_egp',l.price_egp,
 'is_negotiable',l.is_negotiable,
 'swap_preference',l.swap_preference,
 'racket_damage_repair_disclosure',l.racket_damage_repair_disclosure,
 'racket_year',l.racket_year,
 'racket_shape',l.racket_shape,
 'racket_weight_grams',l.racket_weight_grams,
 'racket_purchase_date',l.racket_purchase_date,
 'shoe_size_eu',l.shoe_size_eu,'balls_quantity_packaging',l.balls_quantity_packaging,
 'balls_availability_note',l.balls_availability_note,
 'version',l.version,
 'content_version',l.content_version,
 'last_approved_content_version',l.last_approved_content_version,
 'submitted_at',l.submitted_at,
 'created_at',l.created_at,
 'updated_at',l.updated_at, 'media_ids',coalesce((select jsonb_agg(m.media_id order by m.sort_order) from public.listing_media m where m.listing_id=l.id),
 '[]'::jsonb))
 into result from public.listings l where l.id=p_listing_id and l.seller_id=caller;
 return result;
end $$;
create or replace function public.admin_get_listing_review(p_listing_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.verified_reviewer(); seller uuid; p public.seller_profiles; l public.listings; listing_json jsonb;
begin
 select seller_id into seller from public.listings where id=p_listing_id;
 if not found then raise exception 'Listing unavailable' using errcode='42501'; end if;
 select * into p from public.seller_profiles where user_id=seller for update;
 select * into l from public.listings where id=p_listing_id for update;
 if not found then raise exception 'Listing unavailable' using errcode='42501'; end if;
 perform a.id from public.media_assets a join public.listing_media m on m.media_id=a.id where m.listing_id=l.id order by a.id for update of a;
 listing_json:=jsonb_build_object(
 'id',l.id,
 'seller_id',l.seller_id,
 'category',l.category,
 'status',l.status,
 'title',l.title,
 'brand_slug',l.brand_slug,
 'brand_custom',l.brand_custom,
 'model',l.model,
 'description',l.description,
 'governorate_slug',l.governorate_slug,
 'district_text',l.district_text,
 'condition',l.condition,
 'condition_disclosure',l.condition_disclosure,
 'offer_type',l.offer_type,
 'price_egp',l.price_egp,
 'is_negotiable',l.is_negotiable,
 'swap_preference',l.swap_preference,
 'racket_damage_repair_disclosure',l.racket_damage_repair_disclosure,
 'racket_year',l.racket_year,
 'racket_shape',l.racket_shape,
 'racket_weight_grams',l.racket_weight_grams,
 'racket_purchase_date',l.racket_purchase_date,
 'shoe_size_eu',l.shoe_size_eu,'balls_quantity_packaging',l.balls_quantity_packaging,
 'balls_availability_note',l.balls_availability_note,
 'version',l.version,
 'content_version',l.content_version,
 'last_approved_content_version',l.last_approved_content_version,
 'submitted_at',l.submitted_at);
 return jsonb_build_object('listing',listing_json,'profile',jsonb_build_object('user_id',p.user_id,'version',p.version,
 'username',p.username,'display_name',p.display_name,'account_type',p.account_type,'account_status',p.account_status,
 'is_public',p.is_public,'public_contact_consent',p.public_contact_consent,
 'has_contact',exists(select 1 from private.seller_contacts where user_id=p.user_id and whatsapp_e164 is not null)),
 'media_manifest',private.review_media_manifest(l.id));
end $$;
create or replace function private.market_item(p_listing uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',l.id,'title',l.title,'category',l.category,'status',l.status,
 'brand_slug',l.brand_slug,'brand_custom',l.brand_custom,'model',l.model,'description',l.description,
 'governorate_slug',l.governorate_slug,'district_text',l.district_text,'condition',l.condition,
 'condition_disclosure',l.condition_disclosure,'offer_type',l.offer_type,'price_egp',l.price_egp,
 'is_negotiable',l.is_negotiable,'swap_preference',l.swap_preference,
 'racket_damage_repair_disclosure',l.racket_damage_repair_disclosure,'racket_year',l.racket_year,
 'racket_shape',l.racket_shape,'racket_weight_grams',l.racket_weight_grams,'racket_purchase_date',l.racket_purchase_date,
 'shoe_size_eu',l.shoe_size_eu,'balls_quantity_packaging',l.balls_quantity_packaging,'balls_availability_note',l.balls_availability_note,
 'last_confirmed_available_at',l.last_confirmed_available_at,'published_at',l.published_at,
 'seller',jsonb_build_object('display_name',p.display_name,'username',p.username,'account_type',p.account_type),
 'media_ids',(select jsonb_agg(m.media_id order by m.sort_order) from public.listing_media m where m.listing_id=l.id))
 from public.listings l join public.seller_profiles p on p.user_id=l.seller_id where l.id=p_listing;
$$;
create or replace function public.search_public_listings(p_query text default '',p_category text default '',p_governorate text default '',
 p_brand text default '',p_condition text default '',p_offer text default '',p_min integer default null,p_max integer default null,
 p_sort text default '',p_page integer default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_page is null or p_page<1 or p_page>10000 or char_length(p_query)>120 or p_min<0 or p_max>500000 or p_max<p_min
 or p_category not in ('','rackets','balls','shoes','bags') or p_condition not in ('','new','used') or p_offer not in ('','sale','swap','both')
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
revoke padelhub_listing_writer,padelhub_review_writer,padelhub_market_reader from postgres;
commit;
