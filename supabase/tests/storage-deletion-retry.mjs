// Local synthetic integration test: a durable key manifest survives database removal.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import sharp from 'sharp';
const status=JSON.parse(execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js','status','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true}));
assert.ok(['localhost','127.0.0.1'].includes(new URL(status.API_URL).hostname));
const client=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const uid=randomUUID(),asset=randomUUID(),attempt=randomUUID();
const key=`processed/${asset}/${attempt}/full.webp`;
const sql=(input)=>execFileSync('docker',['exec','-i','supabase_db_padelhub-local','psql','-X','-tA','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input,encoding:'utf8',windowsHide:true});
const claims=JSON.stringify({sub:uid,session_id:randomUUID(),amr:[{method:'password',timestamp:1795000000}]});
const asOwner=`set local role authenticated; set local request.jwt.claims='${claims}';`;
mkdirSync('.cache/deletion-retry',{recursive:true});
const manifestPath=`.cache/deletion-retry/${uid}.json`;
try {
 sql(`begin; insert into auth.users(id,email_confirmed_at) values('${uid}',now()); ${asOwner} select public.create_seller_profile('retry_${uid.slice(0,8)}','Synthetic retry','cairo'); reset role; insert into public.media_assets(id,owner_id,purpose,status,private_storage_path,input_mime_type,byte_size) values('${asset}','${uid}','listing_photo','pending_upload','${key}','image/webp',100); commit;`);
 const bytes=await sharp({create:{width:64,height:64,channels:3,background:'#14533c'}}).webp().toBuffer();
 const upload=await client.storage.from('media-private').upload(key,bytes,{contentType:'image/webp'});
 assert.equal(upload.error,null);
 sql(`begin; ${asOwner} select public.request_account_deletion('Synthetic storage retry test'); commit;`);
 const keys=JSON.parse(sql(`select json_agg(private_storage_path) from public.media_assets where owner_id='${uid}'`));
 writeFileSync(manifestPath,JSON.stringify({userId:uid,bucket:'media-private',keys}));
 // Operator order, after draining uploads; no app mutation can now acquire the account lock.
 sql(`begin; select private.lock_account('${uid}'); update public.seller_profiles set avatar_media_id=null where user_id='${uid}'; delete from private.photo_upload_idempotency where owner_id='${uid}'; delete from public.listings where seller_id='${uid}'; delete from public.media_assets where owner_id='${uid}'; delete from auth.users where id='${uid}'; commit;`);
 assert.equal(sql(`select count(*) from auth.users where id='${uid}'`).trim(),'0');
 const failed=await fetch(`${status.API_URL}/storage/v1/object/media-private`,{method:'DELETE',headers:{apikey:status.ANON_KEY,Authorization:'Bearer deliberately-invalid', 'Content-Type':'application/json'},body:JSON.stringify({prefixes:keys})});
 assert.ok(!failed.ok,'injected Storage authorization failure must fail');
 assert.equal((await client.storage.from('media-private').download(key)).error,null,'object survives failed deletion after DB removal');
 const durable=JSON.parse(readFileSync(manifestPath,'utf8'));
 for(let retry=0;retry<2;retry++) assert.equal((await client.storage.from(durable.bucket).remove(durable.keys)).error,null);
 const remaining=await client.storage.from('media-private').list(`processed/${asset}/${attempt}`);
 assert.equal(remaining.error,null);assert.equal(remaining.data.length,0);
 console.log('PASS: DB removal, failed Storage deletion, durable-manifest retry, repeated removal and zero remaining objects.');
} finally {
 // Only this run's generated synthetic IDs/key; never enumerate/delete real media.
 await client.storage.from('media-private').remove([key]);
 sql(`begin; delete from public.media_assets where id='${asset}'; delete from auth.users where id='${uid}'; commit;`);
}
