-- Admin C: Seller management workspace, account-type management, listing allowances,
-- seller moderation (suspend/hide), and exact seller filtering for Admin B.
-- Preserves least-privilege capability separation:
--   * padelhub_review_writer retains moderation_profile_update strictly limited to
--     account_status in ('suspended', 'hidden') and CANNOT restore sellers to 'active'.
--   * padelhub_seller_admin (NOLOGIN/NOINHERIT/NOBYPASSRLS, zero auth-schema USAGE)
--     updates ONLY (account_type, listing_limit_override, version, updated_at) and
--     has ZERO UPDATE privilege on account_status, so neither capability can ever
--     reactivate a suspended or hidden seller.
-- No new tables, no direct anon/authenticated table grants, no automatic restoration.
begin;

do $$ begin
 if not exists(select 1 from pg_roles where rolname = 'padelhub_seller_admin') then
  create role padelhub_seller_admin nologin noinherit nobypassrls;
 end if;
end $$;

grant padelhub_profile_writer, padelhub_review_writer, padelhub_seller_admin to postgres;

-- Allow padelhub_review_writer to moderate sellers to either 'suspended' or 'hidden'.
-- Explicitly excludes 'active' so review_writer can never restore a seller.
alter policy moderation_profile_update on public.seller_profiles
 using(true)
 with check(account_status in ('suspended', 'hidden'));

-- Least-privilege capability grants for padelhub_seller_admin (hosted-safe: zero auth USAGE).
grant usage on schema public, private to padelhub_seller_admin;
grant execute on function
 private.auth_uid(),
 private.auth_jwt(),
 private.verified_auth_caller(),
 private.verified_profile_caller(),
 private.verified_reviewer()
 to padelhub_seller_admin;

grant select, update(user_id) on private.admin_roles to padelhub_seller_admin;
create policy seller_admin_role_read on private.admin_roles
 for select to padelhub_seller_admin
 using(user_id = (select private.auth_uid()));
create policy seller_admin_role_lock on private.admin_roles
 for update to padelhub_seller_admin
 using(user_id = (select private.auth_uid()))
 with check(false);

grant select, update(id) on public.platform_settings to padelhub_seller_admin;
create policy seller_admin_settings_read on public.platform_settings
 for select to padelhub_seller_admin
 using(true);
create policy seller_admin_settings_lock on public.platform_settings
 for update to padelhub_seller_admin
 using(true)
 with check(false);

grant select on public.seller_profiles to padelhub_seller_admin;
grant update(account_type, listing_limit_override, version, updated_at)
 on public.seller_profiles to padelhub_seller_admin;
create policy seller_admin_profile_read on public.seller_profiles
 for select to padelhub_seller_admin
 using(true);
create policy seller_admin_profile_update on public.seller_profiles
 for update to padelhub_seller_admin
 using(true)
 with check(true);

grant select(seller_id, status) on public.listings to padelhub_seller_admin;
create policy seller_admin_listings_count on public.listings
 for select to padelhub_seller_admin
 using(true);

grant insert(actor_user_id, actor_role, action, target_type, target_id, before_state, after_state, reason)
 on private.audit_logs to padelhub_seller_admin;
grant usage on sequence private.audit_logs_id_seq to padelhub_seller_admin;
create policy seller_admin_profile_audit on private.audit_logs
 for insert to padelhub_seller_admin
 with check(
  actor_user_id = (select private.auth_uid())
  and actor_role in ('admin', 'moderator')
  and target_type = 'profile'
 );

-- 1. Extend Admin B's admin_listing_inventory with an optional exact seller public_id filter
--    and additive seller_public_id / filtered_seller fields (backwards-compatible with 0..7 args).
drop function public.admin_listing_inventory(text, text, text, text, text, text, integer);

create function public.admin_listing_inventory(
 p_query text default '',
 p_status text default '',
 p_category text default '',
 p_account_type text default '',
 p_governorate text default '',
 p_sort text default 'created',
 p_page integer default 1,
 p_seller_public_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 caller uuid := private.verified_reviewer();
 result jsonb;
begin
 if p_query is null or char_length(p_query) > 120 or p_status is null or
  p_status not in ('', 'draft', 'pending', 'rejected', 'active', 'reserved', 'sold', 'traded', 'archived', 'removed') or
  p_category is null or p_category not in ('', 'rackets', 'balls', 'shoes', 'bags') or
  p_account_type is null or p_account_type not in ('', 'individual', 'business') or
  p_governorate is null or (p_governorate <> '' and p_governorate not in (
   'cairo', 'giza', 'alexandria', 'dakahlia', 'red_sea', 'beheira', 'fayoum', 'gharbia',
   'ismailia', 'menoufia', 'minya', 'qalyubia', 'new_valley', 'suez', 'aswan', 'assiut',
   'beni_suef', 'port_said', 'damietta', 'sharqia', 'south_sinai', 'kafr_el_sheikh',
   'matrouh', 'luxor', 'qena', 'north_sinai', 'sohag'
  )) or
  p_sort is null or p_sort not in ('created', 'updated', 'pending') or
  p_page is null or p_page not between 1 and 10000 then
  raise exception 'Invalid inventory query' using errcode = '22023';
 end if;

 with matches as materialized (
  select
   l.id, l.title, l.category, l.status, l.offer_type, l.price_egp, l.swap_preference,
   l.created_at, l.updated_at, l.submitted_at,
   p.display_name, p.username, p.public_id as seller_public_id
  from public.listings l
  left join public.seller_profiles p on p.user_id = l.seller_id
  where (p_status = '' or l.status = p_status)
   and (p_category = '' or l.category = p_category)
   and (p_account_type = '' or p.account_type = p_account_type)
   and (p_governorate = '' or l.governorate_slug = p_governorate)
   and (p_seller_public_id is null or p.public_id = p_seller_public_id)
   and (
    btrim(p_query) = ''
    or lower(l.id::text) = lower(btrim(p_query))
    or strpos(
     lower(concat_ws(' ', l.title, l.brand_slug, l.brand_custom, l.model, p.display_name, p.username)),
     lower(btrim(p_query))
    ) > 0
   )
 ), ordered as (
  select *, row_number() over (
   order by
    case when p_sort = 'pending' then case when status = 'pending' then 0 else 1 end end,
    case when p_sort = 'pending' and status = 'pending' then submitted_at end asc nulls last,
    case when p_sort = 'updated' then updated_at end desc,
    case when p_sort in ('created', 'pending') then created_at end desc,
    id
  ) pos
  from matches
 ), paged as (
  select * from ordered order by pos limit 24 offset (p_page - 1) * 24
 )
 select jsonb_build_object(
  'total', (select count(*) from matches),
  'counts', (select jsonb_object_agg(status, n) from (select status, count(*) n from public.listings group by status) c),
  'filtered_seller', case
   when p_seller_public_id is not null then (
    select jsonb_build_object('public_id', sp.public_id, 'display_name', sp.display_name, 'username', sp.username)
    from public.seller_profiles sp
    where sp.public_id = p_seller_public_id
   )
   else null
  end,
  'items', coalesce((
   select jsonb_agg(
    (to_jsonb(q) - 'pos') || jsonb_build_object(
     'public_visible', private.market_visible(q.id),
     'cover_media_id', (
      select m.media_id
      from public.listing_media m
      join public.media_assets a on a.id = m.media_id
      join public.listings l on l.id = m.listing_id
      where m.listing_id = q.id
       and a.status = 'ready'
       and a.purpose = 'listing_photo'
       and a.owner_id = l.seller_id
       and m.owner_id = l.seller_id
      order by m.sort_order, m.media_id
      limit 1
     )
    )
    order by q.pos
   )
   from paged q
  ), '[]'::jsonb)
 ) into result;

 return result;
end $$;

-- Include seller_public_id in inspection metadata for direct navigation to Admin C.
create or replace function public.admin_listing_inspection(p_listing_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 caller uuid := private.verified_reviewer();
 snapshot jsonb;
 details jsonb;
begin
 snapshot := public.admin_get_listing_review(p_listing_id);
 select jsonb_build_object(
  'created_at', l.created_at,
  'updated_at', l.updated_at,
  'approved_at', l.approved_at,
  'published_at', l.published_at,
  'public_visible', private.market_visible(l.id),
  'seller_public_id', p.public_id,
  'decision', (
   select jsonb_build_object('action', a.action, 'reason', a.reason, 'created_at', a.created_at)
   from private.audit_logs a
   where a.target_type = 'listing'
    and a.target_id = l.id::text
    and a.action in ('listing.approved', 'listing.rejected', 'listing.removed', 'report.remove')
   order by a.created_at desc, a.id desc
   limit 1
  )
 ) into details
 from public.listings l
 join public.seller_profiles p on p.user_id = l.seller_id
 where l.id = p_listing_id;

 return snapshot || jsonb_build_object('inspection', details);
end $$;

-- 2. Admin C: Bounded, server-paginated seller inventory.
--    Exposes privacy-safe profile & capacity summaries keyed by immutable public_id.
--    Never exposes auth user_id, credentials, or private WhatsApp numbers.
create function public.admin_seller_inventory(
 p_query text default '',
 p_account_type text default '',
 p_account_status text default '',
 p_governorate text default '',
 p_visibility text default '',
 p_sort text default 'newest',
 p_page integer default 1
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 caller uuid := private.verified_reviewer();
 settings public.platform_settings;
 normalized_query text;
 result jsonb;
begin
 if p_query is null or char_length(p_query) > 120 or
  p_account_type is null or p_account_type not in ('', 'individual', 'business') or
  p_account_status is null or p_account_status not in ('', 'active', 'suspended', 'hidden') or
  p_governorate is null or (p_governorate <> '' and p_governorate not in (
   'cairo', 'giza', 'alexandria', 'dakahlia', 'red_sea', 'beheira', 'fayoum', 'gharbia',
   'ismailia', 'menoufia', 'minya', 'qalyubia', 'new_valley', 'suez', 'aswan', 'assiut',
   'beni_suef', 'port_said', 'damietta', 'sharqia', 'south_sinai', 'kafr_el_sheikh',
   'matrouh', 'luxor', 'qena', 'north_sinai', 'sohag'
  )) or
  p_visibility is null or p_visibility not in ('', 'public', 'private') or
  p_sort is null or p_sort not in ('newest', 'updated', 'activity') or
  p_page is null or p_page not between 1 and 10000 then
  raise exception 'Invalid seller inventory query' using errcode = '22023';
 end if;

 select * into settings from public.platform_settings where id;
 if not found then
  raise exception 'Settings unavailable' using errcode = '55000';
 end if;

 normalized_query := lower(btrim(p_query));

 with listing_stats as (
  select
   l.seller_id,
   count(*) filter (where l.status = 'active')::integer as active_listings,
   count(*) filter (where l.status = 'pending')::integer as pending_listings,
   count(*)::integer as total_listings
  from public.listings l
  group by l.seller_id
 ), matches as materialized (
  select
   p.public_id,
   p.display_name,
   p.username,
   p.account_type,
   p.governorate_slug,
   p.account_status,
   p.is_public,
   (p.is_public and p.account_status = 'active') as public_profile_visible,
   coalesce(ls.active_listings, 0) as active_listings,
   coalesce(ls.pending_listings, 0) as pending_listings,
   coalesce(ls.total_listings, 0) as total_listings,
   case
    when p.account_type = 'business' then settings.business_active_pending_limit
    else settings.individual_active_pending_limit
   end as default_listing_limit,
   p.listing_limit_override,
   coalesce(
    p.listing_limit_override,
    case
     when p.account_type = 'business' then settings.business_active_pending_limit
     else settings.individual_active_pending_limit
    end
   ) as effective_listing_limit,
   p.created_at,
   p.updated_at
  from public.seller_profiles p
  left join listing_stats ls on ls.seller_id = p.user_id
  where (p_account_type = '' or p.account_type = p_account_type)
   and (p_account_status = '' or p.account_status = p_account_status)
   and (p_governorate = '' or p.governorate_slug = p_governorate)
   and (
    p_visibility = ''
    or (p_visibility = 'public' and p.is_public)
    or (p_visibility = 'private' and not p.is_public)
   )
   and (
    normalized_query = ''
    or lower(p.public_id::text) = normalized_query
    or strpos(
     lower(concat_ws(' ', p.display_name, p.username, '@' || p.username)),
     normalized_query
    ) > 0
   )
 ), ordered as (
  select *, row_number() over (
   order by
    case when p_sort = 'activity' then (active_listings + pending_listings) end desc,
    case when p_sort = 'activity' then total_listings end desc,
    case when p_sort in ('updated', 'activity') then updated_at end desc,
    case when p_sort = 'newest' then created_at end desc,
    public_id asc
  ) pos
  from matches
 ), paged as (
  select * from ordered order by pos limit 24 offset (p_page - 1) * 24
 )
 select jsonb_build_object(
  'total', (select count(*) from matches),
  'defaults', jsonb_build_object(
   'individual', settings.individual_active_pending_limit,
   'business', settings.business_active_pending_limit
  ),
  'counts', (
   select jsonb_build_object(
    'total', count(*),
    'individual', count(*) filter (where account_type = 'individual'),
    'business', count(*) filter (where account_type = 'business'),
    'active', count(*) filter (where account_status = 'active'),
    'suspended', count(*) filter (where account_status = 'suspended'),
    'hidden', count(*) filter (where account_status = 'hidden')
   )
   from public.seller_profiles
  ),
  'items', coalesce((
   select jsonb_agg(to_jsonb(q) - 'pos' order by q.pos)
   from paged q
  ), '[]'::jsonb)
 ) into result;

 return result;
end $$;

-- 3. Admin C: Seller details inspection RPC.
create function public.admin_seller_detail(p_seller_public_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 caller uuid := private.verified_reviewer();
 settings public.platform_settings;
 p public.seller_profiles;
 today_utc date := (now() at time zone 'UTC')::date;
 start_30d_date date := today_utc - 29;
 default_cap integer;
 effective_cap integer;
 has_contact boolean := false;
 c_draft integer := 0;
 c_pending integer := 0;
 c_rejected integer := 0;
 c_active integer := 0;
 c_reserved integer := 0;
 c_sold integer := 0;
 c_traded integer := 0;
 c_archived integer := 0;
 c_removed integer := 0;
 c_total integer := 0;
 c_public_visible integer := 0;
 open_reports integer := 0;
 views_30d bigint := 0;
 contacts_30d bigint := 0;
 recent_activity jsonb;
begin
 if p_seller_public_id is null then
  raise exception 'Invalid seller identifier' using errcode = '22023';
 end if;

 select * into settings from public.platform_settings where id;
 if not found then
  raise exception 'Settings unavailable' using errcode = '55000';
 end if;

 select * into p from public.seller_profiles where public_id = p_seller_public_id;
 if not found then
  return null;
 end if;

 select exists(
  select 1 from private.seller_contacts c
  where c.user_id = p.user_id and c.whatsapp_e164 is not null
 ) into has_contact;

 default_cap := case
  when p.account_type = 'business' then settings.business_active_pending_limit
  else settings.individual_active_pending_limit
 end;
 effective_cap := coalesce(p.listing_limit_override, default_cap);

 select
  count(*)::integer,
  count(*) filter (where l.status = 'draft')::integer,
  count(*) filter (where l.status = 'pending')::integer,
  count(*) filter (where l.status = 'rejected')::integer,
  count(*) filter (where l.status = 'active')::integer,
  count(*) filter (where l.status = 'reserved')::integer,
  count(*) filter (where l.status = 'sold')::integer,
  count(*) filter (where l.status = 'traded')::integer,
  count(*) filter (where l.status = 'archived')::integer,
  count(*) filter (where l.status = 'removed')::integer,
  count(*) filter (where private.market_visible(l.id))::integer
 into
  c_total, c_draft, c_pending, c_rejected, c_active, c_reserved,
  c_sold, c_traded, c_archived, c_removed, c_public_visible
 from public.listings l
 where l.seller_id = p.user_id;

 select count(*)::integer into open_reports
 from private.abuse_reports r
 where r.status = 'open'
  and (
   r.target_profile_id = p.user_id
   or exists (
    select 1 from public.listings l
    where l.id = r.target_listing_id and l.seller_id = p.user_id
   )
  );

 select
  coalesce(sum(m.views), 0),
  coalesce(sum(m.contacts), 0)
 into views_30d, contacts_30d
 from private.listing_daily_metrics m
 join public.listings l on l.id = m.listing_id
 where l.seller_id = p.user_id
  and m.day >= start_30d_date
  and m.day <= today_utc;

 with seller_activity as (
  (
   select
    a.id,
    a.actor_role,
    a.action,
    a.target_type,
    a.target_id,
    '@' || p.username as target_label,
    p.account_status as target_status,
    a.reason,
    a.created_at
   from private.audit_logs a
   where a.target_type = 'profile'
    and a.target_id = p.public_id::text
    and a.actor_role in ('admin', 'moderator')
   order by a.created_at desc, a.id desc
   limit 12
  )
  union all
  (
   select
    a.id,
    a.actor_role,
    a.action,
    a.target_type,
    a.target_id,
    l.title as target_label,
    l.status as target_status,
    a.reason,
    a.created_at
   from public.listings l
   join private.audit_logs a
    on a.target_type = 'listing'
    and a.target_id = l.id::text
   where l.seller_id = p.user_id
    and a.actor_role in ('admin', 'moderator')
   order by a.created_at desc, a.id desc
   limit 12
  )
 ), bounded_activity as (
  select * from seller_activity
  order by created_at desc, id desc
  limit 12
 )
 select coalesce(
  jsonb_agg(
   jsonb_build_object(
    'id', b.id,
    'actor_role', b.actor_role,
    'action', b.action,
    'target_type', b.target_type,
    'target_id', b.target_id,
    'target_label', b.target_label,
    'target_status', b.target_status,
    'reason', b.reason,
    'created_at', b.created_at
   )
   order by b.created_at desc, b.id desc
  ),
  '[]'::jsonb
 ) into recent_activity
 from bounded_activity b;

 return jsonb_build_object(
  'profile', jsonb_build_object(
   'public_id', p.public_id,
   'username', p.username,
   'display_name', p.display_name,
   'account_type', p.account_type,
   'account_status', p.account_status,
   'governorate_slug', p.governorate_slug,
   'district_text', p.district_text,
   'bio', p.bio,
   'favorite_racket', p.favorite_racket,
   'is_public', p.is_public,
   'public_profile_visible', (p.is_public and p.account_status = 'active'),
   'public_contact_consent', p.public_contact_consent,
   'public_contact_consented_at', p.public_contact_consented_at,
   'has_contact', has_contact,
   'version', p.version,
   'created_at', p.created_at,
   'updated_at', p.updated_at
  ),
  'allowance', jsonb_build_object(
   'individual_default', settings.individual_active_pending_limit,
   'business_default', settings.business_active_pending_limit,
   'default_limit', default_cap,
   'override_limit', p.listing_limit_override,
   'effective_limit', effective_cap,
   'active_count', c_active,
   'pending_count', c_pending,
   'used_count', (c_active + c_pending),
   'remaining_count', greatest(effective_cap - (c_active + c_pending), 0),
   'over_limit', ((c_active + c_pending) > effective_cap),
   'override_min', 0,
   'override_max', 500
  ),
  'listing_counts', jsonb_build_object(
   'total', c_total,
   'public_visible', c_public_visible,
   'draft', c_draft,
   'pending', c_pending,
   'rejected', c_rejected,
   'active', c_active,
   'reserved', c_reserved,
   'sold', c_sold,
   'traded', c_traded,
   'archived', c_archived,
   'removed', c_removed
  ),
  'open_reports_count', open_reports,
  'engagement_30d', jsonb_build_object(
   'views', views_30d,
   'contacts', contacts_30d,
   'window_end_utc', today_utc
  ),
  'recent_activity', recent_activity
 );
end $$;

-- 4. Admin C: Account-type management RPC (owned by padelhub_seller_admin).
--    Lock order: platform_settings FOR SHARE -> seller_profiles FOR UPDATE.
--    Validates resulting effective allowance transactionally against active + pending usage.
create function public.admin_update_seller_account_type(
 p_seller_public_id uuid,
 p_expected_version integer,
 p_account_type text,
 p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 caller uuid := private.verified_reviewer();
 settings public.platform_settings;
 p public.seller_profiles;
 trimmed_reason text;
 current_cap integer;
 resulting_cap integer;
 counted integer;
 actor text;
begin
 if current_setting('transaction_isolation') <> 'read committed' then
  raise exception 'Account-type update requires READ COMMITTED isolation' using errcode = '25001';
 end if;

 trimmed_reason := btrim(coalesce(p_reason, ''));
 if p_seller_public_id is null
  or p_expected_version is null or p_expected_version < 1
  or p_account_type is null or p_account_type not in ('individual', 'business')
  or char_length(trimmed_reason) not between 1 and 1000 then
  raise exception 'Invalid account-type update request' using errcode = '22023';
 end if;

 select * into settings from public.platform_settings where id for share;
 if not found then
  raise exception 'Settings unavailable' using errcode = '55000';
 end if;

 select * into p from public.seller_profiles where public_id = p_seller_public_id for update;
 if not found then
  raise exception 'Profile unavailable' using errcode = '42501';
 end if;

 if p.version is distinct from p_expected_version then
  raise exception 'Stale profile version' using errcode = 'PT409';
 end if;

 if p.account_type = p_account_type then
  raise exception 'Account type is already set to this value' using errcode = '22023';
 end if;

 current_cap := coalesce(
  p.listing_limit_override,
  case when p.account_type = 'business' then settings.business_active_pending_limit else settings.individual_active_pending_limit end
 );
 resulting_cap := coalesce(
  p.listing_limit_override,
  case when p_account_type = 'business' then settings.business_active_pending_limit else settings.individual_active_pending_limit end
 );

 select count(*)::integer into counted
 from public.listings
 where seller_id = p.user_id and status in ('active', 'pending');

 if counted > resulting_cap then
  raise exception 'Account type change exceeds current listing allowance' using errcode = 'PT409';
 end if;

 update public.seller_profiles
 set account_type = p_account_type,
     version = version + 1,
     updated_at = now()
 where user_id = p.user_id;

 select role into actor from private.admin_roles where user_id = caller;
 insert into private.audit_logs(
  actor_user_id, actor_role, action, target_type, target_id, before_state, after_state, reason
 ) values (
  caller,
  actor,
  'profile.account_type_updated',
  'profile',
  p.public_id::text,
  jsonb_build_object('account_type', p.account_type, 'effective_limit', current_cap, 'version', p.version),
  jsonb_build_object('account_type', p_account_type, 'effective_limit', resulting_cap, 'version', p.version + 1),
  trimmed_reason
 );

 return jsonb_build_object(
  'public_id', p.public_id,
  'account_type', p_account_type,
  'effective_limit', resulting_cap,
  'version', p.version + 1
 );
end $$;

-- 5. Admin C: Per-seller listing allowance override management RPC (owned by padelhub_seller_admin).
--    p_limit_override between 0 and 500 sets a custom override; NULL resets to account-type default.
--    Lock order: platform_settings FOR SHARE -> seller_profiles FOR UPDATE.
--    Rejects reductions below current active + pending usage rather than auto-unpublishing listings.
create function public.admin_update_seller_listing_limit(
 p_seller_public_id uuid,
 p_expected_version integer,
 p_limit_override integer,
 p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 caller uuid := private.verified_reviewer();
 settings public.platform_settings;
 p public.seller_profiles;
 trimmed_reason text;
 default_cap integer;
 current_cap integer;
 resulting_cap integer;
 counted integer;
 actor text;
 audit_action text;
begin
 if current_setting('transaction_isolation') <> 'read committed' then
  raise exception 'Listing allowance update requires READ COMMITTED isolation' using errcode = '25001';
 end if;

 trimmed_reason := btrim(coalesce(p_reason, ''));
 if p_seller_public_id is null
  or p_expected_version is null or p_expected_version < 1
  or (p_limit_override is not null and (p_limit_override < 0 or p_limit_override > 500))
  or char_length(trimmed_reason) not between 1 and 1000 then
  raise exception 'Invalid listing allowance update request' using errcode = '22023';
 end if;

 select * into settings from public.platform_settings where id for share;
 if not found then
  raise exception 'Settings unavailable' using errcode = '55000';
 end if;

 select * into p from public.seller_profiles where public_id = p_seller_public_id for update;
 if not found then
  raise exception 'Profile unavailable' using errcode = '42501';
 end if;

 if p.version is distinct from p_expected_version then
  raise exception 'Stale profile version' using errcode = 'PT409';
 end if;

 if p.listing_limit_override is not distinct from p_limit_override then
  raise exception 'Listing allowance is already set to this value' using errcode = '22023';
 end if;

 default_cap := case
  when p.account_type = 'business' then settings.business_active_pending_limit
  else settings.individual_active_pending_limit
 end;
 current_cap := coalesce(p.listing_limit_override, default_cap);
 resulting_cap := coalesce(p_limit_override, default_cap);

 select count(*)::integer into counted
 from public.listings
 where seller_id = p.user_id and status in ('active', 'pending');

 if counted > resulting_cap then
  raise exception 'Listing allowance cannot be below current active and pending usage' using errcode = 'PT409';
 end if;

 update public.seller_profiles
 set listing_limit_override = p_limit_override,
     version = version + 1,
     updated_at = now()
 where user_id = p.user_id;

 audit_action := case
  when p_limit_override is null then 'profile.listing_limit_reset'
  else 'profile.listing_limit_updated'
 end;

 select role into actor from private.admin_roles where user_id = caller;
 insert into private.audit_logs(
  actor_user_id, actor_role, action, target_type, target_id, before_state, after_state, reason
 ) values (
  caller,
  actor,
  audit_action,
  'profile',
  p.public_id::text,
  jsonb_build_object(
   'listing_limit_override', p.listing_limit_override,
   'effective_limit', current_cap,
   'version', p.version
  ),
  jsonb_build_object(
   'listing_limit_override', p_limit_override,
   'effective_limit', resulting_cap,
   'version', p.version + 1
  ),
  trimmed_reason
 );

 return jsonb_build_object(
  'public_id', p.public_id,
  'listing_limit_override', p_limit_override,
  'effective_limit', resulting_cap,
  'version', p.version + 1
 );
end $$;

-- 6. Admin C: Seller account moderation RPC (suspend / hide; owned by padelhub_review_writer).
--    Strictly prohibits reactivation to 'active' (both in RPC and via RLS WITH CHECK).
--    Preserves all listings, listing statuses, photos, is_public, and public_contact_consent;
--    immediately revokes all public profile, marketplace, QR, contact, and media eligibility.
create function public.admin_moderate_seller_status(
 p_seller_public_id uuid,
 p_expected_version integer,
 p_account_status text,
 p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 caller uuid := private.verified_reviewer();
 p public.seller_profiles;
 trimmed_reason text;
 actor text;
 audit_action text;
begin
 if current_setting('transaction_isolation') <> 'read committed' then
  raise exception 'Seller moderation requires READ COMMITTED isolation' using errcode = '25001';
 end if;

 trimmed_reason := btrim(coalesce(p_reason, ''));
 if p_seller_public_id is null
  or p_expected_version is null or p_expected_version < 1
  or p_account_status is null or p_account_status not in ('suspended', 'hidden')
  or char_length(trimmed_reason) not between 1 and 1000 then
  raise exception 'Invalid seller moderation request' using errcode = '22023';
 end if;

 select * into p from public.seller_profiles where public_id = p_seller_public_id for update;
 if not found then
  raise exception 'Profile unavailable' using errcode = '42501';
 end if;

 if p.version is distinct from p_expected_version then
  raise exception 'Stale profile version' using errcode = 'PT409';
 end if;

 if p.account_status = p_account_status then
  raise exception 'Account status is already set to this value' using errcode = 'PT409';
 end if;

 if p.account_status = 'suspended' and p_account_status = 'hidden' then
  raise exception 'Suspended profile requires operator review' using errcode = 'PT409';
 end if;

 update public.seller_profiles
 set account_status = p_account_status,
     version = version + 1,
     updated_at = now()
 where user_id = p.user_id;

 audit_action := case
  when p_account_status = 'suspended' then 'profile.suspended'
  else 'profile.hidden'
 end;

 select role into actor from private.admin_roles where user_id = caller;
 insert into private.audit_logs(
  actor_user_id, actor_role, action, target_type, target_id, before_state, after_state, reason
 ) values (
  caller,
  actor,
  audit_action,
  'profile',
  p.public_id::text,
  jsonb_build_object('account_status', p.account_status, 'version', p.version),
  jsonb_build_object('account_status', p_account_status, 'version', p.version + 1),
  trimmed_reason
 );

 return jsonb_build_object(
  'public_id', p.public_id,
  'account_status', p_account_status,
  'version', p.version + 1
 );
end $$;

grant create on schema public to padelhub_review_writer, padelhub_seller_admin;

alter function public.admin_listing_inventory(text, text, text, text, text, text, integer, uuid)
 owner to padelhub_review_writer;
alter function public.admin_seller_inventory(text, text, text, text, text, text, integer)
 owner to padelhub_review_writer;
alter function public.admin_seller_detail(uuid)
 owner to padelhub_review_writer;
alter function public.admin_moderate_seller_status(uuid, integer, text, text)
 owner to padelhub_review_writer;
alter function public.admin_update_seller_account_type(uuid, integer, text, text)
 owner to padelhub_seller_admin;
alter function public.admin_update_seller_listing_limit(uuid, integer, integer, text)
 owner to padelhub_seller_admin;

revoke all on function
 public.admin_listing_inventory(text, text, text, text, text, text, integer, uuid),
 public.admin_seller_inventory(text, text, text, text, text, text, integer),
 public.admin_seller_detail(uuid),
 public.admin_update_seller_account_type(uuid, integer, text, text),
 public.admin_update_seller_listing_limit(uuid, integer, integer, text),
 public.admin_moderate_seller_status(uuid, integer, text, text)
 from public, anon;

grant execute on function
 public.admin_listing_inventory(text, text, text, text, text, text, integer, uuid),
 public.admin_seller_inventory(text, text, text, text, text, text, integer),
 public.admin_seller_detail(uuid),
 public.admin_update_seller_account_type(uuid, integer, text, text),
 public.admin_update_seller_listing_limit(uuid, integer, integer, text),
 public.admin_moderate_seller_status(uuid, integer, text, text)
 to authenticated;

revoke create on schema public from padelhub_review_writer, padelhub_seller_admin;
revoke padelhub_profile_writer, padelhub_review_writer, padelhub_seller_admin from postgres;

NOTIFY pgrst, 'reload schema';
commit;
