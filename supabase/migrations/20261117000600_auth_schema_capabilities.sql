-- The local vendor Auth schema is owned by supabase_admin. Unlike a scratch
-- schema owned by postgres, it may require an owner/operator to grant USAGE.
-- Fail explicitly instead of accepting PostgreSQL's non-fatal GRANT warning.
begin;
grant usage on schema auth to padelhub_profile_writer, padelhub_listing_writer, padelhub_review_writer;
do $$
begin
 if not has_schema_privilege('padelhub_profile_writer', 'auth', 'USAGE')
 or not has_schema_privilege('padelhub_listing_writer', 'auth', 'USAGE')
 or not has_schema_privilege('padelhub_review_writer', 'auth', 'USAGE') then
  raise exception 'Auth schema owner must grant USAGE to the three PadelHub writer roles before replaying this migration';
 end if;
end $$;
commit;
