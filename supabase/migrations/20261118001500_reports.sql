begin;
grant padelhub_review_writer,padelhub_market_reader to postgres;
grant execute on function private.market_visible(uuid) to padelhub_review_writer;
revoke padelhub_market_reader from postgres;
alter table private.abuse_reports add column version integer not null default 1;
create index abuse_reports_reporter_time on private.abuse_reports(reporter_user_id,created_at);
grant select,insert,update on private.abuse_reports to padelhub_review_writer;
create policy report_capability on private.abuse_reports to padelhub_review_writer using(true) with check(true);
grant update(account_status,version,updated_at) on public.seller_profiles to padelhub_review_writer;
create policy moderation_profile_update on public.seller_profiles for update to padelhub_review_writer using(true) with check(account_status='suspended');
alter policy review_update on public.listings with check(status in ('active','rejected','removed'));
create policy moderation_profile_audit on private.audit_logs for insert to padelhub_review_writer
 with check(actor_user_id=(select auth.uid()) and actor_role in ('admin','moderator') and target_type='profile');

create function public.report_content(p_type text,p_target uuid,p_reason text,p_details text default '') returns void
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.verified_profile_caller(); target_owner uuid;
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'Reporting requires READ COMMITTED' using errcode='25001'; end if;
 if p_type is null or p_type not in ('listing','profile') or p_reason is null or p_reason not in ('misleading','prohibited','spam','abuse','other')
 or char_length(coalesce(p_details,''))>1000 then raise exception 'Invalid report' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('report:'||caller::text,0));
 if p_type='listing' then
  select seller_id into target_owner from public.listings where id=p_target and private.market_visible(id);
 else
  select user_id into target_owner from public.seller_profiles where public_id=p_target and is_public and account_status='active';
 end if;
 if target_owner is null or target_owner=caller then raise exception 'Target unavailable' using errcode='42501'; end if;
 if exists(select 1 from private.abuse_reports where reporter_user_id=caller and status in ('open','reviewing') and
 ((p_type='listing' and target_listing_id=p_target) or (p_type='profile' and target_profile_id=target_owner))) then
  raise exception 'Already reported' using errcode='PT409'; end if;
 if (select count(*) from private.abuse_reports where reporter_user_id=caller and created_at>now()-interval '1 day')>=5 then
  raise exception 'Report limit reached' using errcode='PT429'; end if;
 insert into private.abuse_reports(reporter_user_id,target_type,target_listing_id,target_profile_id,reason_code,details)
 values(caller,p_type,case when p_type='listing' then p_target end,case when p_type='profile' then target_owner end,p_reason,p_details);
end $$;

create function public.admin_reports(p_page integer default 1) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.verified_reviewer(); result jsonb;
begin
 if p_page is null or p_page<1 or p_page>10000 then raise exception 'Invalid page' using errcode='22023'; end if;
 select jsonb_build_object('total',(select count(*) from private.abuse_reports where status='open'),
 'items',coalesce((select jsonb_agg(row_to_json(q) order by q.created_at,q.id) from (
 select r.id,r.version,r.target_type,r.reason_code,r.details,r.created_at,l.title,
 coalesce(l.version,p.version) target_version,p.username,p.public_id,
 l.id listing_id from private.abuse_reports r left join public.listings l on l.id=r.target_listing_id
 join public.seller_profiles p on p.user_id=coalesce(l.seller_id,r.target_profile_id)
 where r.status='open' order by r.created_at,r.id limit 24 offset (p_page-1)*24) q),'[]'::jsonb)) into result;
 return result;
end $$;

create function public.resolve_report(p_report uuid,p_expected_version integer,p_expected_target_version integer,p_action text,p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.verified_reviewer(); r private.abuse_reports; l public.listings; p public.seller_profiles; owner_id uuid; actor text;
begin
 if p_action is null or p_action not in ('dismiss','remove','suspend') or char_length(btrim(coalesce(p_note,''))) not between 1 and 1000 then
  raise exception 'Decision and note required' using errcode='22023'; end if;
 -- Serialize target mutations in the same profile-then-listing order as review.
 select * into r from private.abuse_reports where id=p_report;
 if not found then raise exception 'Report unavailable' using errcode='42501'; end if;
 if r.target_type='listing' then select seller_id into owner_id from public.listings where id=r.target_listing_id;
 else owner_id:=r.target_profile_id; end if;
 select * into p from public.seller_profiles where user_id=owner_id for update;
 if not found then raise exception 'Target unavailable' using errcode='42501'; end if;
 if r.target_type='listing' then select * into l from public.listings where id=r.target_listing_id for update; end if;
 select * into r from private.abuse_reports where id=p_report for update;
 if r.status<>'open' or r.version is distinct from p_expected_version or
 (case when r.target_type='listing' then l.version else p.version end) is distinct from p_expected_target_version then
 raise exception 'Stale report or target' using errcode='PT409'; end if;
 if p_action='remove' then
  if r.target_type<>'listing' then raise exception 'Invalid target action' using errcode='22023'; end if;
  update public.listings set status='removed',version=version+1,updated_at=now() where id=l.id;
 elsif p_action='suspend' then
  if r.target_type<>'profile' then raise exception 'Invalid target action' using errcode='22023'; end if;
  update public.seller_profiles set account_status='suspended',version=version+1,updated_at=now() where user_id=p.user_id;
 end if;
 update private.abuse_reports set status=case when p_action='dismiss' then 'dismissed' else 'resolved_action_taken' end,
 resolution_note=p_note,handled_by=caller,resolved_at=now(),version=version+1 where id=r.id;
 select role into actor from private.admin_roles where user_id=caller;
 insert into private.audit_logs(actor_user_id,actor_role,action,target_type,target_id,reason)
 values(caller,actor,'report.'||p_action,r.target_type,coalesce(l.id::text,p.public_id::text),p_note);
end $$;
grant create on schema public to padelhub_review_writer;
alter function public.report_content(text,uuid,text,text) owner to padelhub_review_writer;
alter function public.admin_reports(integer) owner to padelhub_review_writer;
alter function public.resolve_report(uuid,integer,integer,text,text) owner to padelhub_review_writer;
revoke all on function public.report_content(text,uuid,text,text),public.admin_reports(integer),public.resolve_report(uuid,integer,integer,text,text) from public,anon;
grant execute on function public.report_content(text,uuid,text,text),public.admin_reports(integer),public.resolve_report(uuid,integer,integer,text,text) to authenticated;
revoke create on schema public from padelhub_review_writer;
revoke padelhub_review_writer from postgres;
commit;
