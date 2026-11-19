import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

test.use({ trace:'off', screenshot:'off', video:'off' }); // Never capture MFA setup secrets or session credentials.
test.skip(process.env.PADELHUB_AUTH_E2E !== '1', 'Local Auth and Storage required');
function operator(sql:string) {
  execFileSync('docker',['exec','-i','supabase_db_padelhub-local','psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input:sql,stdio:['pipe','pipe','pipe']});
}
function totp(secret:string) {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits=[...secret.toUpperCase().replace(/=+$/,'')].map(c=>alphabet.indexOf(c).toString(2).padStart(5,'0')).join('');
  const key=Buffer.from(bits.match(/.{8}/g)!.map(byte=>parseInt(byte,2)));
  const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const digest=createHmac('sha1',key).update(counter).digest();const offset=digest[19]&15;
  return String((digest.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
}
test('real TOTP session, review photos, rejection, stale decision, approval and revocation', async ({page,browser},info)=>{
  test.setTimeout(120000);
  const url=process.env.PADELHUB_SUPABASE_URL!;
  if(!['127.0.0.1','localhost'].includes(new URL(url).hostname))throw new Error('Local test only');
  const service=createClient(url,process.env.PADELHUB_SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
  const suffix=`${Date.now()}${info.project.name==='mobile'?'m':'d'}`;
  const password='Local-admin-only-739!';const email=`admin-e2e-${suffix}@example.test`;
  // Isolated verified fixtures; email verification itself is covered by account.spec.ts.
  const admin=await service.auth.admin.createUser({email,password,email_confirm:true});
  const ownerEmail=`admin-owner-${suffix}@example.test`;
  const owner=await service.auth.admin.createUser({email:ownerEmail,password,email_confirm:true});
  if(admin.error||owner.error)throw new Error('Cannot create local fixtures');
  const actor=admin.data.user.id, ownerId=owner.data.user.id;
  const seller=createClient(url,process.env.PADELHUB_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false}});
  await seller.auth.signInWithPassword({email:ownerEmail,password});
  const rpc=async(name:string,args:Record<string,unknown>={})=>{const r=await seller.rpc(name,args);if(r.error)throw new Error(`Fixture RPC ${name}: ${r.error.code}`);return r.data;};
  await rpc('create_seller_profile',{p_username:`a_${suffix}`,p_display_name:'Synthetic admin test owner',p_governorate_slug:'cairo'});
  await rpc('update_seller_profile',{p_expected_version:1,p_patch:{is_public:true}});
  await rpc('update_my_contact',{p_expected_profile_version:2,p_expected_contact_version:1,p_whatsapp_e164:'+201000000001',p_public_contact_consent:true});
  const draft=await rpc('create_listing_draft',{p_category:'balls'}); const id=draft.id;
  await rpc('update_listing_draft',{p_listing_id:id,p_expected_version:1,p_patch:{title:`Admin test balls ${suffix}`,brand_slug:'head',model:'Test',description:'Synthetic admin review fixture only.',governorate_slug:'cairo',condition:'new',condition_disclosure:'Sealed test pack',offer_type:'sale',price_egp:200,balls_quantity_packaging:'Three balls'}});
  const asset=randomUUID(), attempt=randomUUID();const bytes=await sharp({create:{width:320,height:240,channels:3,background:'#245b38'}}).webp().toBuffer();
  const hash=createHash('sha256').update(bytes).digest('hex');const manifest:Record<string,unknown>={};
  for(const variant of ['thumb','card','full']){const key=`processed/${asset}/${attempt}/${variant}.webp`;const upload=await service.storage.from('media-private').upload(key,bytes,{contentType:'image/webp'});if(upload.error)throw new Error('Fixture upload failed');manifest[variant]={key,sha256:hash,bytes:bytes.length};}
  const photo=await service.rpc('save_listing_photo',{p_owner:ownerId,p_listing:id,p_version:2,p_asset:asset,p_attempt:attempt,p_mime:'image/webp',p_bytes:bytes.length*3,p_width:320,p_height:240,p_hash:hash,p_manifest:manifest});
  if(photo.error)throw new Error('Fixture attachment failed');
  await rpc('submit_listing',{p_listing_id:id,p_expected_version:3});
  operator(`insert into private.admin_roles(user_id,role) select id,'admin' from auth.users where id='${actor}' and email='${email}';`);
  const photoUrl=`/api/admin/listings/${id}/photos/${asset}`;
  const sellerContext=await browser.newContext({baseURL:'http://127.0.0.1:3100'}); const sellerPage=await sellerContext.newPage();
  const login=async(p:typeof page,address:string)=>{await p.goto('/en/auth/signin');await p.getByLabel('Email address').fill(address);await p.getByLabel('Password',{exact:true}).fill(password);await p.getByRole('button',{name:'Sign in',exact:true}).click();await expect(p).toHaveURL(/\/account$/);};
  try {
    expect((await page.request.get(photoUrl)).status()).not.toBe(200);
    await login(sellerPage,ownerEmail);
    expect((await sellerPage.goto('/en/admin'))?.status()).toBe(404);
    await login(page,email);await page.goto('/en/admin');
    await expect(page.getByRole('heading',{name:'Admin verification'})).toBeVisible();
    expect((await page.request.get(photoUrl)).status()).not.toBe(200);
    await page.getByRole('button',{name:'Set up authenticator'}).click();
    const secret=await page.getByTestId('mfa-secret').innerText();
    const valid=totp(secret);const invalid=(Number(valid)+1)%1000000;
    await page.getByLabel('Authenticator code').fill(String(invalid).padStart(6,'0'));
    await page.getByRole('button',{name:'Verify code'}).click();
    await expect(page.locator('main').getByRole('alert')).toContainText('could not be verified');
    await page.getByLabel('Authenticator code').fill(totp(secret));await page.getByRole('button',{name:'Verify code'}).click();
    await expect(page.getByRole('heading',{name:'Review listings'})).toBeVisible();
    await page.getByRole('link',{name:`Admin test balls ${suffix}`,exact:true}).click();
    await expect(page.getByRole('heading',{name:'Review listing',exact:true})).toBeVisible();
    expect(await page.content()).not.toContain(`processed/${asset}/`);
    const image=await page.request.get(photoUrl);expect(image.status()).toBe(200);expect(image.headers()['cache-control']).toContain('no-store');
    if(info.project.name==='desktop') {
      const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
      for(const width of [320,390,768,1440])for(const locale of ['en','ar'])for(const theme of ['light','dark']) {
        await page.setViewportSize({width,height:900});
        for(const view of ['queue','review']) {
          await page.goto(view==='queue'?`/${locale}/admin`:`/${locale}/admin/listings/${id}`);
          await page.getByRole('combobox',{name:locale==='en'?'Color theme':'مظهر الموقع'}).selectOption(theme);
          expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
          if(view==='review' && ((width===390&&locale==='ar'&&theme==='dark')||(width===1440&&locale==='en'&&theme==='light')))await page.screenshot({path:`.cache/admin-review-${locale}-${theme}.png`,fullPage:true});
        }
      }
      expect(errors).toEqual([]);
      await page.goto(`/en/admin/listings/${id}`);
    }
    const stale=await page.context().newPage();await stale.goto(`/en/admin/listings/${id}`);
    await page.getByLabel('Reason for rejection').fill('Please provide a clearer condition description.');
    await page.getByRole('button',{name:'Reject listing',exact:true}).click();await expect(page.getByRole('status')).toContainText('saved');
    await stale.getByRole('button',{name:'Approve listing',exact:true}).click();await expect(stale.locator('main').getByRole('alert')).toContainText('changed');await stale.close();
    await sellerPage.goto(`/en/account/listings/${id}`);await expect(sellerPage.getByText('Please provide a clearer condition description.',{exact:true})).toBeVisible();
    await sellerPage.getByRole('button',{name:'Submit for approval',exact:true}).click();await expect(sellerPage.getByRole('status')).toContainText('Submitted');
    await page.goto(`/en/admin/listings/${id}`);await page.getByRole('button',{name:'Approve listing',exact:true}).click();await expect(page.getByRole('status')).toContainText('saved');
    expect((await sellerPage.request.get(`/en/equipment/${id}`)).status()).toBe(200);
    // Real browser mount records one view per tab/day; prefetch/SSR alone does not.
    await sellerPage.goto(`/en/equipment/${id}`);
    await expect.poll(async()=> (await rpc('get_listing_metrics')).views).toBe(1);
    await sellerPage.reload();
    expect((await sellerPage.request.post(`/api/analytics/listings/${id}`,{headers:{origin:'https://example.invalid'}})).status()).toBe(400);
    expect((await sellerPage.request.get(`/api/contact/${id}`,{maxRedirects:0})).status()).toBe(302);
    await expect.poll(async()=> (await rpc('get_listing_metrics')).contacts).toBe(1);
    expect((await rpc('get_listing_metrics')).views).toBe(1);
    await sellerPage.goto('/en/account/listings');
    await expect(sellerPage.getByRole('heading',{name:'Listing activity'})).toBeVisible();
    if(info.project.name==='desktop') {
      for(const width of [390,1440]) for(const locale of ['en','ar']) for(const theme of ['light','dark']) {
        await sellerPage.setViewportSize({width,height:900});
        await sellerPage.goto(`/${locale}/account/listings`);
        await sellerPage.locator('header select').selectOption(theme);
        await expect(sellerPage.locator('main section h2')).toBeVisible();
        expect(await sellerPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        if(width===390 && locale==='ar' && theme==='dark') await sellerPage.screenshot({path:'.cache/analytics-ar-dark.png',fullPage:true});
      }
    }
    // Even a failed analytics write must leave the WhatsApp redirect usable.
    operator('begin; grant padelhub_market_reader to postgres; revoke execute on function public.record_listing_metric(uuid,text) from service_role; revoke padelhub_market_reader from postgres; commit;');
    try {
      expect((await sellerPage.request.get(`/api/contact/${id}`,{maxRedirects:0})).status()).toBe(302);
    } finally { operator('begin; grant padelhub_market_reader to postgres; grant execute on function public.record_listing_metric(uuid,text) to service_role; revoke padelhub_market_reader from postgres; commit;'); }
    await page.goto(`/en/equipment/${id}`);
    await page.getByText('Report content',{exact:true}).click();
    await page.getByLabel('Details (optional)').fill(`Synthetic report ${suffix}`);
    await page.getByRole('button',{name:'Send report',exact:true}).click();
    await expect(page.getByRole('status')).toContainText('Report received');
    await page.goto('/en/admin/reports');
    if(info.project.name==='desktop') {
      for(const locale of ['en','ar'])for(const theme of ['light','dark'])for(const width of [390,768,1440]) {
        await page.setViewportSize({width,height:1000});
        await page.goto(`/${locale}/admin/reports`);
        await page.locator('header select').selectOption(theme);
        await expect(page.locator('section').filter({hasText:`Synthetic report ${suffix}`})).toBeVisible();
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        if(width===390 && theme==='dark' && locale==='ar') await page.screenshot({path:'.cache/reports-ar-dark.png',fullPage:true});
      }
      await page.goto('/en/admin/reports');
    }
    const report=page.locator('section').filter({hasText:`Synthetic report ${suffix}`});
    await report.getByLabel('Decision note (required)').fill('Synthetic moderation removal');
    await report.getByRole('button',{name:'Remove listing',exact:true}).click();
    await expect(page.getByRole('status')).toContainText('Report resolved');
    expect((await sellerPage.request.get(`/en/equipment/${id}`)).status()).toBe(404);
    expect((await sellerPage.request.get(`/api/contact/${id}`,{maxRedirects:0})).status()).toBe(404);
    await page.goto(`/en/@a_${suffix}`);
    await page.getByText('Report content',{exact:true}).click();
    await page.getByLabel('Details (optional)').fill(`Synthetic profile report ${suffix}`);
    await page.getByRole('button',{name:'Send report',exact:true}).click();
    await expect(page.getByRole('status')).toContainText('Report received');
    await page.goto('/en/admin/reports');
    const profileReport=page.locator('section').filter({hasText:`Synthetic profile report ${suffix}`});
    await profileReport.getByLabel('Decision note (required)').fill('Synthetic profile suspension');
    await profileReport.getByRole('button',{name:'Suspend profile',exact:true}).click();
    await expect(page.getByRole('status')).toContainText('Report resolved');
    expect((await sellerPage.request.get(`/en/@a_${suffix}`)).status()).toBe(404);
    await page.goto('/en/account');await page.getByRole('button',{name:'Sign out',exact:true}).click();
    await login(page,email);await page.goto('/en/admin');
    await expect(page.getByLabel('Authenticator code')).toBeVisible();
    await expect(page.getByTestId('mfa-secret')).toHaveCount(0);
    expect((await page.request.get(photoUrl)).status()).not.toBe(200);
    operator(`update private.admin_roles set revoked_at=now() where user_id='${actor}';`);
    expect((await page.goto('/en/admin'))?.status()).toBe(404);
    expect((await page.request.get(photoUrl)).status()).not.toBe(200);
  } finally {
    operator(`update private.admin_roles set revoked_at=now() where user_id='${actor}';`);
    const current=await rpc('get_my_listing',{p_listing_id:id});
    if(['active','pending','reserved'].includes(current.status))await rpc('withdraw_listing',{p_listing_id:id,p_expected_version:current.version});
    await sellerContext.close();
  }
});
