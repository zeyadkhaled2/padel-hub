// Safe, non-destructive hosted staging operations & verification runner.
// Never prints secrets, never resets databases, never targets localhost Supabase.
import { createHmac, randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { chromium } from '@playwright/test';
import {
  loadSmokeAdminState,
  loadStagingEnv,
  requireHostedStagingConfig,
  validateStagingDbUrl,
} from './staging-env.mjs';

const VALID_MODES = [
  'migrate',
  'migrate-dry-run',
  'repair-006',
  'setup-bucket',
  'serve',
  'prepare-smoke-admin',
  'smoke',
  'verify-revoked-admin',
];

const mode = process.argv[2];
if (!VALID_MODES.includes(mode)) {
  console.error(`Usage: node scripts/staging-app.mjs <${VALID_MODES.join('|')}>`);
  process.exit(1);
}

const rawEnv = loadStagingEnv();
const cfg = requireHostedStagingConfig(rawEnv);
const adminStatePath = resolve(process.cwd(), '.cache', 'staging-admin-smoke.json');

function runSupabaseCli(cliArgs) {
  // Use spawnSync and redact errors so DB credentials in CLI flags are never printed.
  const res = spawnSync(process.execPath, ['node_modules/supabase/dist/supabase.js', ...cliArgs], {
    stdio: 'inherit',
    windowsHide: true,
  });
  if (res.error) {
    console.error(`Supabase CLI failed to start: ${res.error.message}`);
    process.exit(1);
  }
  if (res.status !== 0) {
    console.error(`Supabase CLI exited with status ${res.status ?? 1}.`);
    process.exit(res.status ?? 1);
  }
}

function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = secret.replace(/[^A-Z2-7]/gi, '').toUpperCase();
  let bits = '';
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) continue;
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    (((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff)) %
    1_000_000;
  return String(code).padStart(6, '0');
}

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

async function ensurePrivateBucket(adminClient) {
  const bucket = await adminClient.storage.getBucket('media-private');
  if (!bucket.data) {
    const created = await adminClient.storage.createBucket('media-private', {
      public: false,
      fileSizeLimit: 8388608,
      allowedMimeTypes: ['image/webp'],
    });
    if (created.error) throw new Error(`Cannot create media-private bucket: ${created.error.message}`);
  } else {
    assert(bucket.data.public === false, 'media-private bucket MUST remain private (public=false)');
    assert(
      Number(bucket.data.file_size_limit) === 8388608,
      `media-private file_size_limit must be 8388608 (got ${bucket.data.file_size_limit})`,
    );
  }
  console.log('PASS: media-private bucket verified private (8 MiB, image/webp).');
}

async function makeSyntheticImage(r, g, b, withExif = false) {
  let pipeline = sharp({
    create: { width: 420, height: 320, channels: 3, background: { r, g, b } },
  });
  if (withExif) {
    pipeline = pipeline
      .withExif({ IFD0: { Make: 'PadelHubTestCam', ImageDescription: 'StripMeEXIF' } })
      .jpeg({ quality: 85 });
    return { bytes: await pipeline.toBuffer(), mime: 'image/jpeg' };
  }
  return { bytes: await pipeline.png().toBuffer(), mime: 'image/png' };
}

if (mode === 'migrate' || mode === 'migrate-dry-run' || mode === 'repair-006') {
  validateStagingDbUrl(cfg.dbUrl, cfg.projectRef);
  if (mode === 'repair-006') {
    runSupabaseCli(['migration', 'repair', `--remote=${cfg.dbUrl}`, '--status', 'applied', '20261117000600', '--yes']);
  } else if (mode === 'migrate-dry-run') {
    runSupabaseCli(['db', 'push', `--remote=${cfg.dbUrl}`, '--skip-vault', '--dry-run']);
  } else {
    runSupabaseCli(['db', 'push', `--remote=${cfg.dbUrl}`, '--skip-vault', '--yes']);
  }
} else {
  const serviceClient = createClient(cfg.supabaseUrl, cfg.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (mode === 'setup-bucket') {
    await ensurePrivateBucket(serviceClient);
  } else if (mode === 'serve') {
    await ensurePrivateBucket(serviceClient);
    const env = {
      ...process.env,
      PADELHUB_SUPABASE_URL: cfg.supabaseUrl,
      PADELHUB_SUPABASE_PUBLISHABLE_KEY: cfg.publishableKey,
      PADELHUB_SUPABASE_SERVICE_ROLE_KEY: cfg.serviceRoleKey,
      PADELHUB_APP_ORIGIN: cfg.appOrigin,
    };
    const port = new URL(cfg.appOrigin).port || '3100';
    const host = new URL(cfg.appOrigin).hostname || '127.0.0.1';
    const child = spawn(
      process.execPath,
      ['node_modules/next/dist/bin/next', 'start', '--hostname', host, '--port', port],
      { env, stdio: 'inherit', windowsHide: true },
    );
    child.on('exit', (code) => {
      process.exitCode = code ?? 1;
    });
  } else if (mode === 'prepare-smoke-admin') {
    const tag = randomBytes(4).toString('hex');
    const email = `staging_admin_${tag}@example.test`;
    const password = `AdminPass!${randomBytes(8).toString('hex')}`;
    const created = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error || !created.data.user) {
      throw new Error(`Failed creating synthetic staging admin: ${created.error?.message}`);
    }
    mkdirSync(resolve(process.cwd(), '.cache'), { recursive: true });
    writeFileSync(
      adminStatePath,
      JSON.stringify({ userId: created.data.user.id, email, password }),
      { mode: 0o600 },
    );
    // Print ONLY the non-secret userId so the DB operator can grant & revoke private.admin_roles.
    console.log(JSON.stringify({ userId: created.data.user.id }));
  } else if (mode === 'verify-revoked-admin') {
    const adminState = loadSmokeAdminState(adminStatePath);
    assert(
      Boolean(adminState.factorId && adminState.totpSecret && adminState.storageState),
      'Smoke admin state is missing MFA enrollment/browser session state; run full "node scripts/staging-app.mjs smoke" before verify-revoked-admin.',
    );
    let browser = null;
    try {
      // Verify at API level with fresh aal2 token (using enrolled TOTP secret)
      const client = createClient(cfg.supabaseUrl, cfg.publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const signIn = await client.auth.signInWithPassword({
        email: adminState.email,
        password: adminState.password,
      });
      assert(!signIn.error, `Admin re-login failed: ${signIn.error?.message}`);
      const elevated = await client.auth.mfa.challengeAndVerify({
        factorId: adminState.factorId,
        code: totp(adminState.totpSecret),
      });
      assert(!elevated.error, `Admin TOTP verification failed: ${elevated.error?.message}`);
      const access = await client.rpc('get_my_admin_access');
      assert(!access.error, `get_my_admin_access failed: ${access.error?.message}`);
      assert(access.data?.is_admin === false && access.data?.mfa_verified === false, 'Revoked admin must report is_admin=false');
      const queue = await client.rpc('admin_pending_listings', { p_page: 1 });
      assert(queue.error?.code === '42501', `Revoked admin pending queue must fail with 42501 (got ${queue.error?.code})`);

      // Verify in browser using the live aal2 session cookies saved prior to revocation
      browser = await chromium.launch({ channel: 'chrome', headless: true });
      const ctx = await browser.newContext({ storageState: adminState.storageState });
      const page = await ctx.newPage();
      const res = await page.goto(`${cfg.appOrigin}/en/admin`);
      assert(res?.status() === 404, `Revoked admin existing aal2 session /en/admin must return 404 (got ${res?.status()})`);
      await ctx.close();
      console.log('PASS: Immediate admin role revocation verified (API aal2 + live browser session immediately denied).');
      rmSync(adminStatePath, { force: true });
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  } else if (mode === 'smoke') {
    // Full staging smoke requires mandatory admin MFA verification; fail fast before mutating staging.
    const adminState = loadSmokeAdminState(adminStatePath);
    const tag = randomBytes(4).toString('hex');
    const appOrigin = cfg.appOrigin;
    const results = [];
    const pass = (name) => {
      results.push({ name, ok: true });
      console.log(`PASS: ${name}`);
    };

    const anonClient = createClient(cfg.supabaseUrl, cfg.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let seller1SessionClient = null;
    let createdListingId = null;
    let browser = null;
    let adminMfaVerified = false;

    try {
      // 1. Auth settings & bucket verification
      const settingsRes = await fetch(`${cfg.supabaseUrl}/auth/v1/settings`, {
        headers: { apikey: cfg.publishableKey },
      });
      assert(settingsRes.ok, `Auth settings HTTP ${settingsRes.status}`);
      const settings = await settingsRes.json();
      assert(settings.mailer_autoconfirm === false, 'mailer_autoconfirm must be false');
      assert(settings.external?.anonymous_users === false, 'anonymous_users must be false');
      assert(settings.external?.email === true, 'email provider must be enabled');
      pass('Auth settings: email confirmation enforced, anonymous sign-in disabled');

      await ensurePrivateBucket(serviceClient);
      pass('Storage bucket media-private verified private (8 MiB, image/webp)');

      // 2. Direct anonymous DB table & restricted RPC denial
      for (const table of ['seller_profiles', 'listings', 'platform_settings', 'media_assets', 'listing_media']) {
        const res = await anonClient.from(table).select('*').limit(1);
        assert(!!res.error, `Anonymous direct SELECT on public.${table} must be denied`);
      }
      for (const [fn, args] of [
        ['get_my_profile_bundle', {}],
        ['get_my_admin_access', {}],
        ['admin_pending_listings', { p_page: 1 }],
        ['get_listing_contact', { p_listing: '00000000-0000-4000-8000-000000000000' }],
        ['record_listing_metric', { p_listing: '00000000-0000-4000-8000-000000000000', p_kind: 'view' }],
      ]) {
        const res = await anonClient.rpc(fn, args);
        assert(!!res.error, `Anonymous call to ${fn} must be denied`);
      }
      pass('Direct anonymous table reads and restricted RPC calls all denied');

      // 3. Origin & callback security checks against live Next.js staging app
      const badAnalytics = await fetch(`${appOrigin}/api/analytics/listings/00000000-0000-4000-8000-000000000000`, {
        method: 'POST',
        headers: { origin: 'https://evil.example' },
      });
      assert(badAnalytics.status === 400, `Cross-origin analytics POST must return 400 (got ${badAnalytics.status})`);

      const badUpload = await fetch(`${appOrigin}/api/listings/00000000-0000-4000-8000-000000000000/photos`, {
        method: 'POST',
        headers: { origin: 'https://evil.example', 'x-listing-version': '1' },
        body: new Uint8Array([1, 2, 3]),
      });
      assert(badUpload.status === 403, `Cross-origin photo POST must return 403 (got ${badUpload.status})`);

      const badCallback = await fetch(`${appOrigin}/en/auth/callback?code=invalid&next=https://evil.example`, {
        redirect: 'manual',
      });
      assert(badCallback.status === 307 || badCallback.status === 302, `Callback must redirect (got ${badCallback.status})`);
      const loc = badCallback.headers.get('location') || '';
      assert(loc === `${appOrigin}/en/auth/signin?error=confirmation`, `Unsafe callback redirect: ${loc}`);
      assert((badCallback.headers.get('cache-control') || '').includes('no-store'), 'Callback must be no-store');
      assert(badCallback.headers.get('referrer-policy') === 'no-referrer', 'Callback must set Referrer-Policy: no-referrer');
      pass('Origin checks, callback open-redirect protection, and no-store headers verified');

      // 4. Homepage / Marketplace EN & AR + noindex + no secret leakage in HTML
      for (const path of ['/en', '/ar']) {
        const res = await fetch(`${appOrigin}${path}`);
        assert(res.ok, `GET ${path} failed with ${res.status}`);
        const html = await res.text();
        assert(html.includes('noindex'), `${path} must include noindex robots metadata`);
        assert(!html.includes(cfg.serviceRoleKey), `${path} HTML leaked service-role key!`);
        assert(!html.includes('sb_secret_'), `${path} HTML leaked sb_secret_ prefix!`);
      }
      pass('EN and AR homepage/marketplace render cleanly with noindex and zero secret leakage');

      // 5. Unverified user enforcement (Auth API + UI)
      const unverifiedEmail = `staging_unverified_${tag}@example.test`;
      const unverifiedPass = `UnvPass!${randomBytes(6).toString('hex')}`;
      const unvCreated = await serviceClient.auth.admin.createUser({
        email: unverifiedEmail,
        password: unverifiedPass,
        email_confirm: false,
      });
      assert(!unvCreated.error && unvCreated.data.user, `Create unverified user failed: ${unvCreated.error?.message}`);

      const unvSignIn = await anonClient.auth.signInWithPassword({
        email: unverifiedEmail,
        password: unverifiedPass,
      });
      assert(!!unvSignIn.error, 'Unverified user must NOT be able to sign in');
      pass('Unverified account rejected at Auth sign-in');

      // 6. Create synthetic verified Seller 1 and Seller 2
      const seller1Email = `staging_seller1_${tag}@example.test`;
      const seller1Pass = `Sell1Pass!${randomBytes(6).toString('hex')}`;
      const seller2Email = `staging_seller2_${tag}@example.test`;
      const seller2Pass = `Sell2Pass!${randomBytes(6).toString('hex')}`;

      const s1 = await serviceClient.auth.admin.createUser({
        email: seller1Email,
        password: seller1Pass,
        email_confirm: true,
      });
      assert(!s1.error && s1.data.user, `Create Seller 1 failed: ${s1.error?.message}`);

      const s2 = await serviceClient.auth.admin.createUser({
        email: seller2Email,
        password: seller2Pass,
        email_confirm: true,
      });
      assert(!s2.error && s2.data.user, `Create Seller 2 failed: ${s2.error?.message}`);

      // 7. Browser E2E against live Next.js + hosted Supabase (EN & AR, Desktop & Mobile)
      browser = await chromium.launch({ channel: 'chrome', headless: true });

      const sellerCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await sellerCtx.newPage();

      // Unverified login via UI stays on /en/auth/signin with error
      await page.goto(`${appOrigin}/en/auth/signin`);
      await page.getByLabel('Email address').fill(unverifiedEmail);
      await page.getByLabel('Password', { exact: true }).fill(unverifiedPass);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.waitForSelector('text=/Confirm your email|Invalid|incorrect/i', { timeout: 15_000 });
      assert(page.url().includes('/auth/signin'), 'Unverified UI sign-in must stay on /auth/signin');

      // Verified Seller 1 sign-in via UI + session persistence across reload
      await page.getByLabel('Email address').fill(seller1Email);
      await page.getByLabel('Password', { exact: true }).fill(seller1Pass);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.waitForURL('**/en/account', { timeout: 25_000 });
      const accountReload = await page.reload();
      assert(page.url().includes('/en/account'), 'Verified session must persist across reload');
      assert((accountReload?.headers()['cache-control'] || '').includes('no-store'), 'Private account route must be no-store');
      pass('Verified login, no-store headers, and session persistence verified in browser');

      // Create private profile -> verify private profile is 404 publicly
      const s1Username = `stg_s1_${tag}`;
      await page.getByLabel('Username', { exact: true }).fill(s1Username);
      await page.getByLabel('Display name').fill('Staging Smoke Seller');
      await page.getByLabel('Governorate').selectOption('cairo');
      await page.getByRole('button', { name: 'Create profile', exact: true }).click();
      await page.getByRole('heading', { name: 'Profile details' }).waitFor({ timeout: 20_000 });

      const privateProfileRes = await fetch(`${appOrigin}/en/@${s1Username}`);
      assert(privateProfileRes.status === 404, `Private profile must return 404 publicly (got ${privateProfileRes.status})`);

      // Enable public profile + WhatsApp consent
      await page.getByLabel('Allow my seller profile to be public').check();
      await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/account')),
        page.getByRole('button', { name: 'Save profile details', exact: true }).click(),
      ]);
      await page.getByRole('status').filter({ hasText: 'Saved successfully' }).waitFor({ timeout: 15_000 });

      await page.getByLabel('WhatsApp number (optional)').fill('+201000000051');
      await page.getByLabel(/I agree to let buyers/).check();
      await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/account')),
        page.getByRole('button', { name: 'Save contact preferences', exact: true }).click(),
      ]);
      await page.getByRole('status').filter({ hasText: 'Saved successfully' }).waitFor({ timeout: 15_000 });
      pass('Seller profile private-by-default isolation, public opt-in, and WhatsApp consent verified');

      // Create racket draft + save with optional racket specs
      const sessionCookies = (await sellerCtx.cookies()).filter((c) => /^sb-.*-auth-token(?:\.\d+)?$/.test(c.name));
      assert(sessionCookies.length > 0, 'Session auth cookies must exist');
      assert(
        sessionCookies.every((c) => c.httpOnly && c.sameSite === 'Lax'),
        'Session auth cookies must be httpOnly and SameSite=Lax',
      );

      await page.goto(`${appOrigin}/en/account/listings`);
      await page.locator('select[name="category"]').selectOption('rackets');
      await page.locator('form.account-form button[type="submit"], form.account-form button.primary').first().click();
      await page.waitForURL(/\/en\/account\/listings\/[0-9a-f-]{36}$/, { timeout: 25_000 });
      createdListingId = page.url().split('/').pop();

      const editorForm = page.locator('form.account-form');
      await editorForm.locator('[name="title"]').fill(`Staging Racket ${tag}`);
      await editorForm.locator('[name="brand_slug"]').selectOption('bullpadel');
      await editorForm.locator('[name="model"]').fill('Vertex 04 Staging');
      await editorForm.locator('[name="condition"]').selectOption('used');
      await editorForm.locator('[name="condition_disclosure"]').fill('Light court wear on frame');
      await editorForm.locator('[name="racket_damage_repair_disclosure"]').fill('No cracks or repairs');
      await editorForm.locator('[name="offer_type"]').selectOption('sale');
      await editorForm.locator('[name="price_egp"]').fill('6800');
      await editorForm.locator('[name="governorate_slug"]').selectOption('cairo');
      await editorForm.locator('[name="description"]').fill('Synthetic hosted staging verification racket listing.');
      await editorForm.locator('[name="racket_year"]').fill('2026');
      await editorForm.locator('[name="racket_weight_grams"]').fill('365');
      await editorForm.locator('[name="racket_shape"]').selectOption('teardrop');
      await page.getByRole('button', { name: 'Save draft', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Draft saved.' }).waitFor({ timeout: 20_000 });
      await page.reload();
      assert((await page.locator('input[name="racket_year"]').inputValue()) === '2026', 'racket_year persisted');
      assert((await page.locator('input[name="racket_weight_grams"]').inputValue()) === '365', 'racket_weight_grams persisted');
      assert((await page.locator('select[name="racket_shape"]').inputValue()) === 'teardrop', 'racket_shape persisted');
      pass('Racket draft creation, save, reload, and optional racket specs persisted on hosted staging');

      // Sign in Seller 1 & Seller 2 via supabase-js for direct RLS isolation & stale-version checks
      seller1SessionClient = createClient(cfg.supabaseUrl, cfg.publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const s1Auth = await seller1SessionClient.auth.signInWithPassword({ email: seller1Email, password: seller1Pass });
      assert(!s1Auth.error && s1Auth.data.session, 'Seller 1 API login succeeded');

      // Test token refresh works cleanly on hosted Auth
      const refreshed = await seller1SessionClient.auth.refreshSession({
        refresh_token: s1Auth.data.session.refresh_token,
      });
      assert(!refreshed.error && refreshed.data.session?.access_token, 'Hosted Auth refreshSession succeeded');

      const seller2Client = createClient(cfg.supabaseUrl, cfg.publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const s2Auth = await seller2Client.auth.signInWithPassword({ email: seller2Email, password: seller2Pass });
      assert(!s2Auth.error && s2Auth.data.session, 'Seller 2 API login succeeded');

      const crossRead = await seller2Client.rpc('get_my_listing', { p_listing_id: createdListingId });
      assert(!crossRead.error && crossRead.data === null, 'Seller 2 must not read Seller 1 listing');
      const crossWrite = await seller2Client.rpc('update_listing_draft', {
        p_listing_id: createdListingId,
        p_expected_version: 2,
        p_patch: { title: 'Hijack' },
      });
      assert(!!crossWrite.error, 'Seller 2 must not update Seller 1 listing');

      const staleEdit = await seller1SessionClient.rpc('update_listing_draft', {
        p_listing_id: createdListingId,
        p_expected_version: 1,
        p_patch: { title: 'Stale write' },
      });
      assert(staleEdit.error?.code === 'PT409', `Stale draft edit must fail with PT409 (got ${staleEdit.error?.code})`);
      pass('Session refresh, cross-account RLS isolation, and stale-version conflict (PT409) verified');

      // 8. Private Storage & Photo Pipeline Verification
      const img1 = await makeSyntheticImage(30, 120, 75, true); // JPEG with EXIF
      const img2 = await makeSyntheticImage(25, 80, 160, false);
      const img3 = await makeSyntheticImage(180, 90, 40, false);
      const imgReplace = await makeSyntheticImage(90, 40, 140, false);

      const s1Cookies = (await sellerCtx.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');

      const malformedRes = await fetch(`${appOrigin}/api/listings/${createdListingId}/photos`, {
        method: 'POST',
        headers: {
          origin: appOrigin,
          cookie: s1Cookies,
          'x-listing-version': '2',
          'content-type': 'image/png',
        },
        body: Buffer.from('not-an-image-at-all'),
      });
      assert(malformedRes.status === 400, `Malformed upload must return 400 (got ${malformedRes.status})`);

      const staleUploadRes = await fetch(`${appOrigin}/api/listings/${createdListingId}/photos`, {
        method: 'POST',
        headers: {
          origin: appOrigin,
          cookie: s1Cookies,
          'x-listing-version': '1',
          'content-type': img1.mime,
        },
        body: img1.bytes,
      });
      assert(staleUploadRes.status === 409, `Stale photo upload must return 409 (got ${staleUploadRes.status})`);

      const oversizedRes = await fetch(`${appOrigin}/api/listings/${createdListingId}/photos`, {
        method: 'POST',
        headers: {
          origin: appOrigin,
          cookie: s1Cookies,
          'x-listing-version': '2',
          'content-type': 'image/png',
        },
        body: Buffer.alloc(8 * 1024 * 1024 + 1),
      });
      assert(oversizedRes.status === 413, `Oversized >8MiB photo upload must return 413 (got ${oversizedRes.status})`);

      let version = 2;
      const uploadedIds = [];
      for (const img of [img1, img2]) {
        const up = await fetch(`${appOrigin}/api/listings/${createdListingId}/photos`, {
          method: 'POST',
          headers: {
            origin: appOrigin,
            cookie: s1Cookies,
            'x-listing-version': String(version),
            'content-type': img.mime,
          },
          body: img.bytes,
        });
        if (up.status !== 201) {
          throw new Error(`Photo upload failed with ${up.status}: ${await up.text()}`);
        }
        const saved = await up.json();
        uploadedIds.push(saved.id);
        version = saved.version;
      }

      // Concurrent upload race on the same expected version: exactly one 201 and one 409 conflict!
      const raceResponses = await Promise.all([0, 1].map(() =>
        fetch(`${appOrigin}/api/listings/${createdListingId}/photos`, {
          method: 'POST',
          headers: {
            origin: appOrigin,
            cookie: s1Cookies,
            'x-listing-version': String(version),
            'content-type': img3.mime,
          },
          body: img3.bytes,
        }),
      ));
      const raceStatuses = raceResponses.map((r) => r.status).sort((a, b) => a - b);
      assert(raceStatuses[0] === 201 && raceStatuses[1] === 409, `Upload race must yield [201, 409] (got ${JSON.stringify(raceStatuses)})`);
      const raceWinner = raceResponses.find((r) => r.status === 201);
      const raceSaved = await raceWinner.json();
      uploadedIds.push(raceSaved.id);
      version = raceSaved.version;

      const replacedId = uploadedIds[0];
      const rep = await fetch(`${appOrigin}/api/listings/${createdListingId}/photos`, {
        method: 'POST',
        headers: {
          origin: appOrigin,
          cookie: s1Cookies,
          'x-listing-version': String(version),
          'x-replace-photo': replacedId,
          'content-type': imgReplace.mime,
        },
        body: imgReplace.bytes,
      });
      assert(rep.status === 201, `Photo replace failed with ${rep.status}`);
      const repData = await rep.json();
      const activePhotoId = repData.id;
      assert(activePhotoId !== replacedId, 'Replacement must create a new immutable asset ID');

      // Owner preview download: hash-verified WebP + EXIF stripped + private no-store + Range rejected
      const ownerPhotoRes = await fetch(`${appOrigin}/api/media/${activePhotoId}?variant=full`, {
        headers: { cookie: s1Cookies },
      });
      assert(ownerPhotoRes.status === 200, `Owner photo preview failed (${ownerPhotoRes.status})`);
      assert(ownerPhotoRes.headers.get('content-type') === 'image/webp', 'Delivered photo must be image/webp');
      assert((ownerPhotoRes.headers.get('cache-control') || '').includes('no-store'), 'Photo must be no-store');
      const meta = await sharp(Buffer.from(await ownerPhotoRes.arrayBuffer())).metadata();
      assert(meta.format === 'webp' && !meta.exif, 'Processed photo must be WebP with EXIF stripped');

      // Verify EXIF from replaced JPEG (retained privately) was stripped
      const oldPhotoRes = await fetch(`${appOrigin}/api/media/${replacedId}?variant=full`, {
        headers: { cookie: s1Cookies },
      });
      assert(oldPhotoRes.status === 200, 'Owner still has private access to retained replaced photo');
      const oldMeta = await sharp(Buffer.from(await oldPhotoRes.arrayBuffer())).metadata();
      assert(oldMeta.format === 'webp' && !oldMeta.exif, 'EXIF from uploaded JPEG must be stripped');

      const rangeRes = await fetch(`${appOrigin}/api/media/${activePhotoId}?variant=card`, {
        headers: { cookie: s1Cookies, range: 'bytes=0-10' },
      });
      assert(rangeRes.status === 416, `Range request must return 416 (got ${rangeRes.status})`);

      const anonPhotoRes = await fetch(`${appOrigin}/api/media/${activePhotoId}?listing=${createdListingId}`);
      assert(anonPhotoRes.status === 404, `Anonymous access to draft photo must return 404 (got ${anonPhotoRes.status})`);

      // Direct hosted Supabase Storage URL must NOT be publicly or cross-user accessible!
      const { data: manifestData } = await serviceClient.rpc('get_photo_delivery', {
        p_asset: activePhotoId,
        p_viewer: s1.data.user.id,
        p_listing: createdListingId,
      });
      assert(manifestData?.card?.key, 'Service manifest lookup must return card key');
      const directPublic = await fetch(`${cfg.supabaseUrl}/storage/v1/object/public/media-private/${manifestData.card.key}`);
      assert(!directPublic.ok, `Direct public Storage URL MUST fail (got ${directPublic.status})`);
      const directOtherAuth = await fetch(
        `${cfg.supabaseUrl}/storage/v1/object/authenticated/media-private/${manifestData.card.key}`,
        {
          headers: {
            apikey: cfg.publishableKey,
            Authorization: `Bearer ${s2Auth.data.session.access_token}`,
          },
        },
      );
      assert(!directOtherAuth.ok, `Direct cross-user Storage URL MUST fail (got ${directOtherAuth.status})`);
      pass('Private Storage upload, WebP/EXIF strip, replacement, hash-verified delivery, and direct Storage blocks verified');

      // 9. Submit listing for manual approval
      await page.goto(`${appOrigin}/en/account/listings/${createdListingId}`);
      await page.getByRole('button', { name: 'Submit for approval', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Submitted.' }).waitFor({ timeout: 20_000 });
      const submitted = await seller1SessionClient.rpc('get_my_listing', { p_listing_id: createdListingId });
      assert(submitted.data?.status === 'pending', `Expected pending status, got ${submitted.data?.status}`);
      pass('Listing submitted to pending moderation queue on hosted staging');

      // Verify Seller 2 (mobile Arabic) cannot access /en/admin (404) or Seller 1 pending photo (404)
      const s2Ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const s2Page = await s2Ctx.newPage();
      await s2Page.goto(`${appOrigin}/ar/auth/signin`);
      await s2Page.locator('form.account-form input[name="email"]').fill(seller2Email);
      await s2Page.locator('form.account-form input[name="password"]').fill(seller2Pass);
      await s2Page.locator('form.account-form button.primary').first().click();
      await s2Page.waitForURL('**/ar/account', { timeout: 25_000 });
      const s2AdminRes = await s2Page.goto(`${appOrigin}/en/admin`);
      assert(s2AdminRes?.status() === 404, `Non-admin /en/admin must return 404 (got ${s2AdminRes?.status()})`);

      const s2Cookies = (await s2Ctx.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
      const s2PhotoRes = await fetch(`${appOrigin}/api/media/${activePhotoId}?listing=${createdListingId}`, {
        headers: { cookie: s2Cookies },
      });
      assert(s2PhotoRes.status === 404, `Cross-account pending photo must return 404 (got ${s2PhotoRes.status})`);
      pass('Non-admin denial and cross-account pending photo denial verified');

      // 10. Mandatory MFA Admin Review, Rejection, Resubmission, Approval, Public Visibility, WhatsApp & Reports
      const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const adminPage = await adminCtx.newPage();

      await adminPage.goto(`${appOrigin}/en/auth/signin`);
      await adminPage.getByLabel('Email address').fill(adminState.email);
      await adminPage.getByLabel('Password', { exact: true }).fill(adminState.password);
      await adminPage.getByRole('button', { name: 'Sign in', exact: true }).click();
      await adminPage.waitForURL('**/en/account', { timeout: 25_000 });

      // At aal1, admin photo proxy must fail closed (never 200, never image bytes)
      const aal1Cookies = (await adminCtx.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
      const aal1Photo = await fetch(`${appOrigin}/api/admin/listings/${createdListingId}/photos/${activePhotoId}`, {
        headers: { cookie: aal1Cookies },
      });
      assert(
        aal1Photo.status !== 200 && aal1Photo.headers.get('content-type') !== 'image/webp',
        `Admin photo proxy at aal1 must fail closed (got ${aal1Photo.status})`,
      );

      // Enroll TOTP MFA on /en/admin
      const adminGateRes = await adminPage.goto(`${appOrigin}/en/admin`);
      assert(
        adminGateRes?.status() === 200,
        `Smoke admin /en/admin returned ${adminGateRes?.status()} — confirm userId ${adminState.userId} is granted in private.admin_roles before running smoke.`,
      );
      await adminPage.locator('button[name="intent"][value="enroll"]').click();
      const secretEl = adminPage.locator('[data-testid="mfa-secret"]');
      await secretEl.waitFor({ timeout: 20_000 });
      const totpSecret = (await secretEl.innerText()).trim();
      const factorId = await adminPage.locator('input[name="factor"]').inputValue();
      assert(totpSecret.length >= 16 && factorId, 'TOTP enrollment must produce a factor and setup secret');
      await adminPage.locator('input[name="code"]').fill(totp(totpSecret));
      await adminPage.locator('button[name="intent"][value="verify"]').click();
      await adminPage.locator(`a[href*="/admin/listings/${createdListingId}"]`).waitFor({ timeout: 25_000 });
      pass('Admin TOTP MFA enrollment and aal2 elevation verified on hosted staging');

      // Persist aal2 storage state & TOTP secret ONLY inside gitignored .cache for immediate-revocation verification
      adminState.factorId = factorId;
      adminState.totpSecret = totpSecret;
      adminState.storageState = await adminCtx.storageState();
      writeFileSync(adminStatePath, JSON.stringify(adminState), { mode: 0o600 });

      // Open review page (EN), verify admin photo proxy works at aal2
      await adminPage.goto(`${appOrigin}/en/admin/listings/${createdListingId}`);
      await adminPage.getByText('Vertex 04 Staging').waitFor({ timeout: 15_000 });
      const aal2Cookies = (await adminCtx.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
      const aal2Photo = await fetch(`${appOrigin}/api/admin/listings/${createdListingId}/photos/${activePhotoId}`, {
        headers: { cookie: aal2Cookies },
      });
      assert(
        aal2Photo.status === 200 && aal2Photo.headers.get('content-type') === 'image/webp',
        `Admin photo proxy at aal2 must return 200 webp (got ${aal2Photo.status})`,
      );

      // Reject once -> confirm owner sees rejection reason -> resubmit -> approve in Arabic review UI
      await adminPage.locator('textarea[name="reason"]').fill('Staging smoke rejection check');
      await adminPage.locator('button[name="intent"][value="reject"]').click();
      await adminPage.waitForURL('**/en/admin?done=reject', { timeout: 25_000 });

      await page.goto(`${appOrigin}/en/account/listings/${createdListingId}`);
      await page.getByText('Staging smoke rejection check').waitFor({ timeout: 15_000 });
      await page.getByRole('button', { name: 'Submit for approval', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Submitted.' }).waitFor({ timeout: 20_000 });

      await adminPage.goto(`${appOrigin}/ar/admin/listings/${createdListingId}`);
      await adminPage.getByText('دمعة').waitFor({ timeout: 15_000 });
      await adminPage.locator('button[name="intent"][value="approve"]').click();
      await adminPage.waitForURL('**/ar/admin?done=approve', { timeout: 25_000 });
      pass('MFA-admin review (EN/AR), photo proxy, rejection reason, resubmission, and approval verified');

      // Public marketplace visibility (EN desktop + AR 390px mobile overflow check) + public photo + WhatsApp redirect
      const anonCtxDesktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const anonDesktop = await anonCtxDesktop.newPage();
      await anonDesktop.goto(`${appOrigin}/en/equipment/${createdListingId}`);
      await anonDesktop.getByText(`Staging Racket ${tag}`).waitFor({ timeout: 15_000 });
      await anonDesktop.getByText('Teardrop').waitFor({ timeout: 15_000 });

      const anonCtxMobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const anonMobile = await anonCtxMobile.newPage();
      await anonMobile.goto(`${appOrigin}/ar/equipment/${createdListingId}`);
      await anonMobile.getByText(`Staging Racket ${tag}`).waitFor({ timeout: 15_000 });
      await anonMobile.getByText('دمعة').waitFor({ timeout: 15_000 });
      const arOverflow = await anonMobile.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      assert(arOverflow <= 1, `Arabic mobile 390px horizontal overflow detected: ${arOverflow}px`);

      const publicPhotoRes = await fetch(`${appOrigin}/api/media/${activePhotoId}?listing=${createdListingId}&variant=card`);
      assert(
        publicPhotoRes.status === 200 && publicPhotoRes.headers.get('content-type') === 'image/webp',
        `Approved public photo must return 200 webp (got ${publicPhotoRes.status})`,
      );

      const waRes = await fetch(`${appOrigin}/api/contact/${createdListingId}?locale=en`, { redirect: 'manual' });
      assert(waRes.status === 302, `WhatsApp contact must return 302 (got ${waRes.status})`);
      const waLoc = waRes.headers.get('location') || '';
      assert(waLoc.startsWith('https://wa.me/201000000051?text='), `Unexpected WhatsApp location: ${waLoc}`);
      assert((waRes.headers.get('cache-control') || '').includes('no-store'), 'WhatsApp redirect must be no-store');
      pass('Public approved listing (EN desktop & AR 390px mobile), approved photo delivery, and WhatsApp redirect verified');

      // Abuse report submission (Seller 2) & MFA-admin dismissal
      const repRpc = await seller2Client.rpc('report_content', {
        p_type: 'listing',
        p_target: createdListingId,
        p_reason: 'other',
        p_details: `Staging smoke report ${tag}`,
      });
      assert(!repRpc.error, `Abuse report submission failed: ${repRpc.error?.message}`);

      await adminPage.goto(`${appOrigin}/en/admin/reports`);
      await adminPage.getByText(`Staging smoke report ${tag}`).waitFor({ timeout: 15_000 });
      const reportSection = adminPage.locator('section.disclosure', { hasText: `Staging smoke report ${tag}` }).first();
      await reportSection.locator('textarea[name="details"]').fill('Dismissed synthetic staging smoke report');
      await reportSection.locator('button[name="intent"][value="dismiss"]').click();
      await adminPage.waitForURL('**/en/admin/reports?done=1', { timeout: 25_000 });
      pass('Abuse report submission and MFA-admin dismissal verified on hosted staging');

      // Withdraw listing -> verify revoked public listing immediately blocks detail, contact, and photo
      const latest = await seller1SessionClient.rpc('get_my_listing', { p_listing_id: createdListingId });
      const withdraw = await seller1SessionClient.rpc('withdraw_listing', {
        p_listing_id: createdListingId,
        p_expected_version: latest.data.version,
      });
      assert(!withdraw.error && withdraw.data?.status === 'draft', 'Seller withdrawal to draft succeeded');
      const withdrawnId = createdListingId;
      createdListingId = null;

      const revokedDetail = await fetch(`${appOrigin}/en/equipment/${withdrawnId}`);
      assert(revokedDetail.status === 404, `Withdrawn listing detail must return 404 (got ${revokedDetail.status})`);
      const revokedContact = await fetch(`${appOrigin}/api/contact/${withdrawnId}`, { redirect: 'manual' });
      assert(revokedContact.status === 404, `Withdrawn listing WhatsApp must return 404 (got ${revokedContact.status})`);
      const revokedPhoto = await fetch(`${appOrigin}/api/media/${activePhotoId}?listing=${withdrawnId}&variant=card`);
      assert(revokedPhoto.status === 404, `Withdrawn listing public photo must return 404 (got ${revokedPhoto.status})`);
      pass('Revoked public listing immediately blocks detail, contact, and public photo access');

      await anonCtxDesktop.close();
      await anonCtxMobile.close();
      await adminCtx.close();
      adminMfaVerified = true;

      // 11. Logout & session invalidation in browser
      await page.goto(`${appOrigin}/en/account`);
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await page.waitForURL('**/en/auth/signin', { timeout: 20_000 });
      await page.goto(`${appOrigin}/en/account`);
      await page.waitForURL('**/en/auth/signin', { timeout: 20_000 });
      pass('Logout and session invalidation verified in browser');

      assert(adminMfaVerified, 'Admin MFA verification is mandatory for staging smoke');
      await s2Ctx.close();
      await sellerCtx.close();
      console.log(`\nALL STAGING SMOKE CHECKS PASSED (${results.length} passed, 0 failed).`);
    } finally {
      if (browser) await browser.close().catch(() => {});
      if (createdListingId && seller1SessionClient) {
        try {
          const cur = await seller1SessionClient.rpc('get_my_listing', { p_listing_id: createdListingId });
          if (cur.data && ['pending', 'active'].includes(cur.data.status)) {
            await seller1SessionClient.rpc('withdraw_listing', {
              p_listing_id: createdListingId,
              p_expected_version: cur.data.version,
            });
          }
        } catch {
          // Best-effort cleanup
        }
      }
    }
  }
}
