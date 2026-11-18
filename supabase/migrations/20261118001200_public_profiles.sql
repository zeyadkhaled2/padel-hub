begin;
grant padelhub_profile_writer to postgres;
-- Preserve the implementation/data for a future product decision, but remove
-- every API caller's ability to rename during MVP.
revoke execute on function public.rename_seller_username(integer,text) from public,anon,authenticated,service_role;
revoke padelhub_profile_writer from postgres;
grant padelhub_market_reader to postgres;
create function public.get_public_profile(p_username text,p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.seller_profiles; items jsonb; total integer;
begin
 if p_username is null or p_username !~ '^[A-Za-z0-9_]{3,24}$' or p_page is null or p_page<1 or p_page>10000 then
  raise exception 'Invalid profile request' using errcode='22023'; end if;
 select * into p from public.seller_profiles where lower(username)=lower(p_username) and is_public and account_status='active';
 if not found then return null; end if;
 select count(*) into total from public.listings l where l.seller_id=p.user_id and l.status='active' and private.market_visible(l.id);
 select coalesce(jsonb_agg(private.market_item(x.id) order by x.published_at desc,x.id),'[]'::jsonb) into items
 from (select l.id,l.published_at from public.listings l where l.seller_id=p.user_id and l.status='active' and private.market_visible(l.id)
 order by l.published_at desc,l.id limit 24 offset (p_page-1)*24) x;
 return jsonb_build_object('public_id',p.public_id,'username',p.username,'display_name',p.display_name,
 'account_type',p.account_type,'bio',p.bio,'governorate_slug',p.governorate_slug,'district_text',p.district_text,
 'favorite_racket',p.favorite_racket,'items',items,'total',total);
end $$;
grant create on schema public to padelhub_market_reader;
alter function public.get_public_profile(text,integer) owner to padelhub_market_reader;
revoke all on function public.get_public_profile(text,integer) from public;
grant execute on function public.get_public_profile(text,integer) to anon,authenticated;
revoke create on schema public from padelhub_market_reader;
revoke padelhub_market_reader from postgres;
commit;
