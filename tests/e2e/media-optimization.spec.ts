import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });

function localDbSql(sql: string) {
  execFileSync(
    'docker',
    [
      'exec',
      '-i',
      'supabase_db_padelhub-local',
      'psql',
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      'postgres',
    ],
    { input: sql, stdio: ['pipe', 'pipe', 'pipe'] },
  );
}

function approveSyntheticMediaListing(listingId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(listingId)) throw new Error('Invalid listing id');
  const adminId = '00000000-0000-4000-8000-0000000000a3';
  localDbSql(`
    begin;
    do $$ begin
      if not exists(select 1 from public.listings l join auth.users u on u.id = l.seller_id where l.id = '${listingId}' and u.email like 'media-opt-%@example.test') then
        raise exception 'Only synthetic media-opt test inventory may be approved';
      end if;
    end $$;
    insert into auth.users(id, email_confirmed_at) values ('${adminId}', now()) on conflict (id) do nothing;
    insert into private.admin_roles(user_id, role) values ('${adminId}', 'admin')
      on conflict (user_id) do update set revoked_at = null;
    set local role authenticated;
    set local request.jwt.claims = '{"sub":"${adminId}","aal":"aal2","session_id":"00000000-0000-4000-8000-0000000000a3","amr":[{"method":"password","timestamp":1795000000},{"method":"totp","timestamp":1795000001}]}';
    do $$
    declare
      review jsonb := public.admin_get_listing_review('${listingId}');
    begin
      perform public.admin_approve_listing(
        '${listingId}',
        (review->'listing'->>'version')::integer,
        (review->'listing'->>'content_version')::integer,
        (review->'profile'->>'version')::integer,
        review->'media_manifest'
      );
    end $$;
    reset role;
    update private.admin_roles set revoked_at = now() where user_id = '${adminId}';
    commit;
  `);
}

async function createNoisyLargeJpeg(width: number, height: number, quality = 94): Promise<Buffer> {
  const raw = Buffer.allocUnsafe(width * height * 3);
  let seed = width * 31 + height;
  for (let i = 0; i < raw.length; i += 3) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const n = (seed >>> 24) & 0x7f;
    raw[i] = 35 + n;
    raw[i + 1] = 85 + (n >> 1);
    raw[i + 2] = 65 + (n >> 1);
  }
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg({ quality, chromaSubsampling: '4:4:4' })
    .withMetadata()
    .toBuffer();
}

async function createRotatedCornerMarkerJpeg(): Promise<Buffer> {
  // Raw 1200x800 image with bright RED block in top-left corner (0..200, 0..200) and EXIF orientation = 6 (90° CW).
  // After proper orientation normalization (without double-rotation), output MUST be 800x1200 with RED block in TOP-RIGHT corner!
  const width = 1200;
  const height = 800;
  const raw = Buffer.alloc(width * height * 3, 40);
  for (let y = 0; y < 220; y++) {
    for (let x = 0; x < 220; x++) {
      const idx = (y * width + x) * 3;
      raw[idx] = 240;
      raw[idx + 1] = 20;
      raw[idx + 2] = 20;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .withMetadata({ orientation: 6 })
    .jpeg({ quality: 92 })
    .toBuffer();
}

async function createTransparentPng(): Promise<Buffer> {
  const width = 2200;
  const height = 1650;
  const raw = Buffer.alloc(width * height * 4, 0);
  for (let y = 300; y < 1350; y++) {
    for (let x = 400; x < 1800; x++) {
      const idx = (y * width + x) * 4;
      raw[idx] = 20;
      raw[idx + 1] = 110;
      raw[idx + 2] = 80;
      raw[idx + 3] = 255;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/en/auth/signin');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/en\/account$/);
}

test.describe('Media Optimization V1 — Client Prep, HEIC, Queue, Idempotency & ETag Delivery', () => {
  test.skip(process.env.PADELHUB_AUTH_E2E !== '1', 'Requires local Supabase Auth and Storage');
  test.setTimeout(240_000);

  test('large >4MB & 48MP photos, real HEVC HEIC fallback, rotated EXIF, transparent PNG, WebP passthrough, multi-photo queue, interrupted/ambiguous recovery, 413 handling & ETag/304 public delivery', async ({
    page,
    browser,
  }, info) => {
    const supabaseUrl = process.env.PADELHUB_SUPABASE_URL!;
    if (!['127.0.0.1', 'localhost'].includes(new URL(supabaseUrl).hostname)) {
      throw new Error('Local test only');
    }

    const service = createClient(supabaseUrl, process.env.PADELHUB_SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
    const suffix = `${Date.now()}${info.project.name === 'mobile' ? 'm' : 'd'}`;
    const email = `media-opt-${suffix}@example.test`;
    const password = 'Local-Media-Opt-V1-882!';
    const username = `mopt_${suffix}`;

    const createdUser = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createdUser.error || !createdUser.data.user) {
      throw new Error(`Could not create test user: ${createdUser.error?.message}`);
    }

    const sellerClient = createClient(supabaseUrl, process.env.PADELHUB_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false },
    });
    await sellerClient.auth.signInWithPassword({ email, password });
    const rpc = async (name: string, args: Record<string, unknown> = {}) => {
      const r = await sellerClient.rpc(name, args);
      if (r.error) throw new Error(`RPC ${name} failed: ${r.error.code} ${r.error.message}`);
      return r.data;
    };

    const createdListings: string[] = [];
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    // Prepare real-world test photographs once.
    const largeIphoneJpeg = await createNoisyLargeJpeg(3600, 2700, 96); // > 4.5 MB raw!
    expect(largeIphoneJpeg.length).toBeGreaterThan(4_500_000);

    // 48 MP iPhone-class JPEG (8064x6048 = 48.77 MP, low-noise gradient keeps file ~2-3 MB while testing true 48 MP decode!)
    const photo48Mp = await sharp({
      create: { width: 8064, height: 6048, channels: 3, background: '#14533c' },
    })
      .jpeg({ quality: 82 })
      .toBuffer();

    const rotatedExifJpeg = await createRotatedCornerMarkerJpeg();
    const transparentPng = await createTransparentPng();
    const optimizedWebp = await sharp({
      create: { width: 1000, height: 750, channels: 3, background: '#2a6f54' },
    })
      .webp({ quality: 82 })
      .toBuffer();
    const realHeic = await readFile(join(process.cwd(), 'tests', 'fixtures', 'real-hevc-sample.heic'));

    const benchmarkRecords: Array<Record<string, unknown>> = [];

    try {
      // Setup public seller profile with WhatsApp consent.
      await rpc('create_seller_profile', {
        p_username: username,
        p_display_name: 'Media Opt Seller',
        p_governorate_slug: 'cairo',
      });
      await rpc('update_seller_profile', {
        p_expected_version: 1,
        p_patch: { is_public: true },
      });
      await rpc('update_my_contact', {
        p_expected_profile_version: 2,
        p_expected_contact_version: 1,
        p_whatsapp_e164: '+201099887766',
        p_public_contact_consent: true,
      });

      await signIn(page, email, password);

      // -----------------------------------------------------------------------
      // DRAFT 1: Format compatibility + lazy HEIC + EXIF rotation + alpha + passthrough
      // -----------------------------------------------------------------------
      const draft1 = await rpc('create_listing_draft', { p_category: 'rackets' });
      createdListings.push(draft1.id);
      await rpc('update_listing_draft', {
        p_listing_id: draft1.id,
        p_expected_version: draft1.version,
        p_patch: {
          title: `Media Opt Racket ${suffix}`,
          brand_slug: 'bullpadel',
          model: 'Vertex 04',
          description: 'Testing client-side optimization, HEIC decoding, and ETag delivery.',
          governorate_slug: 'cairo',
          condition: 'used',
          condition_disclosure: 'Minor court scuffs on top edge.',
          racket_damage_repair_disclosure: 'No cracks or repairs.',
          offer_type: 'sale',
          price_egp: 6500,
        },
      });

      const heicModuleResponses: number[] = [];
      page.on('response', (res) => {
        if (res.url().includes('/vendor/libheif/libheif-bundle.mjs')) {
          heicModuleResponses.push(res.status());
        }
      });

      await page.goto(`/en/account/photos?listing=${draft1.id}`);
      await expect(page.getByText('0 of 4 photos')).toBeVisible();

      // Verify >4,000,000 byte direct API bypass is still rejected by server with 413!
      const directOversize = await page.request.post(`/api/listings/${draft1.id}/photos`, {
        headers: {
          Origin: 'http://127.0.0.1:3100',
          'X-Listing-Version': '2',
          'Content-Type': 'image/jpeg',
        },
        data: largeIphoneJpeg,
      });
      expect(directOversize.status()).toBe(413);

      // Verify raw HEIC sent directly to server endpoint is rejected with 400 (never processed by Sharp)!
      const directHeic = await page.request.post(`/api/listings/${draft1.id}/photos`, {
        headers: {
          Origin: 'http://127.0.0.1:3100',
          'X-Listing-Version': '2',
          'Content-Type': 'image/heic',
        },
        data: realHeic,
      });
      expect(directHeic.status()).toBe(400);

      // 1A. Upload >4.5 MB noisy iPhone-class JPEG via UI -> client shrinks < 1 MB and saves cleanly!
      const largeReqPromise = page.waitForRequest(
        (req) => req.method() === 'POST' && req.url().includes(`/api/listings/${draft1.id}/photos`),
      );
      const largeResPromise = page.waitForResponse(
        (res) => res.request().method() === 'POST' && res.url().includes(`/api/listings/${draft1.id}/photos`),
      );
      const tStartLarge = Date.now();
      await page.getByLabel('Choose equipment photo').setInputFiles({
        name: 'iphone-large-12mp.jpg',
        mimeType: 'image/jpeg',
        buffer: largeIphoneJpeg,
      });
      await expect(page.locator('.photo-queue-badge.is-ready')).toBeVisible({ timeout: 25_000 });
      await expect(page.locator('.photo-queue-size')).toContainText('→');
      await page.getByRole('button', { name: 'Upload photo', exact: true }).click();
      const largeReq = await largeReqPromise;
      const largeRes = await largeResPromise;
      expect(largeRes.status()).toBe(201);
      const largeSaved = await largeRes.json();
      const largeTransferBytes = Number(
        largeSaved.incomingBytes ?? largeReq.headers()['content-length'] ?? 0,
      );
      expect(largeTransferBytes).toBeGreaterThan(0);
      expect(largeTransferBytes).toBeLessThanOrEqual(4_000_000);
      expect(largeTransferBytes).toBeLessThan(largeIphoneJpeg.length * 0.4);
      benchmarkRecords.push({
        case: 'Large >4.5MB JPEG (3600x2700)',
        originalBytes: largeIphoneJpeg.length,
        uploadedBytes: largeTransferBytes,
        reductionPct: Number((((largeIphoneJpeg.length - largeTransferBytes) / largeIphoneJpeg.length) * 100).toFixed(1)),
        storedBytes: largeSaved.storedBytes,
        serverMs: largeSaved.serverProcessingMs,
        e2eMs: Date.now() - tStartLarge,
      });
      await expect(page.getByText('1 of 4 photos')).toBeVisible();

      // 1B. Upload rotated EXIF Orientation=6 JPEG -> verify upright 800x1200 (NO double rotation) & red corner in TOP-RIGHT!
      await page.getByLabel('Choose equipment photo').setInputFiles({
        name: 'rotated-exif6.jpg',
        mimeType: 'image/jpeg',
        buffer: rotatedExifJpeg,
      });
      await expect(page.locator('.photo-queue-badge.is-ready')).toBeVisible({ timeout: 20_000 });
      await page.getByRole('button', { name: 'Upload photo', exact: true }).click();
      await expect(page.getByText('2 of 4 photos')).toBeVisible();
      const rotatedImgSrc = (await page.locator('.photo-grid img').nth(1).getAttribute('src'))!.replace(
        'variant=card',
        'variant=full',
      );
      const rotatedFullBytes = await (await page.request.get(rotatedImgSrc)).body();
      const rotatedMeta = await sharp(rotatedFullBytes).metadata();
      expect(rotatedMeta.format).toBe('webp');
      expect(rotatedMeta.exif).toBeUndefined();
      expect(rotatedMeta.width).toBe(800);
      expect(rotatedMeta.height).toBe(1200);
      // Verify red corner is at TOP-RIGHT (x=760, y=40), NOT top-left or bottom-left!
      const rotatedRaw = await sharp(rotatedFullBytes).raw().toBuffer({ resolveWithObject: true });
      const pixelAt = (x: number, y: number) => {
        const idx = (y * rotatedRaw.info.width + x) * rotatedRaw.info.channels;
        return [rotatedRaw.data[idx], rotatedRaw.data[idx + 1], rotatedRaw.data[idx + 2]];
      };
      const topRight = pixelAt(740, 60);
      const topLeft = pixelAt(60, 60);
      expect(topRight[0]).toBeGreaterThan(180);
      expect(topRight[1]).toBeLessThan(80);
      expect(topLeft[0]).toBeLessThan(80);

      // 1C. Upload transparent PNG (2200x1650 RGBA) -> verify alpha transparency preserved (no black fill)!
      await page.getByLabel('Choose equipment photo').setInputFiles({
        name: 'racket-cutout.png',
        mimeType: 'image/png',
        buffer: transparentPng,
      });
      await expect(page.locator('.photo-queue-badge.is-ready')).toBeVisible({ timeout: 20_000 });
      await page.getByRole('button', { name: 'Upload photo', exact: true }).click();
      await expect(page.getByText('3 of 4 photos')).toBeVisible();
      const pngImgSrc = (await page.locator('.photo-grid img').nth(2).getAttribute('src'))!.replace(
        'variant=card',
        'variant=full',
      );
      const pngFullBytes = await (await page.request.get(pngImgSrc)).body();
      const pngDecoded = await sharp(pngFullBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      // Corner pixel (10, 10) must remain transparent (alpha === 0), NOT opaque black (alpha === 255)!
      const cornerAlpha = pngDecoded.data[(10 * pngDecoded.info.width + 10) * 4 + 3];
      expect(cornerAlpha).toBeLessThan(10);

      // Verify standalone LGPL-3.0 libheif module was NOT loaded before selecting an actual HEIC file!
      expect(heicModuleResponses.length).toBe(0);

      // 1D. Upload REAL HEVC-encoded .heic file -> triggers lazy standalone WASM fallback in Chromium!
      const heicReqPromise = page.waitForRequest(
        (req) => req.method() === 'POST' && req.url().includes(`/api/listings/${draft1.id}/photos`),
      );
      await page.getByLabel('Choose equipment photo').setInputFiles({
        name: 'IMG_4021.HEIC',
        mimeType: '', // Real mobile browsers often report empty MIME for HEIC!
        buffer: realHeic,
      });
      await expect(page.locator('.photo-queue-badge.is-ready')).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('.photo-queue-size')).toContainText('HEIC converted');
      const heicPreviewWidth = await page
        .locator('.photo-queue-thumb img')
        .evaluate((img: HTMLImageElement) => img.naturalWidth);
      expect(heicPreviewWidth).toBe(320);
      expect(heicModuleResponses.length).toBeGreaterThanOrEqual(1);
      expect(heicModuleResponses[0]).toBe(200);

      // Verify LGPL-3.0 license & notice files are served cleanly over HTTP!
      for (const noticePath of [
        '/licenses/libheif-js-NOTICE.txt',
        '/licenses/libheif-js-LICENSE.txt',
        '/vendor/libheif/LICENSE.txt',
      ]) {
        const noticeRes = await page.request.get(noticePath);
        expect(noticeRes.status()).toBe(200);
        const body = await noticeRes.text();
        expect(body).toMatch(/LGPL|GNU LESSER GENERAL PUBLIC LICENSE/i);
      }

      await page.getByRole('button', { name: 'Upload photo', exact: true }).click();
      const heicReq = await heicReqPromise;
      expect(heicReq.headers()['x-client-heic-fallback']).toBe('1');
      expect(heicReq.headers()['x-client-source-format']).toBe('heic');
      expect(heicReq.headers()['content-type']).toMatch(/^image\/(webp|jpeg)$/);
      await expect(page.getByText('4 of 4 photos')).toBeVisible();

      // -----------------------------------------------------------------------
      // PUBLIC DELIVERY, ETAG / 304 & REVOCATION (on Draft 1 after approval)
      // -----------------------------------------------------------------------
      const latestDraft1 = await rpc('get_my_listing', { p_listing_id: draft1.id });
      const submitted1 = await rpc('submit_listing', {
        p_listing_id: draft1.id,
        p_expected_version: latestDraft1.version,
      });
      expect(submitted1.status).toBe('pending');
      approveSyntheticMediaListing(draft1.id);

      const firstMediaId = latestDraft1.media_ids[0] as string;
      const anonCtx = await browser.newContext({ baseURL: 'http://127.0.0.1:3100' });

      // Approved public GET: 200, Cache-Control: private, no-cache, quoted SHA-256 ETag!
      const pubCard = await anonCtx.request.get(
        `/api/media/${firstMediaId}?listing=${draft1.id}&variant=card`,
      );
      expect(pubCard.status()).toBe(200);
      expect(pubCard.headers()['cache-control']).toBe('private, no-cache');
      const cardEtag = pubCard.headers()['etag']!;
      expect(cardEtag).toMatch(/^"[a-f0-9]{64}"$/);

      // Conditional GET & HEAD with matching ETag -> 304 Not Modified!
      const pubCard304 = await anonCtx.request.get(
        `/api/media/${firstMediaId}?listing=${draft1.id}&variant=card`,
        { headers: { 'If-None-Match': cardEtag } },
      );
      expect(pubCard304.status()).toBe(304);
      expect(pubCard304.headers()['etag']).toBe(cardEtag);
      expect(pubCard304.headers()['cache-control']).toBe('private, no-cache');

      const pubHead304 = await anonCtx.request.head(
        `/api/media/${firstMediaId}?listing=${draft1.id}&variant=card`,
        { headers: { 'If-None-Match': cardEtag } },
      );
      expect(pubHead304.status()).toBe(304);

      // Wrong-variant ETag (card ETag sent to variant=full) MUST return 200 with full ETag!
      const pubFull = await anonCtx.request.get(
        `/api/media/${firstMediaId}?listing=${draft1.id}&variant=full`,
        { headers: { 'If-None-Match': cardEtag } },
      );
      expect(pubFull.status()).toBe(200);
      expect(pubFull.headers()['etag']).not.toBe(cardEtag);

      // Owner private endpoint (without ?listing=) ALWAYS returns private, no-store and NO ETag!
      const ownerPrivate = await page.request.get(`/api/media/${firstMediaId}?variant=card`);
      expect(ownerPrivate.status()).toBe(200);
      expect(ownerPrivate.headers()['cache-control']).toBe('private, no-store');
      expect(ownerPrivate.headers()['etag']).toBeUndefined();

      // Withdraw listing -> conditional request with previously valid ETag MUST return 404 private, no-store (NEVER 304)!
      const activeD1 = await rpc('get_my_listing', { p_listing_id: draft1.id });
      await rpc('withdraw_listing', { p_listing_id: draft1.id, p_expected_version: activeD1.version });

      const revoked304Attempt = await anonCtx.request.get(
        `/api/media/${firstMediaId}?listing=${draft1.id}&variant=card`,
        { headers: { 'If-None-Match': cardEtag } },
      );
      expect(revoked304Attempt.status()).toBe(404);
      expect(revoked304Attempt.headers()['cache-control']).toBe('private, no-store');
      expect(revoked304Attempt.headers()['etag']).toBeUndefined();
      await anonCtx.close();

      // -----------------------------------------------------------------------
      // DRAFT 2: Multi-photo 4-photo sequential upload + 48 MP + WebP passthrough +
      //          interrupted failure recovery + ambiguous-response idempotency + plain-text 413
      // -----------------------------------------------------------------------
      const draft2 = await rpc('create_listing_draft', { p_category: 'shoes' });
      createdListings.push(draft2.id);

      await page.goto(`/en/account/photos?listing=${draft2.id}`);
      await expect(page.getByText('0 of 4 photos')).toBeVisible();

      // 2A. Select 4 photos simultaneously (48 MP + passthrough WebP + 2 JPEGs):
      //     Intercept 2nd upload to fail (network abort), 3rd upload to simulate AMBIGUOUS response
      //     (forward to server so DB commits, then drop browser response!) to prove ZERO duplicate attachment!
      let postAttempt = 0;
      let forcedAbortDone = false;
      let ambiguousDone = false;
      const seenTransferSizes: number[] = [];

      await page.route(`**/api/listings/${draft2.id}/photos`, async (route) => {
        if (route.request().method() !== 'POST') {
          await route.continue();
          return;
        }
        postAttempt++;
        const hdrLen = Number(route.request().headers()['content-length'] ?? 0);
        seenTransferSizes.push(hdrLen || route.request().postDataBuffer()?.length || 0);

        // Fail 2nd photo initially (both initial try and auto-retry fail -> triggers manual Retry while preserving photo #1!)
        if (!forcedAbortDone && postAttempt === 2) {
          await route.abort('failed');
          return;
        }
        if (!forcedAbortDone && postAttempt === 3) {
          forcedAbortDone = true;
          await route.abort('failed');
          return;
        }

        // On photo #3 (after manual retry of #2 succeeds), commit on server then abort browser response!
        if (!ambiguousDone && postAttempt === 5) {
          ambiguousDone = true;
          const serverRes = await route.fetch();
          expect(serverRes.status()).toBe(201);
          await route.abort('connectionreset');
          return;
        }

        await route.continue();
      });

      const smallJpeg1 = await sharp({
        create: { width: 900, height: 675, channels: 3, background: '#3d5a80' },
      })
        .jpeg({ quality: 88 })
        .toBuffer();
      const smallJpeg2 = await sharp({
        create: { width: 900, height: 675, channels: 3, background: '#c85a32' },
      })
        .jpeg({ quality: 88 })
        .toBuffer();

      await page.getByLabel('Choose equipment photo').setInputFiles([
        { name: 'iphone-48mp.jpg', mimeType: 'image/jpeg', buffer: photo48Mp },
        { name: 'already-optimized.webp', mimeType: 'image/webp', buffer: optimizedWebp },
        { name: 'shoe-side.jpg', mimeType: 'image/jpeg', buffer: smallJpeg1 },
        { name: 'shoe-sole.jpg', mimeType: 'image/jpeg', buffer: smallJpeg2 },
      ]);

      await expect(page.locator('.photo-queue-item')).toHaveCount(4);
      await expect(page.locator('.photo-queue-badge.is-ready')).toHaveCount(4, { timeout: 30_000 });
      await expect(page.getByRole('button', { name: 'Upload 4 photos', exact: true })).toBeVisible();

      // Capture desktop & mobile screenshots of the ready 4-photo multi-upload queue!
      if (info.project.name === 'desktop') {
        await mkdir('.cache/media-opt-screenshots', { recursive: true });
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.screenshot({
          path: '.cache/media-opt-screenshots/queue-ready-1440-en-light.png',
          fullPage: true,
        });
        await page.setViewportSize({ width: 390, height: 900 });
        const overflowEn = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(overflowEn).toBeLessThanOrEqual(0);
        await page.screenshot({
          path: '.cache/media-opt-screenshots/queue-ready-390-en-light.png',
          fullPage: true,
        });
        await page.setViewportSize({ width: 1280, height: 900 });
      }

      // Click Upload 4 photos -> Photo #1 (48 MP!) saves, Photo #2 fails due to simulated network drop!
      await page.getByRole('button', { name: 'Upload 4 photos', exact: true }).click();
      await expect(page.getByText('1 of 4 photos')).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('.photo-queue-item.is-failed')).toHaveCount(1, { timeout: 15_000 });
      await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();

      // Capture failure/retry state screenshot in desktop EN!
      if (info.project.name === 'desktop') {
        await page.screenshot({
          path: '.cache/media-opt-screenshots/queue-retry-1280-en-light.png',
          fullPage: true,
        });
      }

      // Click Retry on Photo #2 (already-optimized.webp) -> verifies passthrough size === exact original WebP bytes!
      await page.getByRole('button', { name: 'Retry', exact: true }).click();
      await expect(page.getByText('2 of 4 photos')).toBeVisible({ timeout: 20_000 });
      expect(seenTransferSizes[3]).toBe(optimizedWebp.length);

      // Now upload remaining 2 photos (#3 hits AMBIGUOUS dropped response after server commit -> reconciles with 0 duplicates, then #4 uploads!)
      await page.getByRole('button', { name: 'Upload 2 photos', exact: true }).click();
      await expect(page.getByText('4 of 4 photos')).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('.photo-grid img')).toHaveCount(4);

      const finalDraft2 = await rpc('get_my_listing', { p_listing_id: draft2.id });
      expect(finalDraft2.media_ids.length).toBe(4);
      expect(ambiguousDone).toBe(true);

      await page.unroute(`**/api/listings/${draft2.id}/photos`);

      // 2B. Verify hosting-level plain-text HTTP 413 (e.g. Vercel FUNCTION_PAYLOAD_TOO_LARGE) shows clear EN message!
      await page.route(`**/api/listings/${draft2.id}/photos`, async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 413,
            contentType: 'text/plain',
            body: 'FUNCTION_PAYLOAD_TOO_LARGE: Request Entity Too Large',
          });
          return;
        }
        await route.continue();
      });
      await page.getByRole('button', { name: 'Replace photo', exact: true }).first().click();
      await page.getByLabel('Choose equipment photo').setInputFiles({
        name: 'replace-413.jpg',
        mimeType: 'image/jpeg',
        buffer: smallJpeg1,
      });
      await expect(page.locator('.photo-queue-badge.is-ready')).toBeVisible({ timeout: 15_000 });
      await page.getByRole('button', { name: 'Replace photo', exact: true }).last().click();
      await expect(page.getByRole('status')).toContainText('4 MB');
      await page.unroute(`**/api/listings/${draft2.id}/photos`);

      // -----------------------------------------------------------------------
      // DRAFT 3: Regression tests — multi-large-photo prep cancellation, cancelled-upload retry
      //          (uncommitted & ambiguous commit), cancel during retry backoff, cancelled
      //          replacement retry, and conflict / Retry-After gates on individual Retry
      // -----------------------------------------------------------------------
      const draft3 = await rpc('create_listing_draft', { p_category: 'bags' });
      createdListings.push(draft3.id);

      await page.goto(`/en/account/photos?listing=${draft3.id}`);
      await expect(page.getByText('0 of 4 photos')).toBeVisible();

      // 3A. Select two large photos simultaneously (48 MP + >4.5 MB), immediately cancel one during
      //     serial preparation, and confirm the remaining large photo prepares & uploads cleanly!
      await page.getByLabel('Choose equipment photo').setInputFiles([
        { name: 'prep-cancel-48mp.jpg', mimeType: 'image/jpeg', buffer: photo48Mp },
        { name: 'prep-keep-large.jpg', mimeType: 'image/jpeg', buffer: largeIphoneJpeg },
      ]);
      await expect(page.locator('.photo-queue-item')).toHaveCount(2);
      const cancelFirstPrepBtn = page
        .locator('.photo-queue-item')
        .first()
        .locator('button')
        .last();
      await cancelFirstPrepBtn.click();
      await expect(
        page.locator('.photo-queue-item', { hasText: 'prep-keep-large.jpg' }).locator('.photo-queue-badge.is-ready'),
      ).toBeVisible({ timeout: 25_000 });
      await page.getByRole('button', { name: 'Upload photo', exact: true }).click();
      await expect(page.getByText('1 of 4 photos')).toBeVisible({ timeout: 25_000 });

      // 3B. Cancelled upload retry (server did NOT commit): hold POST open, click Cancel,
      //     verify preview preserved + Retry works after reconciling GET!
      let hold3BRelease!: () => void;
      const hold3BEntered = new Promise<void>((r) => {
        hold3BRelease = r;
      });
      let post3BCount = 0;
      let get3BReconcileCount = 0;
      let allow3BContinue!: () => void;
      const wait3BGate = new Promise<void>((r) => {
        allow3BContinue = r;
      });

      await page.route(`**/api/listings/${draft3.id}/photos*`, async (route) => {
        if (route.request().method() === 'GET' && route.request().url().includes('uploadKey=')) {
          get3BReconcileCount++;
          await route.continue();
          return;
        }
        if (route.request().method() === 'POST') {
          post3BCount++;
          if (post3BCount === 1) {
            hold3BRelease();
            await wait3BGate;
            await route.abort('aborted').catch(() => {});
            return;
          }
        }
        await route.continue();
      });

      await page.getByLabel('Choose equipment photo').setInputFiles({
        name: 'cancel-retry-uncommitted.jpg',
        mimeType: 'image/jpeg',
        buffer: smallJpeg1,
      });
      await expect(page.locator('.photo-queue-badge.is-ready')).toBeVisible({ timeout: 15_000 });
      await page.getByRole('button', { name: 'Upload photo', exact: true }).click();
      await hold3BEntered;
      await page.getByRole('button', { name: 'Cancel upload for cancel-retry-uncommitted.jpg' }).click();
      allow3BContinue();

      await expect(page.locator('.photo-queue-badge.is-cancelled')).toBeVisible();
      await expect(page.locator('.photo-queue-thumb img')).toBeVisible(); // Thumbnail preserved!
      const retry3BBtn = page.getByRole('button', { name: 'Retry', exact: true });
      await expect(retry3BBtn).toBeEnabled();
      await retry3BBtn.click();
      await expect(page.getByText('2 of 4 photos')).toBeVisible({ timeout: 20_000 });
      expect(get3BReconcileCount).toBeGreaterThanOrEqual(1);
      expect(post3BCount).toBe(2);
      await page.unroute(`**/api/listings/${draft3.id}/photos*`);

      // 3C. Cancelled upload retry (AMBIGUOUS SERVER COMMIT): forward POST to real server so DB commits (201),
      //     hold browser response until seller clicks Cancel -> Retry MUST reconcile and save with 0 duplicate POSTs!
      let post3CCount = 0;
      let committed3CReady!: () => void;
      const wait3CCommitted = new Promise<void>((r) => {
        committed3CReady = r;
      });
      let release3CAbort!: () => void;
      const wait3CAbort = new Promise<void>((r) => {
        release3CAbort = r;
      });

      await page.route(`**/api/listings/${draft3.id}/photos*`, async (route) => {
        if (route.request().method() === 'POST') {
          post3CCount++;
          if (post3CCount === 1) {
            const serverRes = await route.fetch();
            expect(serverRes.status()).toBe(201);
            committed3CReady();
            await wait3CAbort;
            await route.abort('connectionreset').catch(() => {});
            return;
          }
        }
        await route.continue();
      });

      await page.getByLabel('Choose equipment photo').setInputFiles({
        name: 'cancel-retry-committed.jpg',
        mimeType: 'image/jpeg',
        buffer: smallJpeg2,
      });
      await expect(page.locator('.photo-queue-badge.is-ready')).toBeVisible({ timeout: 15_000 });
      await page.getByRole('button', { name: 'Upload photo', exact: true }).click();
      await wait3CCommitted;
      await page.getByRole('button', { name: 'Cancel upload for cancel-retry-committed.jpg' }).click();
      release3CAbort();

      await expect(page.locator('.photo-queue-badge.is-cancelled')).toBeVisible();
      await page.getByRole('button', { name: 'Retry', exact: true }).click();
      await expect(page.getByText('3 of 4 photos')).toBeVisible({ timeout: 20_000 });
      expect(post3CCount).toBe(1); // Zero duplicate POST!
      await page.unroute(`**/api/listings/${draft3.id}/photos*`);

      // 3D. Cancel during automatic retry backoff delay (503 Retry-After: 4) -> ZERO second automatic POST!
      let post3DCount = 0;
      let reconcile3DDone!: () => void;
      const wait3DBackoff = new Promise<void>((r) => {
        reconcile3DDone = r;
      });

      await page.route(`**/api/listings/${draft3.id}/photos*`, async (route) => {
        if (route.request().method() === 'POST') {
          post3DCount++;
          await route.fulfill({
            status: 503,
            headers: { 'Content-Type': 'application/json', 'Retry-After': '4' },
            body: JSON.stringify({ error: 'unavailable' }),
          });
          return;
        }
        if (route.request().method() === 'GET' && route.request().url().includes('uploadKey=')) {
          await route.continue();
          reconcile3DDone();
          return;
        }
        await route.continue();
      });

      await page.getByLabel('Choose equipment photo').setInputFiles({
        name: 'cancel-during-backoff.jpg',
        mimeType: 'image/jpeg',
        buffer: optimizedWebp,
      });
      await expect(page.locator('.photo-queue-badge.is-ready')).toBeVisible({ timeout: 15_000 });
      await page.getByRole('button', { name: 'Upload photo', exact: true }).click();
      await wait3DBackoff;
      // Wait briefly so the browser finishes parsing the reconcile response and enters the 4s backoff timer.
      await page.waitForTimeout(200);
      // Click Cancel while waiting inside the 4-second retry backoff delay!
      await page.getByRole('button', { name: 'Cancel upload for cancel-during-backoff.jpg' }).click();
      await expect(page.locator('.photo-queue-badge.is-cancelled')).toBeVisible();
      await page.waitForTimeout(1500);
      expect(post3DCount).toBe(1); // Backoff aborted cleanly; zero second POST!
      await page.unroute(`**/api/listings/${draft3.id}/photos*`);

      // Now Retry that cancelled item cleanly to fill slot 4 of 4!
      await page.getByRole('button', { name: 'Retry', exact: true }).click();
      await expect(page.getByText('4 of 4 photos')).toBeVisible({ timeout: 20_000 });

      // 3E. Cancelled replacement retry (AMBIGUOUS COMMITTED REPLACEMENT): replace photo #1,
      //     commit on server (201), hold until Cancel -> Retry reconciles with 0 duplicate POSTs!
      const originalFirstSrc = await page.locator('.photo-grid img').first().getAttribute('src');
      let post3ECount = 0;
      let repCommittedReady!: () => void;
      const waitRepCommitted = new Promise<void>((r) => {
        repCommittedReady = r;
      });
      let releaseRepAbort!: () => void;
      const waitRepAbort = new Promise<void>((r) => {
        releaseRepAbort = r;
      });

      await page.route(`**/api/listings/${draft3.id}/photos*`, async (route) => {
        if (route.request().method() === 'POST') {
          post3ECount++;
          if (post3ECount === 1) {
            const serverRes = await route.fetch();
            expect(serverRes.status()).toBe(201);
            repCommittedReady();
            await waitRepAbort;
            await route.abort('connectionreset').catch(() => {});
            return;
          }
        }
        await route.continue();
      });

      await page.getByRole('button', { name: 'Replace photo', exact: true }).first().click();
      await page.getByLabel('Choose equipment photo').setInputFiles({
        name: 'cancel-replace-committed.jpg',
        mimeType: 'image/jpeg',
        buffer: smallJpeg1,
      });
      await expect(page.locator('.photo-queue-badge.is-ready')).toBeVisible({ timeout: 15_000 });
      await page.getByRole('button', { name: 'Replace photo', exact: true }).last().click();
      await waitRepCommitted;
      await page.getByRole('button', { name: 'Cancel upload for cancel-replace-committed.jpg' }).click();
      releaseRepAbort();

      await expect(page.locator('.photo-queue-badge.is-cancelled')).toBeVisible();
      await page.getByRole('button', { name: 'Retry', exact: true }).click();
      await expect(page.locator('.photo-queue-item')).toHaveCount(0, { timeout: 20_000 });
      expect(post3ECount).toBe(1); // Zero duplicate replacement POST!
      await expect(page.getByText('4 of 4 photos')).toBeVisible();
      const replacedFirstSrc = await page.locator('.photo-grid img').first().getAttribute('src');
      expect(replacedFirstSrc).not.toBe(originalFirstSrc);
      await page.unroute(`**/api/listings/${draft3.id}/photos*`);

      // 3F. Conflict gate & 429 Retry-After cooldown gate block individual Retry until satisfied!
      let post3FCount = 0;
      let mode3F: '409' | '429' | 'pass' = '409';
      await page.route(`**/api/listings/${draft3.id}/photos*`, async (route) => {
        if (route.request().method() === 'POST') {
          post3FCount++;
          if (mode3F === '409') {
            await route.fulfill({
              status: 409,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ error: 'conflict' }),
            });
            return;
          }
          if (mode3F === '429') {
            await route.fulfill({
              status: 429,
              headers: { 'Content-Type': 'application/json', 'Retry-After': '3' },
              body: JSON.stringify({ error: 'rateLimited' }),
            });
            return;
          }
        }
        await route.continue();
      });

      await page.getByRole('button', { name: 'Replace photo', exact: true }).first().click();
      await page.getByLabel('Choose equipment photo').setInputFiles({
        name: 'gate-check.jpg',
        mimeType: 'image/jpeg',
        buffer: smallJpeg2,
      });
      await expect(page.locator('.photo-queue-badge.is-ready')).toBeVisible({ timeout: 15_000 });
      await page.getByRole('button', { name: 'Replace photo', exact: true }).last().click();

      // After 409 conflict: Reload draft is shown AND individual Retry button is disabled!
      await expect(page.getByRole('button', { name: 'Reload draft', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeDisabled();
      expect(post3FCount).toBe(1);

      // Click Reload draft -> reconciles and returns item to ready; now test 429 Retry-After: 3s!
      mode3F = '429';
      await page.getByRole('button', { name: 'Reload draft', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Reload draft', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Replace photo', exact: true }).last().click();

      // During 3s cooldown: Retry button MUST be disabled!
      const retryCooldownBtn = page.getByRole('button', { name: 'Retry', exact: true });
      await expect(retryCooldownBtn).toBeDisabled();
      expect(post3FCount).toBe(2);

      // Once 3s cooldown elapses, Retry automatically unlocks and succeeds!
      mode3F = 'pass';
      await expect(retryCooldownBtn).toBeEnabled({ timeout: 8_000 });
      await retryCooldownBtn.click();
      await expect(page.locator('.photo-queue-item')).toHaveCount(0, { timeout: 20_000 });
      expect(post3FCount).toBe(3);
      await page.unroute(`**/api/listings/${draft3.id}/photos*`);

      // 2C. Arabic RTL 390px dark mobile visual & overflow check on Photo Manager + Open-Source Notices!
      if (info.project.name === 'desktop') {
        await page.setViewportSize({ width: 390, height: 900 });
        await page.goto('/en/about#open-source-notices');
        await expect(page.getByRole('heading', { name: 'Open-source software notices' })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

        await page.goto('/ar/about#open-source-notices');
        await expect(page.getByRole('heading', { name: 'إشعارات البرمجيات مفتوحة المصدر' })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

        await page.goto(`/ar/account/photos?listing=${draft1.id}`);
        await page.locator('.theme-switch input[value="dark"]').check();
        expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');

        // Detach 1 photo to have 3/4 + open slot, then select a photo to inspect Arabic dark mobile queue UI
        await page.getByRole('button', { name: 'إزالة الصورة رقم 4 من المسودة', exact: true }).click();
        await expect(page.getByText('3 من 4 صور')).toBeVisible({ timeout: 15_000 });
        await page.getByLabel('اختيار صور المعدات').setInputFiles({
          name: 'IMG_AR_TEST.HEIC',
          mimeType: '',
          buffer: realHeic,
        });
        await expect(page.locator('.photo-queue-badge.is-ready')).toBeVisible({ timeout: 25_000 });
        const overflowAr = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(overflowAr).toBeLessThanOrEqual(0);
        await page.screenshot({
          path: '.cache/media-opt-screenshots/queue-ready-390-ar-dark.png',
          fullPage: true,
        });

        await writeFile(
          '.cache/media-opt-screenshots/e2e-benchmarks.json',
          JSON.stringify(benchmarkRecords, null, 2),
        );
      }

      expect(pageErrors).toEqual([]);
    } finally {
      for (const lid of createdListings) {
        try {
          const cur = await rpc('get_my_listing', { p_listing_id: lid });
          if (['active', 'pending', 'reserved'].includes(cur.status)) {
            await rpc('withdraw_listing', { p_listing_id: lid, p_expected_version: cur.version });
          }
        } catch {
          /* Best-effort cleanup. */
        }
      }
    }
  });
});
