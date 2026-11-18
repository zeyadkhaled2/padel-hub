begin;
grant padelhub_market_reader to postgres;
create function public.resolve_public_profile(p_public_id uuid) returns text
language sql stable security definer set search_path='' as $$
 select username from public.seller_profiles
 where public_id=p_public_id and is_public and account_status='active';
$$;
grant create on schema public to padelhub_market_reader;
alter function public.resolve_public_profile(uuid) owner to padelhub_market_reader;
revoke all on function public.resolve_public_profile(uuid) from public;
grant execute on function public.resolve_public_profile(uuid) to anon,authenticated;
revoke create on schema public from padelhub_market_reader;
revoke padelhub_market_reader from postgres;
commit;
