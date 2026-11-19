begin;
grant padelhub_market_reader,padelhub_review_writer to postgres;
create table private.listing_daily_metrics (
 listing_id uuid not null references public.listings(id) on delete cascade,
 day date not null default (now() at time zone 'UTC')::date,
 views bigint not null default 0 check(views>=0),
 contacts bigint not null default 0 check(contacts>=0),
 primary key(listing_id,day)
);
alter table private.listing_daily_metrics enable row level security;
alter table private.listing_daily_metrics force row level security;
grant select,insert,update on private.listing_daily_metrics to padelhub_market_reader;
grant select on private.listing_daily_metrics to padelhub_review_writer;
create policy metrics_write on private.listing_daily_metrics to padelhub_market_reader using(true) with check(true);
create policy metrics_read on private.listing_daily_metrics for select to padelhub_review_writer using(true);
create function public.record_listing_metric(p_listing uuid,p_kind text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_kind is null or p_kind not in ('view','contact') then raise exception 'Invalid metric' using errcode='22023'; end if;
 if not private.market_visible(p_listing) then return; end if;
 if p_kind='contact' and not exists(select 1 from public.listings where id=p_listing and status='active') then return; end if;
 insert into private.listing_daily_metrics(listing_id,views,contacts)
 values(p_listing,(p_kind='view')::integer,(p_kind='contact')::integer)
 on conflict(listing_id,day) do update set views=private.listing_daily_metrics.views+excluded.views,contacts=private.listing_daily_metrics.contacts+excluded.contacts;
end $$;
create function public.get_listing_metrics(p_admin boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid; result jsonb;
begin
 if p_admin then caller:=private.verified_reviewer(); else caller:=private.verified_profile_caller(); end if;
 select jsonb_build_object('views',coalesce(sum(m.views),0),'contacts',coalesce(sum(m.contacts),0)) into result
 from private.listing_daily_metrics m join public.listings l on l.id=m.listing_id
 where m.day >= (now() at time zone 'UTC')::date-29 and (p_admin or l.seller_id=caller);
 return result;
end $$;
grant create on schema public to padelhub_market_reader,padelhub_review_writer;
alter function public.record_listing_metric(uuid,text) owner to padelhub_market_reader;
alter function public.get_listing_metrics(boolean) owner to padelhub_review_writer;
revoke all on function public.record_listing_metric(uuid,text),public.get_listing_metrics(boolean) from public,anon,authenticated;
grant execute on function public.record_listing_metric(uuid,text) to service_role;
grant execute on function public.get_listing_metrics(boolean) to authenticated;
revoke create on schema public from padelhub_market_reader,padelhub_review_writer;
revoke padelhub_market_reader,padelhub_review_writer from postgres;
commit;

