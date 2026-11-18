-- Owner availability controls; reservation remains post-MVP.
begin;
grant padelhub_listing_writer to postgres;
alter policy listing_update on public.listings
 with check(seller_id=(select auth.uid()) and status in ('draft','pending','rejected','sold','traded','archived'));

create function public.change_listing_status(p_listing_id uuid,p_expected_version integer,p_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.verified_profile_caller(); l public.listings; next_status text;
begin
 if p_action is null or p_action not in ('sold','traded','archive','relist') then
  raise exception 'Invalid listing action' using errcode='22023'; end if;
 -- Keep the same lock order as submission and moderation.
 perform 1 from public.platform_settings where id for share;
 if not found then raise exception 'Settings unavailable' using errcode='55000'; end if;
 perform 1 from public.seller_profiles where user_id=caller and account_status='active' for update;
 if not found then raise exception 'Profile unavailable' using errcode='42501'; end if;
 select * into l from public.listings where id=p_listing_id and seller_id=caller for update;
 if not found then raise exception 'Listing unavailable' using errcode='42501'; end if;
 if l.version is distinct from p_expected_version then raise exception 'Stale listing version' using errcode='PT409'; end if;
 if p_action in ('sold','traded') then
  if l.status<>'active' then raise exception 'Listing is not active' using errcode='PT409'; end if;
  if (p_action='sold' and l.offer_type not in ('sale','both')) or
     (p_action='traded' and (l.category<>'rackets' or l.offer_type not in ('swap','both'))) then
   raise exception 'Action does not match offer' using errcode='22023'; end if;
  next_status:=p_action;
 elsif p_action='archive' then
  if l.status not in ('pending','active') then raise exception 'Listing cannot be archived' using errcode='PT409'; end if;
  next_status:='archived';
 else
  if l.status not in ('sold','traded','archived') then raise exception 'Listing cannot be relisted' using errcode='PT409'; end if;
  next_status:='draft';
 end if;
 update public.listings set status=next_status,version=version+1,updated_at=now() where id=l.id;
 perform private.record_listing_action(caller,l.id,'listing.'||p_action,l.version+1);
 -- Reuse all submission checks. Failure rolls back the entire relist, including
 -- the temporary draft transition; no publication without a fresh admin decision.
 if p_action='relist' then return public.submit_listing(l.id,l.version+1); end if;
 return public.get_my_listing(l.id);
end $$;
grant create on schema public to padelhub_listing_writer;
alter function public.change_listing_status(uuid,integer,text) owner to padelhub_listing_writer;
revoke all on function public.change_listing_status(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.change_listing_status(uuid,integer,text) to authenticated;
revoke create on schema public from padelhub_listing_writer;
revoke padelhub_listing_writer from postgres;
commit;
