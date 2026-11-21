-- Phase Admin A: Aggregated, MFA-protected overview dashboard RPC and supporting indexes.
-- Read-only capability extension on padelhub_review_writer; no new tables, no direct table grants.
begin;

grant padelhub_review_writer to postgres;

-- Allow padelhub_review_writer to read only non-sensitive audit summary columns
-- (never actor_user_id, before_state, or after_state) for listing/moderation activity.
grant select(id, actor_role, action, target_type, target_id, reason, created_at)
 on private.audit_logs to padelhub_review_writer;

create policy review_audit_read on private.audit_logs
 for select to padelhub_review_writer
 using (target_type = 'listing' or actor_role in ('admin', 'moderator'));

-- Bounded read performance for recent activity and UTC daily engagement aggregations.
create index audit_logs_recent on private.audit_logs(created_at desc, id desc);
create index listing_daily_metrics_day on private.listing_daily_metrics(day);

create function public.admin_dashboard_overview() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 caller uuid := private.verified_reviewer();
 today_utc date := (now() at time zone 'UTC')::date;
 start_7d_date date := today_utc - 6;
 start_30d_date date := today_utc - 29;
 start_7d_ts timestamptz := (start_7d_date::timestamp at time zone 'UTC');
 start_30d_ts timestamptz := (start_30d_date::timestamp at time zone 'UTC');

 sellers_total bigint := 0;
 sellers_active bigint := 0;
 sellers_suspended bigint := 0;
 sellers_hidden bigint := 0;
 sellers_new_7d bigint := 0;
 sellers_new_30d bigint := 0;

 listings_total bigint := 0;
 listings_active bigint := 0;
 listings_pending bigint := 0;
 listings_rejected bigint := 0;
 listings_draft bigint := 0;
 listings_sold bigint := 0;
 listings_traded bigint := 0;
 listings_archived bigint := 0;
 listings_removed bigint := 0;
 listings_new_7d bigint := 0;
 listings_new_30d bigint := 0;
 listings_submitted_7d bigint := 0;
 listings_submitted_30d bigint := 0;
 oldest_pending_at timestamptz;

 open_reports bigint := 0;
 oldest_report_at timestamptz;
 reports_new_7d bigint := 0;
 reports_new_30d bigint := 0;

 views_7d bigint := 0;
 contacts_7d bigint := 0;
 views_30d bigint := 0;
 contacts_30d bigint := 0;

 daily_engagement jsonb;
 recent_activity jsonb;
begin
 select
  count(*),
  count(*) filter (where account_status = 'active'),
  count(*) filter (where account_status = 'suspended'),
  count(*) filter (where account_status = 'hidden'),
  count(*) filter (where created_at >= start_7d_ts),
  count(*) filter (where created_at >= start_30d_ts)
 into
  sellers_total,
  sellers_active,
  sellers_suspended,
  sellers_hidden,
  sellers_new_7d,
  sellers_new_30d
 from public.seller_profiles;

 select
  count(*),
  count(*) filter (where status = 'active'),
  count(*) filter (where status = 'pending'),
  count(*) filter (where status = 'rejected'),
  count(*) filter (where status = 'draft'),
  count(*) filter (where status = 'sold'),
  count(*) filter (where status = 'traded'),
  count(*) filter (where status = 'archived'),
  count(*) filter (where status = 'removed'),
  count(*) filter (where created_at >= start_7d_ts),
  count(*) filter (where created_at >= start_30d_ts),
  count(*) filter (where submitted_at >= start_7d_ts),
  count(*) filter (where submitted_at >= start_30d_ts),
  min(submitted_at) filter (where status = 'pending')
 into
  listings_total,
  listings_active,
  listings_pending,
  listings_rejected,
  listings_draft,
  listings_sold,
  listings_traded,
  listings_archived,
  listings_removed,
  listings_new_7d,
  listings_new_30d,
  listings_submitted_7d,
  listings_submitted_30d,
  oldest_pending_at
 from public.listings;

 select
  count(*) filter (where status = 'open'),
  min(created_at) filter (where status = 'open'),
  count(*) filter (where created_at >= start_7d_ts),
  count(*) filter (where created_at >= start_30d_ts)
 into
  open_reports,
  oldest_report_at,
  reports_new_7d,
  reports_new_30d
 from private.abuse_reports;

 select
  coalesce(sum(m.views) filter (where m.day >= start_7d_date), 0),
  coalesce(sum(m.contacts) filter (where m.day >= start_7d_date), 0),
  coalesce(sum(m.views), 0),
  coalesce(sum(m.contacts), 0)
 into
  views_7d,
  contacts_7d,
  views_30d,
  contacts_30d
 from private.listing_daily_metrics m
 where m.day >= start_30d_date and m.day <= today_utc;

 select coalesce(
  jsonb_agg(
   jsonb_build_object(
    'day', d.day,
    'views', d.views,
    'contacts', d.contacts
   )
   order by d.day asc
  ),
  '[]'::jsonb
 )
 into daily_engagement
 from (
  select
   m.day,
   coalesce(sum(m.views), 0) as views,
   coalesce(sum(m.contacts), 0) as contacts
  from private.listing_daily_metrics m
  where m.day >= start_30d_date and m.day <= today_utc
  group by m.day
  order by m.day asc
 ) d;

 select coalesce(
  jsonb_agg(
   jsonb_build_object(
    'id', a.id,
    'actor_role', a.actor_role,
    'action', a.action,
    'target_type', a.target_type,
    'target_id', a.target_id,
    'target_label',
     case
      when a.target_type = 'listing' then l.title
      when a.target_type = 'profile' and p.username is not null then '@' || p.username
      else null
     end,
    'target_status',
     case
      when a.target_type = 'listing' then l.status
      when a.target_type = 'profile' then p.account_status
      else null
     end,
    'reason', a.reason,
    'created_at', a.created_at
   )
   order by a.created_at desc, a.id desc
  ),
  '[]'::jsonb
 )
 into recent_activity
 from (
  select id, actor_role, action, target_type, target_id, reason, created_at
  from private.audit_logs
  where target_type = 'listing' or actor_role in ('admin', 'moderator')
  order by created_at desc, id desc
  limit 12
 ) a
 left join public.listings l
  on a.target_type = 'listing'
  and a.target_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and l.id = a.target_id::uuid
 left join public.seller_profiles p
  on a.target_type = 'profile'
  and a.actor_role in ('admin', 'moderator')
  and a.target_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and p.public_id = a.target_id::uuid;

 return jsonb_build_object(
  'generated_at', now(),
  'window_end_utc', today_utc,
  'kpis', jsonb_build_object(
   'sellers_total', sellers_total,
   'sellers_active', sellers_active,
   'sellers_suspended', sellers_suspended,
   'sellers_hidden', sellers_hidden,
   'listings_total', listings_total,
   'listings_active', listings_active,
   'listings_pending', listings_pending,
   'listings_rejected', listings_rejected,
   'listings_draft', listings_draft,
   'listings_sold', listings_sold,
   'listings_traded', listings_traded,
   'listings_archived', listings_archived,
   'listings_removed', listings_removed,
   'open_reports', open_reports,
   'views_30d', views_30d,
   'contacts_30d', contacts_30d,
   'views_7d', views_7d,
   'contacts_7d', contacts_7d
  ),
  'needs_attention', jsonb_build_object(
   'pending_listings', listings_pending,
   'oldest_pending_submitted_at', oldest_pending_at,
   'open_reports', open_reports,
   'oldest_open_report_at', oldest_report_at,
   'suspended_sellers', sellers_suspended
  ),
  'trends', jsonb_build_object(
   'period_7d', jsonb_build_object(
    'views', views_7d,
    'contacts', contacts_7d,
    'new_sellers', sellers_new_7d,
    'new_listings', listings_new_7d,
    'submitted_listings', listings_submitted_7d,
    'new_reports', reports_new_7d
   ),
   'period_30d', jsonb_build_object(
    'views', views_30d,
    'contacts', contacts_30d,
    'new_sellers', sellers_new_30d,
    'new_listings', listings_new_30d,
    'submitted_listings', listings_submitted_30d,
    'new_reports', reports_new_30d
   ),
   'daily_engagement', daily_engagement
  ),
  'recent_activity', recent_activity
 );
end $$;

grant create on schema public to padelhub_review_writer;
alter function public.admin_dashboard_overview() owner to padelhub_review_writer;
revoke all on function public.admin_dashboard_overview() from public, anon;
grant execute on function public.admin_dashboard_overview() to authenticated;
revoke create on schema public from padelhub_review_writer;
revoke padelhub_review_writer from postgres;

NOTIFY pgrst, 'reload schema';
commit;
