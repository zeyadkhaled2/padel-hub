begin;
grant padelhub_review_writer to postgres;
create or replace function public.get_listing_metrics(p_admin boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid; result jsonb;
begin
 if p_admin then caller:=private.verified_reviewer(); else caller:=private.verified_profile_caller(); end if;
 select jsonb_build_object('views',coalesce(sum(m.views),0),'contacts',coalesce(sum(m.contacts),0)) into result
 from private.listing_daily_metrics m join public.listings l on l.id=m.listing_id
 where m.day >= (now() at time zone 'UTC')::date-29 and (p_admin or l.seller_id=caller);
 if not coalesce(p_admin,false) then result:=result-'contacts'; end if;
 return result;
end $$;
revoke padelhub_review_writer from postgres;
NOTIFY pgrst, 'reload schema';
commit;
