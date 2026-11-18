-- Synthetic scratch-only helpers, never installed by migrations or Studio.
create schema test_fixtures;
create function test_fixtures.asset(owner_id uuid,asset_purpose text default 'listing_photo',ready boolean default true) returns uuid language plpgsql as $$
declare asset uuid:=gen_random_uuid(); attempt uuid:=gen_random_uuid(); manifest jsonb;
begin
 select jsonb_object_agg(v,jsonb_build_object('key','processed/'||asset||'/'||attempt||'/'||v||'.webp','sha256',repeat('a',64),'bytes',100)) into manifest from unnest(array['thumb','card','full']) v;
 insert into public.media_assets(id,owner_id,purpose,status,private_storage_path,input_mime_type,byte_size,width_px,height_px,exif_stripped,ready_attempt_id,ready_manifest,content_sha256)
 values(asset,owner_id,asset_purpose,case when ready then 'ready' else 'processing' end,'synthetic/'||asset,'image/jpeg',100,400,400,ready,case when ready then attempt end,case when ready then manifest end,case when ready then repeat('a',64) end);
 return asset;
end $$;
create function test_fixtures.listing(owner_id uuid,listing_status text default 'draft') returns uuid language plpgsql as $$
declare listing uuid:=gen_random_uuid(); asset uuid;
begin
 asset:=test_fixtures.asset(owner_id);
 insert into public.listings(id,seller_id,category,status,title,brand_slug,model,description,governorate_slug,condition,condition_disclosure,offer_type,price_egp,balls_quantity_packaging,last_approved_content_version)
 values(listing,owner_id,'balls',listing_status,'Synthetic balls','head','Test','Synthetic test only','giza','new','Test disclosure','sale',100,'3 balls',case when listing_status in ('active','reserved','sold') then 1 end);
 insert into public.listing_media(listing_id,owner_id,media_id,sort_order) values(listing,owner_id,asset,0);
 return listing;
end $$;
