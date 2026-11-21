-- Match the foundation invariant that every table in public/private both enables and forces RLS.
begin;
alter table private.confirmed_signup_sessions force row level security;
commit;
