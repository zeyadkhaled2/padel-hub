begin;
grant padelhub_listing_writer to postgres;
create function public.get_my_listings() returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.verified_profile_caller();
begin
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'category',category,'title',title,'status',status) order by updated_at desc)
 from public.listings where seller_id=caller),'[]'::jsonb);
end $$;
grant create on schema public to padelhub_listing_writer;
alter function public.get_my_listings() owner to padelhub_listing_writer;
revoke all on function public.get_my_listings() from public,anon;
grant execute on function public.get_my_listings() to authenticated;
revoke create on schema public from padelhub_listing_writer;
revoke padelhub_listing_writer from postgres;
commit;
