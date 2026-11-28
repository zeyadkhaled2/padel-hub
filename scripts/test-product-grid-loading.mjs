import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

// Run after npm run build. Both servers bind to loopback and use synthetic data only.

const listing = {
  id: '11111111-1111-4111-8111-111111111111', title: 'Synthetic streaming shoes', category: 'shoes', status: 'active',
  brand_slug: 'adidas', brand_custom: null, model: 'Barricade', description: 'Synthetic browser fixture',
  governorate_slug: 'giza', district_text: null, condition: 'used', condition_disclosure: 'Synthetic wear',
  offer_type: 'sale', price_egp: 3200, is_negotiable: false, swap_preference: null,
  racket_damage_repair_disclosure: null, racket_year: null, racket_shape: null, racket_weight_grams: null,
  racket_purchase_date: null, shoe_size_eu: 44.5, balls_quantity_packaging: null, balls_availability_note: null,
  last_confirmed_available_at: null, media_ids: ['22222222-2222-4222-8222-222222222222'],
  seller: {display_name:'Synthetic seller',username:'synthetic',account_type:'individual'},
};
let pending=[];
const mock=http.createServer((req,res)=>{
  if(req.url==='/rest/v1/rpc/search_public_listings') { req.resume(); pending.push(res); }
  else {res.writeHead(404);res.end();}
});
await new Promise(resolve=>mock.listen(3191,'127.0.0.1',resolve));
const app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--port','3192','--hostname','127.0.0.1'],{
  windowsHide:true,stdio:'ignore',env:{...process.env,PADELHUB_APP_ORIGIN:'http://127.0.0.1:3192',PADELHUB_SUPABASE_URL:'http://127.0.0.1:3191',PADELHUB_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic_only',PADELHUB_SUPABASE_SERVICE_ROLE_KEY:''},
});
let browser;
const release=(mode='results')=>{
  const responses=pending; pending=[];
  for(const res of responses){res.writeHead(mode==='error'?400:200,{'content-type':'application/json'});res.end(JSON.stringify(mode==='error'?{code:'XX000',message:'Synthetic error'}:{items:mode==='empty'?[]:[listing],total:mode==='empty'?0:1}));}
};
try {
  await expect.poll(async()=>{try{return (await fetch('http://127.0.0.1:3192/en/demo')).status;}catch{return 0;}},{timeout:30000}).toBe(200);
  browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL || undefined});
  const page=await browser.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/media/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"/>'}));
  await mkdir('.cache/skeletons',{recursive:true});
  for(const locale of ['en','ar'])for(const width of [390,768,1440])for(const theme of ['light','dark']){
    await page.setViewportSize({width,height:900});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.goto(`http://127.0.0.1:3192/${locale}?q=${locale}-${width}-${theme}`,{waitUntil:'commit'});
    await expect(page.locator('.product-grid-loading')).toBeVisible();
    await expect(page.locator('.product-skeleton')).toHaveCount(6);
    await expect(page.getByRole('status')).toHaveText(locale==='en'?'Loading equipment…':'جارٍ تحميل المعدات…');
    await page.locator(`.theme-switch input[value="${theme}"]`).check();
    await expect(page.locator('.product-grid-loading a, .product-grid-loading button, .product-grid-loading input')).toHaveCount(0);
    await expect.poll(()=>pending.length).toBeGreaterThan(0);
    await page.locator('.market-section').scrollIntoViewIfNeeded();
    await page.screenshot({path:`.cache/skeletons/${locale}-${width}-${theme}.png`});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    release();
    await expect(page.locator('.product-grid-loading')).toHaveCount(0);
    await expect(page.getByRole('heading',{name:listing.title})).toBeVisible();
    console.log('PASS skeleton -> products',locale,width,theme);
  }
  for(const mode of ['empty','error']){
    await page.goto(`http://127.0.0.1:3192/en?q=${mode}`,{waitUntil:'commit'});
    await expect(page.locator('.product-grid-loading')).toBeVisible();
    await expect.poll(()=>pending.length).toBeGreaterThan(0);
    release(mode);
    await expect(page.locator('.product-grid-loading')).toHaveCount(0);
    await expect(page.locator(mode==='empty'?'.empty-state:visible':'.market-section [role=alert]:visible')).toHaveCount(1);
    console.log('PASS skeleton ->',mode);
  }
  // A new search on the same route must reset the Suspense boundary.
  await page.locator('.category-links a[href*="category=shoes"]').first().click({noWaitAfter:true});
  await expect(page.locator('.product-grid-loading')).toBeVisible();
  await expect.poll(()=>pending.length).toBeGreaterThan(0);release();
  await expect(page.getByRole('heading',{name:listing.title})).toBeVisible();
  console.log('PASS category transition; page errors:',errors);expect(errors).toEqual([]);
} finally {
  release('error'); await browser?.close();app.kill();mock.closeAllConnections();await new Promise(resolve=>mock.close(resolve));
}
