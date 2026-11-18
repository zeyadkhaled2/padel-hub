import { execFileSync } from 'node:child_process';

// Local test fixture only. Exercises the existing approval RPC with a temporary
// synthetic reviewer claim; this is not a production admin sign-in/MFA test.
export function approveLocalListing(id: string) {
  if (process.env.PADELHUB_AUTH_E2E !== '1' || !/^[a-f0-9-]{36}$/.test(id)) throw new Error('Local test listing required');
  execFileSync('docker', ['exec','-i','supabase_db_padelhub-local','psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'], {
    stdio: ['pipe','pipe','pipe'], encoding: 'utf8', input: `
begin;
do $$ begin
 if not exists(select 1 from public.listings l join auth.users u on u.id=l.seller_id where l.id='${id}' and u.email like 't03-%@example.test' and l.title like 'Latest racket title%') then
  raise exception 'Only synthetic browser-test inventory may be approved'; end if;
end $$;
create temp table browser_review_actor(id uuid default gen_random_uuid());
insert into browser_review_actor default values;
insert into auth.users(id,email_confirmed_at) select id,now() from browser_review_actor;
insert into private.admin_roles(user_id,role) select id,'admin' from browser_review_actor;
select set_config('request.jwt.claims',jsonb_build_object('sub',id,'aal','aal2')::text,true) from browser_review_actor;
set local role authenticated;
do $$ declare snapshot jsonb; begin
 snapshot:=public.admin_get_listing_review('${id}');
 perform public.admin_approve_listing('${id}',(snapshot->'listing'->>'version')::integer,(snapshot->'listing'->>'content_version')::integer,(snapshot->'profile'->>'version')::integer,snapshot->'media_manifest');
end $$;
reset role;
update private.admin_roles set revoked_at=now() where user_id in(select id from browser_review_actor);
commit;` });
}
