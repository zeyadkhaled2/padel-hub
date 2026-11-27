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
  APPROVED_STAGING_PROJECT_REF,
  SUPERSEDED_HOSTED_MIGRATION_VERSION,
  loadSmokeAdminState,
  loadStagingEnv,
  requireHostedStagingConfig,
  requireMigrationRepairConfirmation,
  validateStagingDbUrl,
} from './staging-env.mjs';

const VALID_MODES = [
  'migrate',
  'migrate-dry-run',
  'repair-006',
  'auth-status',
  'setup-bucket',
  'serve',
  'prepare-smoke-admin',
  'smoke',
  'smoke-phase2b',
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
  validateStagingDbUrl(cfg.dbUrl, APPROVED_STAGING_PROJECT_REF);
  if (mode === 'repair-006') {
    requireMigrationRepairConfirmation(
      process.argv.slice(3),
      APPROVED_STAGING_PROJECT_REF,
      SUPERSEDED_HOSTED_MIGRATION_VERSION,
    );
    runSupabaseCli([
      'migration',
      'repair',
      `--remote=${cfg.dbUrl}`,
      '--status',
      'applied',
      SUPERSEDED_HOSTED_MIGRATION_VERSION,
      '--yes',
    ]);
  } else if (mode === 'migrate-dry-run') {
    runSupabaseCli(['db', 'push', `--remote=${cfg.dbUrl}`, '--skip-vault', '--dry-run']);
  } else {
    runSupabaseCli(['db', 'push', `--remote=${cfg.dbUrl}`, '--skip-vault', '--yes']);
  }
} else {
  const serviceClient = createClient(cfg.supabaseUrl, cfg.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (mode === 'auth-status') {
    const settingsRes = await fetch(`${cfg.supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: cfg.publishableKey },
    });
    assert(settingsRes.ok, `Auth settings HTTP ${settingsRes.status}`);
    const settings = await settingsRes.json();
    console.log(
      JSON.stringify({
        projectRef: cfg.projectRef,
        disable_signup: settings.disable_signup,
        mailer_autoconfirm: settings.mailer_autoconfirm,
        email_enabled: settings.external?.email === true,
        google_enabled: settings.external?.google === true,
        anonymous_users: settings.external?.anonymous_users === true,
      }),
    );
  } else if (mode === 'setup-bucket') {
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

      // 4. Homepage / Marketplace & Legal pages EN & AR + noindex + security headers + no secret leakage in HTML
      for (const path of ['/en', '/ar', '/en/privacy', '/ar/privacy', '/en/terms', '/ar/terms']) {
        const res = await fetch(`${appOrigin}${path}`);
        assert(res.ok, `GET ${path} failed with ${res.status}`);
        assert(res.headers.get('x-content-type-options') === 'nosniff', `${path} missing X-Content-Type-Options: nosniff`);
        assert(res.headers.get('x-frame-options') === 'DENY', `${path} missing X-Frame-Options: DENY`);
        const html = await res.text();
        assert(html.includes('noindex'), `${path} must include noindex robots metadata`);
        assert(!html.includes(cfg.serviceRoleKey), `${path} HTML leaked service-role key!`);
        assert(!html.includes('sb_secret_'), `${path} HTML leaked sb_secret_ prefix!`);
      }
      pass('EN and AR homepage, privacy, and terms render cleanly with security headers, noindex, and zero secret leakage');

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
      await page.getByRole('button', { name: 'Create listing', exact: true }).click();
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
        body: Buffer.alloc(4_000_001),
      });
      assert(oversizedRes.status === 413, `Oversized >4MB photo upload must return 413 (got ${oversizedRes.status})`);

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

      // Verify 2-photo draft is blocked from submission under uniform 3-4 photo rule
      const underMinSubmit = await seller1SessionClient.rpc('submit_listing', {
        p_listing_id: createdListingId,
        p_expected_version: version,
      });
      assert(
        underMinSubmit.error?.code === '23514',
        `Submitting with 2 photos must fail with 23514 (got ${underMinSubmit.error?.code})`,
      );

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

      // Upload 4th photo -> succeeds; 5th photo -> rejected with 409 photoLimit; detach 4th photo via UI -> preserves Storage object
      const img4 = await makeSyntheticImage(160, 60, 90, false);
      const up4 = await fetch(`${appOrigin}/api/listings/${createdListingId}/photos`, {
        method: 'POST',
        headers: {
          origin: appOrigin,
          cookie: s1Cookies,
          'x-listing-version': String(version),
          'content-type': img4.mime,
        },
        body: img4.bytes,
      });
      assert(up4.status === 201, `4th photo upload must succeed with 201 (got ${up4.status})`);
      const saved4 = await up4.json();
      version = saved4.version;

      const up5 = await fetch(`${appOrigin}/api/listings/${createdListingId}/photos`, {
        method: 'POST',
        headers: {
          origin: appOrigin,
          cookie: s1Cookies,
          'x-listing-version': String(version),
          'content-type': img4.mime,
        },
        body: img4.bytes,
      });
      assert(up5.status === 409, `5th photo upload must be rejected with 409 (got ${up5.status})`);
      const err5 = await up5.json();
      assert(err5.error === 'photoLimit', `5th photo error must be photoLimit (got ${err5.error})`);

      // Detach 4th photo safely through Photo Manager UI -> count drops 4 -> 3, Storage object remains privately accessible (200)
      await page.goto(`${appOrigin}/en/account/photos?listing=${createdListingId}`);
      await page.getByText('4 of 4 photos').waitFor({ timeout: 15_000 });
      await page.getByRole('button', { name: 'Remove photo 4 from draft', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Photo removed from this draft.' }).waitFor({ timeout: 20_000 });
      await page.getByText('3 of 4 photos').waitFor({ timeout: 15_000 });
      const detachedPrivateRes = await fetch(`${appOrigin}/api/media/${saved4.id}?variant=full`, {
        headers: { cookie: s1Cookies },
      });
      assert(detachedPrivateRes.status === 200, `Detached photo must remain preserved privately for owner (got ${detachedPrivateRes.status})`);
      const detachedAnonRes = await fetch(`${appOrigin}/api/media/${saved4.id}?listing=${createdListingId}`);
      assert(detachedAnonRes.status === 404, `Detached photo must not be publicly accessible (got ${detachedAnonRes.status})`);
      const afterDetach = await seller1SessionClient.rpc('get_my_listing', { p_listing_id: createdListingId });
      assert(afterDetach.data?.media_ids?.length === 3, `Expected 3 attached photos after detach, got ${afterDetach.data?.media_ids?.length}`);
      version = afterDetach.data.version;
      pass('Uniform 3-4 photo limits, 5th photo rejection (409), and safe UI photo detachment preserving Storage verified on hosted staging');

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
      assert((ownerPhotoRes.headers.get('cache-control') || '').includes('no-store'), 'Private owner photo must be no-store');
      assert(!ownerPhotoRes.headers.get('etag'), 'Private owner photo must not expose a cacheable ETag');
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

      // At aal1, admin photo proxy must fail closed with 404 (never 200 or 503, never image bytes)
      const aal1Cookies = (await adminCtx.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
      const aal1Photo = await fetch(`${appOrigin}/api/admin/listings/${createdListingId}/photos/${activePhotoId}`, {
        headers: { cookie: aal1Cookies },
      });
      assert(
        aal1Photo.status === 404 && aal1Photo.headers.get('content-type') !== 'image/webp',
        `Admin photo proxy at aal1 must return 404 (got ${aal1Photo.status})`,
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

      // Verify Admin A overview dashboard sections, 11 live DB KPIs, sidebar nav & privacy on hosted staging
      for (const headingName of [
        'Admin overview',
        'Needs attention',
        'Marketplace overview',
        'Marketplace trends',
        'Review listings',
        'Recent activity',
      ]) {
        await adminPage.getByRole('heading', { name: headingName }).waitFor({ timeout: 15_000 });
      }
      const mainAlertCount = await adminPage.locator('main [role="alert"]').count();
      assert(
        mainAlertCount === 0,
        `Admin overview rendered ${mainAlertCount} unexpected alert(s) on hosted staging`,
      );
      const adminOverviewHtml = await adminPage.content();
      assert(!adminOverviewHtml.includes('+201000000051'), 'Admin overview must never leak seller WhatsApp numbers');
      assert(
        !adminOverviewHtml.includes(`processed/${activePhotoId}/`),
        'Admin overview must never leak private storage keys',
      );
      for (const kpiLabel of [
        'Total seller profiles',
        'Active sellers',
        'Suspended sellers',
        'Total listings',
        'Active listings',
        'Pending listings',
        'Rejected listings',
        'Sold or traded (seller-reported)',
        'Open reports',
        'Approximate views',
        'WhatsApp clicks',
      ]) {
        await adminPage.locator('.admin-kpi-card .admin-kpi-label', { hasText: kpiLabel }).first().waitFor({ timeout: 10_000 });
      }
      const adminNav = adminPage.getByRole('navigation', { name: 'Admin navigation' });
      const plannedCount = await adminNav.locator('.admin-nav-planned').count();
      const plannedLinks = await adminNav.locator('.admin-nav-planned a').count();
      assert(plannedCount === 4 && plannedLinks === 0, `Expected 4 non-link planned nav items (Admin D-F), got ${plannedCount} (${plannedLinks} links)`);
      pass('Admin A overview dashboard KPIs, Needs Attention, Trends, Recent Activity, nav shell and privacy verified on hosted staging (EN)');

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
      await adminPage.waitForURL('**/en/admin/listings?done=1', { timeout: 25_000 });

      // Verify enriched Seller Dashboard (EN desktop + AR 390px mobile) displays rejection reason and zero overflow
      await page.goto(`${appOrigin}/en/account/listings`);
      await page.getByText('Staging smoke rejection check').waitFor({ timeout: 15_000 });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${appOrigin}/ar/account/listings`);
      await page.getByText('Staging smoke rejection check').waitFor({ timeout: 15_000 });
      const sellerDashArOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      assert(sellerDashArOverflow <= 1, `Arabic mobile 390px /ar/account/listings overflow: ${sellerDashArOverflow}px`);
      await page.setViewportSize({ width: 1280, height: 800 });

      await page.goto(`${appOrigin}/en/account/listings/${createdListingId}`);
      await page.getByText('Staging smoke rejection check').waitFor({ timeout: 15_000 });
      await page.getByRole('button', { name: 'Submit for approval', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Submitted.' }).waitFor({ timeout: 20_000 });

      await adminPage.goto(`${appOrigin}/ar/admin/listings/${createdListingId}`);
      await adminPage.getByText('دمعة').waitFor({ timeout: 15_000 });
      await adminPage.locator('button[name="intent"][value="approve"]').click();
      await adminPage.waitForURL('**/ar/admin/listings?done=1', { timeout: 25_000 });
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
      const publicCacheControl = publicPhotoRes.headers.get('cache-control') || '';
      const publicEtag = publicPhotoRes.headers.get('etag') || '';
      assert(
        publicCacheControl === 'private, no-cache',
        `Approved public photo must use private, no-cache (got "${publicCacheControl}")`,
      );
      assert(/^"[a-f0-9]{64}"$/.test(publicEtag), `Approved public photo must emit SHA-256 ETag (got "${publicEtag}")`);

      const conditionalGet = await fetch(`${appOrigin}/api/media/${activePhotoId}?listing=${createdListingId}&variant=card`, {
        headers: { 'if-none-match': publicEtag },
      });
      assert(conditionalGet.status === 304, `Matching If-None-Match on approved photo must return 304 (got ${conditionalGet.status})`);
      assert(conditionalGet.headers.get('etag') === publicEtag, '304 must echo matching ETag');

      const conditionalHead = await fetch(`${appOrigin}/api/media/${activePhotoId}?listing=${createdListingId}&variant=card`, {
        method: 'HEAD',
        headers: { 'if-none-match': publicEtag },
      });
      assert(conditionalHead.status === 304, `Matching If-None-Match HEAD must return 304 (got ${conditionalHead.status})`);

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

      // Verify Admin A overview in Arabic RTL mobile (390px) with live post-moderation audit entries & zero overflow
      await adminPage.setViewportSize({ width: 390, height: 844 });
      await adminPage.goto(`${appOrigin}/ar/admin`);
      await adminPage.getByRole('heading', { name: 'نظرة عامة على الإدارة' }).waitFor({ timeout: 15_000 });
      const arActivityText = await adminPage.getByRole('region', { name: 'النشاط الأخير' }).getByRole('list').innerText();
      assert(
        arActivityText.includes('رفض البلاغ') || arActivityText.includes('وافق على الإعلان'),
        `Arabic recent activity feed did not show live moderation entries: ${arActivityText.slice(0, 120)}`,
      );
      const adminArDir = await adminPage.evaluate(() => document.documentElement.dir);
      const adminArOverflow = await adminPage.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      assert(adminArDir === 'rtl', `Expected Arabic admin dir="rtl", got "${adminArDir}"`);
      assert(adminArOverflow <= 1, `Arabic mobile 390px /ar/admin horizontal overflow detected: ${adminArOverflow}px`);
      await adminPage.setViewportSize({ width: 1280, height: 800 });
      pass('Admin A Arabic RTL 390px mobile overview and live moderation activity feed verified on hosted staging');

      // Verify Admin B listing inventory & Admin C seller management on hosted staging
      await adminPage.goto(`${appOrigin}/en/admin/listings?q=${encodeURIComponent(tag)}`);
      await adminPage.getByText(`Staging Racket ${tag}`).waitFor({ timeout: 15_000 });
      await adminPage.goto(`${appOrigin}/en/admin/sellers?q=${encodeURIComponent(s1Username)}`);
      await adminPage.getByText(`@${s1Username}`).waitFor({ timeout: 15_000 });
      await adminPage.locator('a[href*="/admin/sellers/"]').first().click();
      await adminPage.waitForURL(/\/en\/admin\/sellers\/[0-9a-f-]{36}(?:\?.*)?$/, { timeout: 15_000 });
      await adminPage.getByText('Staging Smoke Seller').waitFor({ timeout: 15_000 });
      pass('Admin B listing inventory and Admin C seller management verified on hosted staging');

      // Mark approved listing sold, then verify 'reopen' transitions sold -> private draft cleanly (retaining photos & revoking public access)
      const latest = await seller1SessionClient.rpc('get_my_listing', { p_listing_id: createdListingId });
      const markedSold = await seller1SessionClient.rpc('change_listing_status', {
        p_listing_id: createdListingId,
        p_expected_version: latest.data.version,
        p_action: 'sold',
      });
      assert(!markedSold.error && markedSold.data?.status === 'sold', 'Marking approved listing sold succeeded');
      const reopened = await seller1SessionClient.rpc('change_listing_status', {
        p_listing_id: createdListingId,
        p_expected_version: markedSold.data.version,
        p_action: 'reopen',
      });
      assert(!reopened.error && reopened.data?.status === 'draft', 'Reopening sold listing to private draft succeeded');
      assert(reopened.data?.media_ids?.length === 3, 'Reopened listing retained all 3 attached photos');
      const withdrawnId = createdListingId;
      createdListingId = null;

      const revokedDetail = await fetch(`${appOrigin}/en/equipment/${withdrawnId}`);
      assert(revokedDetail.status === 404, `Reopened draft detail must return 404 (got ${revokedDetail.status})`);
      const revokedContact = await fetch(`${appOrigin}/api/contact/${withdrawnId}`, { redirect: 'manual' });
      assert(revokedContact.status === 404, `Reopened draft WhatsApp must return 404 (got ${revokedContact.status})`);
      const revokedPhoto = await fetch(`${appOrigin}/api/media/${activePhotoId}?listing=${withdrawnId}&variant=card`);
      assert(revokedPhoto.status === 404, `Reopened draft public photo must return 404 (got ${revokedPhoto.status})`);
      const revokedConditionalPhoto = await fetch(
        `${appOrigin}/api/media/${activePhotoId}?listing=${withdrawnId}&variant=card`,
        { headers: { 'if-none-match': publicEtag } },
      );
      assert(
        revokedConditionalPhoto.status === 404 &&
          (revokedConditionalPhoto.headers.get('cache-control') || '').includes('no-store'),
        `Reopened draft conditional photo with prior ETag must return 404 no-store (got ${revokedConditionalPhoto.status})`,
      );
      pass('Seller dashboard (EN/AR), sold -> reopen to private draft, photo retention, and immediate public revocation verified on hosted staging');

      await anonCtxDesktop.close();
      await anonCtxMobile.close();
      await adminCtx.close();
      adminMfaVerified = true;

      // 11. Authenticated account deletion request -> immediately hides storefront -> logout & session invalidation
      await page.goto(`${appOrigin}/en/account`);
      const deletionBox = page.locator('#account-deletion');
      await deletionBox.getByLabel(/I understand my public profile/i).check();
      await deletionBox.getByRole('button', { name: 'Request account deletion', exact: true }).click();
      await deletionBox.getByRole('status').filter({ hasText: 'Account deletion request received' }).waitFor({ timeout: 15_000 });
      const hiddenAfterDelReq = await fetch(`${appOrigin}/en/@${s1Username}`);
      assert(hiddenAfterDelReq.status === 404, `Storefront must return 404 immediately after deletion request (got ${hiddenAfterDelReq.status})`);
      pass('Authenticated account deletion request recorded and public storefront immediately taken offline');
      for (const locale of ['en', 'ar']) {
        await page.goto(`${appOrigin}/${locale}/account/listings`);
        await page.locator('.seller-feedback-banner a[href$="/account#account-deletion"]').waitFor();
        assert(await page.locator('.seller-create-card').count() === 0, 'Pending deletion hides listing creation');
        assert(await page.locator('.seller-listing-actions button:enabled').count() === 0, 'Pending deletion disables lifecycle mutations');
        await page.goto(`${appOrigin}/${locale}/account/listings/${withdrawnId}`);
        await page.locator('.editor-page fieldset[disabled]').waitFor();
        assert(await page.locator('.editor-page fieldset[disabled]').count() === 1, 'Direct editor is read-only');
        await page.goto(`${appOrigin}/${locale}/account/photos?listing=${withdrawnId}`);
        await page.locator('.photo-manager-page').waitFor();
        assert(await page.locator('input[type="file"]').count() === 0, 'Direct photo route hides upload controls');
      }
      await page.goto(`${appOrigin}/en/account`);
      pass('Pending-deletion listing and photo controls restricted across direct EN/AR routes');

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
  } else if (mode === 'smoke-phase2b') {
    // Non-destructive Phase 2B security & recovery-isolation verification on hosted staging:
    // - Initial signup-confirmation session allowlist (/auth/callback?type=signup)
    // - Cross-type token rejection (/auth/callback?type=email and ?type=signup with recovery hash)
    // - Recovery-session isolation across account pages, photo delivery/upload APIs, owner mutations, and direct Supabase RPCs
    // - Cookie removal/expiry + Supabase token refresh during recovery
    // - Invalid subsequent /auth/recovery request invalidating an existing recovery session
    // - End-to-end password recovery (EN desktop & AR 390px mobile), reuse rejection, profile/draft preservation
    // - MFA-enrolled admin recovery isolation at BOTH aal1 and aal2 (pages, admin photo delivery, direct admin RPCs, cookie removal, invalid retry), plus operator deleteFactor + re-enrollment
    const adminState = loadSmokeAdminState(adminStatePath);
    const tag = randomBytes(4).toString('hex');
    const appOrigin = cfg.appOrigin;
    const results = [];
    const disposableUserIds = [];
    let pendingListingId = null;
    let sellerCleanupClient = null;
    let currentSellerEmail = null;
    let currentSellerPassword = null;
    const pass = (name) => {
      results.push({ name, ok: true });
      console.log(`PASS: ${name}`);
    };

    function readSbAuthSession(cookies) {
      const sbCookies = cookies
        .filter((c) => /^sb-.*-auth-token(?:\.\d+)?$/.test(c.name))
        .sort((a, b) => a.name.localeCompare(b.name));
      if (sbCookies.length === 0) return null;
      const joined = sbCookies.map((c) => c.value).join('');
      const raw = joined.startsWith('base64-')
        ? Buffer.from(joined.slice('base64-'.length), 'base64url').toString('utf8')
        : joined;
      return { sbCookies, session: JSON.parse(raw) };
    }

    async function expireCookiesAndForceRefresh(context) {
      const parsed = readSbAuthSession(await context.cookies());
      assert(parsed && parsed.session?.access_token, 'Expected active sb-*-auth-token cookies');
      const { sbCookies, session } = parsed;
      // Clear ALL cookies (removing any auxiliary cookies) and re-inject ONLY expired sb-*-auth-token
      // to simulate >15min cookie expiry/removal + Supabase access-token refresh.
      await context.clearCookies();
      session.expires_at = 1;
      const encoded = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
      const baseName = sbCookies[0].name.replace(/\.\d+$/, '');
      const chunks = encoded.match(/.{1,3000}/g) ?? [];
      await context.addCookies(
        chunks.map((value, index) => ({
          ...sbCookies[0],
          name: chunks.length === 1 ? baseName : `${baseName}.${index}`,
          value,
        })),
      );
    }

    function directClientWithJwt(accessToken) {
      return createClient(cfg.supabaseUrl, cfg.publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      });
    }

    async function assertDirectRpcDenied(client, fnName, args, label) {
      const res = args ? await client.rpc(fnName, args) : await client.rpc(fnName);
      assert(
        res.error && res.error.code === '42501',
        `${label} must fail with 42501 (got data=${JSON.stringify(res.data)}, error=${JSON.stringify(res.error)})`,
      );
    }

    let browser = null;
    try {
      const settingsRes = await fetch(`${cfg.supabaseUrl}/auth/v1/settings`, {
        headers: { apikey: cfg.publishableKey },
      });
      assert(settingsRes.ok, `Auth settings HTTP ${settingsRes.status}`);
      const settings = await settingsRes.json();
      assert(settings.mailer_autoconfirm === false, 'mailer_autoconfirm must remain false');
      const googleEnabled = settings.external?.google === true;
      pass(`Auth settings checked (email confirmation enforced, google_enabled=${googleEnabled})`);

      // 1. OAuth error/cancellation, cross-type callback rejection, & open-redirect sanitization
      const cancelRes = await fetch(
        `${appOrigin}/en/auth/callback?error=access_denied&error_description=InjectedPayload&next=https://evil.example`,
        { redirect: 'manual' },
      );
      assert(cancelRes.status === 307 || cancelRes.status === 302, `OAuth cancel redirect status ${cancelRes.status}`);
      assert(
        cancelRes.headers.get('location') === `${appOrigin}/en/auth/signin?error=oauth_cancelled`,
        `Unexpected cancel redirect: ${cancelRes.headers.get('location')}`,
      );
      assert((cancelRes.headers.get('cache-control') || '').includes('no-store'), 'Callback must be no-store');
      assert(cancelRes.headers.get('referrer-policy') === 'no-referrer', 'Callback must set Referrer-Policy: no-referrer');

      const oauthErrRes = await fetch(
        `${appOrigin}/ar/auth/callback?error=server_error&next=https://evil.example`,
        { redirect: 'manual' },
      );
      assert(
        oauthErrRes.headers.get('location') === `${appOrigin}/ar/auth/signin?error=oauth`,
        `Unexpected OAuth error redirect: ${oauthErrRes.headers.get('location')}`,
      );

      const badRecRes = await fetch(
        `${appOrigin}/en/auth/recovery?token_hash=invalid_token&type=recovery&next=https://evil.example`,
        { redirect: 'manual' },
      );
      assert(
        badRecRes.headers.get('location') === `${appOrigin}/en/auth/reset-password?error=invalid`,
        `Unexpected invalid recovery redirect: ${badRecRes.headers.get('location')}`,
      );
      assert((badRecRes.headers.get('cache-control') || '').includes('no-store'), 'Recovery callback must be no-store');

      const badCbRecRes = await fetch(
        `${appOrigin}/en/auth/callback?token_hash=invalid_token&type=recovery&next=https://evil.example`,
        { redirect: 'manual' },
      );
      assert(
        badCbRecRes.headers.get('location') === `${appOrigin}/en/auth/reset-password?error=invalid`,
        `Unexpected callback recovery delegation redirect: ${badCbRecRes.headers.get('location')}`,
      );
      pass('OAuth cancellation, error sanitization, recovery callback delegation, and open-redirect blocks verified');

      browser = await chromium.launch({ channel: 'chrome', headless: true });

      // 2. EN/AR, light/dark, 390px mobile UI + Google button & graceful disabled check
      const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const mobilePage = await mobileCtx.newPage();
      for (const locale of ['en', 'ar']) {
        for (const route of ['signin', 'signup', 'forgot-password', 'reset-password']) {
          for (const theme of ['light', 'dark']) {
            const navRes = await mobilePage.goto(`${appOrigin}/${locale}/auth/${route}`);
            assert(navRes?.status() === 200, `GET /${locale}/auth/${route} failed (${navRes?.status()})`);
            assert((navRes?.headers()['cache-control'] || '').includes('no-store'), `/${locale}/auth/${route} must be no-store`);
            await mobilePage
              .getByRole('combobox', { name: locale === 'en' ? 'Color theme' : 'مظهر الموقع' })
              .selectOption(theme);
            const overflow = await mobilePage.evaluate(
              () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
            );
            assert(overflow <= 1, `Horizontal overflow on /${locale}/auth/${route} (${theme}, 390px): ${overflow}px`);
          }
        }
      }
      await mobilePage.goto(`${appOrigin}/en/auth/signin?error=oauth_cancelled`);
      await mobilePage.getByRole('alert').filter({ hasText: /cancelled/i }).waitFor({ timeout: 10_000 });
      await mobilePage.getByRole('link', { name: 'Forgot password?', exact: true }).waitFor({ timeout: 10_000 });
      const googleBtnCount = await mobilePage
        .getByRole('button', { name: 'Continue with Google', exact: true })
        .count();
      if (googleEnabled) {
        assert(googleBtnCount === 1, 'Continue with Google button must be visible when Google OAuth is enabled');
      } else {
        assert(googleBtnCount === 0, 'Continue with Google button must be hidden when Google OAuth is disabled');
      }
      await mobileCtx.close();
      pass('Auth pages (signin/signup/forgot/reset) verified across EN/AR, light/dark, and 390px mobile with zero overflow');

      // 3. First-time signup confirmation flow (/en/auth/callback?type=signup) + seller profile & private draft photo setup
      const sellerEmail = `staging_rec_${tag}@example.test`;
      const oldPassword = `RecOld!${randomBytes(6).toString('hex')}`;
      const newPassword = `RecNew!${randomBytes(6).toString('hex')}`;
      const arPassword = `RecAr!${randomBytes(6).toString('hex')}`;
      currentSellerEmail = sellerEmail;
      currentSellerPassword = oldPassword;
      const signupLink = await serviceClient.auth.admin.generateLink({
        type: 'signup',
        email: sellerEmail,
        password: oldPassword,
        options: { redirectTo: `${appOrigin}/en/auth/callback` },
      });
      assert(!signupLink.error && signupLink.data.user && signupLink.data.properties.hashed_token, `generateLink(signup) failed: ${signupLink.error?.message}`);
      disposableUserIds.push(signupLink.data.user.id);

      const userCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const userPage = await userCtx.newPage();

      // Anti-enumeration check on unknown email
      await userPage.goto(`${appOrigin}/en/auth/forgot-password`);
      await userPage.getByLabel('Email address').fill(`unknown_${tag}@example.test`);
      await userPage.getByRole('button', { name: 'Send reset link', exact: true }).click();
      await userPage.getByRole('status').filter({ hasText: 'If an account exists' }).waitFor({ timeout: 15_000 });

      // Genuine first-time signup confirmation registers the single allowed OTP confirmation session.
      await userPage.goto(
        `${appOrigin}/en/auth/callback?token_hash=${encodeURIComponent(signupLink.data.properties.hashed_token)}&type=signup`,
      );
      await userPage.waitForURL('**/en/account', { timeout: 25_000 });

      // Approved initial signup session can create seller profile, but CANNOT enter /en/auth/reset-password.
      await userPage.getByLabel('Username', { exact: true }).fill(`rec_${tag}`);
      await userPage.getByLabel('Display name').fill('Recovery Seller Preserved');
      await userPage.getByLabel('Governorate').selectOption('cairo');
      await userPage.getByRole('button', { name: 'Create profile', exact: true }).click();
      await userPage.getByRole('heading', { name: 'Profile details' }).waitFor({ timeout: 20_000 });

      await userPage.goto(`${appOrigin}/en/auth/reset-password`);
      assert((await userPage.locator('input[type="password"]').count()) === 0, 'Approved signup session must NOT enter reset-password');
      pass('Initial signup confirmation session allowlisted once, creates profile, and cannot open reset-password');

      // Re-sign-in with password so we also exercise password session, create a private draft + private photo,
      // and prepare a pending listing with 3 photos for MFA admin review photo tests.
      await userPage.goto(`${appOrigin}/en/account`);
      await userPage.getByRole('button', { name: 'Sign out', exact: true }).click();
      await userPage.waitForURL('**/en/auth/signin', { timeout: 20_000 });

      await userPage.getByLabel('Email address').fill(sellerEmail);
      await userPage.getByLabel('Password', { exact: true }).fill(oldPassword);
      await userPage.getByRole('button', { name: 'Sign in', exact: true }).click();
      await userPage.waitForURL('**/en/account', { timeout: 25_000 });

      await userPage.goto(`${appOrigin}/en/auth/reset-password`);
      assert((await userPage.locator('input[type="password"]').count()) === 0, 'Normal password session must NOT bypass recovery gate');

      // Enable public profile + WhatsApp consent (for pending listing submission used in admin review photo test)
      await userPage.goto(`${appOrigin}/en/account`);
      await userPage.getByLabel('Allow my seller profile to be public').check();
      await userPage.getByRole('button', { name: 'Save profile details', exact: true }).click();
      await userPage.getByRole('status').filter({ hasText: 'Saved successfully' }).waitFor({ timeout: 15_000 });
      await userPage.getByLabel('WhatsApp number (optional)').fill('+201000000099');
      await userPage.getByLabel(/I agree to let buyers/).check();
      await userPage.getByRole('button', { name: 'Save contact preferences', exact: true }).click();
      await userPage.getByRole('status').filter({ hasText: 'Saved successfully' }).waitFor({ timeout: 15_000 });

      // Create private draft listing + upload 1 private draft photo
      const img1 = await makeSyntheticImage(36, 91, 56, true);
      const img2 = await makeSyntheticImage(180, 140, 48, false);
      const img3 = await makeSyntheticImage(45, 78, 128, false);

      await userPage.goto(`${appOrigin}/en/account/photos`);
      await userPage.getByRole('button', { name: 'Create photo draft', exact: true }).click();
      await userPage.waitForURL(/listing=[0-9a-f-]+/, { timeout: 20_000 });
      const draftId = new URL(userPage.url()).searchParams.get('listing');
      assert(draftId, 'Expected draft listing ID');

      const uploadDraftRes = await userCtx.request.post(`${appOrigin}/api/listings/${draftId}/photos`, {
        headers: { Origin: appOrigin, 'X-Listing-Version': '1' },
        data: img1.bytes,
      });
      assert(uploadDraftRes.status() === 201, `Draft photo upload failed (${uploadDraftRes.status()})`);
      const draftPhoto = await uploadDraftRes.json();
      const privatePhotoId = draftPhoto.id;
      const draftVersionAfterPhoto = draftPhoto.version;

      // Owner can read private draft photo; anonymous gets 404.
      assert((await userCtx.request.get(`${appOrigin}/api/media/${privatePhotoId}?variant=card`)).status() === 200, 'Owner must read own private draft photo');
      assert((await fetch(`${appOrigin}/api/media/${privatePhotoId}?variant=card`)).status === 404, 'Anonymous must get 404 for private draft photo');

      // Also create a submitted pending listing with 3 photos for the admin MFA recovery review-photo test.
      const sellerPassClient = createClient(cfg.supabaseUrl, cfg.publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const signInSeller = await sellerPassClient.auth.signInWithPassword({ email: sellerEmail, password: oldPassword });
      assert(!signInSeller.error, `Seller direct password sign-in failed: ${signInSeller.error?.message}`);
      sellerCleanupClient = sellerPassClient;

      const createdPending = await sellerPassClient.rpc('create_listing_draft', { p_category: 'rackets' });
      assert(!createdPending.error && createdPending.data?.id, `Create pending draft failed: ${createdPending.error?.message}`);
      pendingListingId = createdPending.data.id;
      let pendingVersion = createdPending.data.version;
      let pendingPhotoId = null;
      for (const sample of [img1, img2, img3]) {
        const upRes = await userCtx.request.post(`${appOrigin}/api/listings/${pendingListingId}/photos`, {
          headers: { Origin: appOrigin, 'X-Listing-Version': String(pendingVersion) },
          data: sample.bytes,
        });
        assert(upRes.status() === 201, `Pending listing photo upload failed (${upRes.status()})`);
        const body = await upRes.json();
        if (!pendingPhotoId) pendingPhotoId = body.id;
        pendingVersion = body.version;
      }
      const patchPending = await sellerPassClient.rpc('update_listing_draft', {
        p_listing_id: pendingListingId,
        p_expected_version: pendingVersion,
        p_patch: {
          title: `Recovery Review Target ${tag}`,
          brand_slug: 'head',
          model: 'Speed Pro',
          description: 'Synthetic pending listing for Phase 2B recovery-isolation verification.',
          governorate_slug: 'cairo',
          condition: 'used',
          condition_disclosure: 'Synthetic test condition',
          racket_damage_repair_disclosure: 'No repairs',
          offer_type: 'sale',
          price_egp: 3500,
        },
      });
      assert(!patchPending.error, `Patch pending listing failed: ${patchPending.error?.message}`);
      const subPending = await sellerPassClient.rpc('submit_listing', {
        p_listing_id: pendingListingId,
        p_expected_version: patchPending.data.version,
      });
      assert(!subPending.error, `Submit pending listing failed: ${subPending.error?.message}`);

      await userPage.goto(`${appOrigin}/en/account`);
      await userPage.getByRole('button', { name: 'Sign out', exact: true }).click();
      await userPage.waitForURL('**/en/auth/signin', { timeout: 20_000 });

      // 4. Cross-type callback attack: sending a recovery token_hash to /en/auth/callback with type=email or type=signup MUST fail!
      const crossTypeLink = await serviceClient.auth.admin.generateLink({
        type: 'recovery',
        email: sellerEmail,
        options: { redirectTo: `${appOrigin}/en/auth/recovery` },
      });
      assert(!crossTypeLink.error && crossTypeLink.data.properties.hashed_token, 'Cross-type generateLink failed');
      const crossCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const crossPage = await crossCtx.newPage();
      await crossPage.goto(
        `${appOrigin}/en/auth/callback?token_hash=${encodeURIComponent(crossTypeLink.data.properties.hashed_token)}&type=email`,
      );
      await crossPage.waitForURL('**/en/auth/signin?error=confirmation', { timeout: 20_000 });
      await crossPage.goto(`${appOrigin}/en/account`);
      await crossPage.waitForURL('**/en/auth/signin', { timeout: 20_000 });
      await crossPage.goto(
        `${appOrigin}/en/auth/callback?token_hash=${encodeURIComponent(crossTypeLink.data.properties.hashed_token)}&type=signup`,
      );
      await crossPage.waitForURL('**/en/auth/signin?error=confirmation', { timeout: 20_000 });
      assert((await crossCtx.request.get(`${appOrigin}/api/media/${privatePhotoId}?variant=card`)).status() === 404, 'Cross-type callback must not unlock private photo');
      await crossCtx.close();
      pass('Cross-type recovery token replay via /auth/callback?type=email and ?type=signup rejected cleanly');

      // 5. Valid recovery session isolation: pages, private photos, photo uploads, owner mutations, direct RPCs, cookie removal/expiry, AND invalid-token retry!
      const recLinkIso = await serviceClient.auth.admin.generateLink({
        type: 'recovery',
        email: sellerEmail,
        options: { redirectTo: `${appOrigin}/en/auth/recovery` },
      });
      assert(!recLinkIso.error && recLinkIso.data.properties.hashed_token, `generateLink(recovery) failed: ${recLinkIso.error?.message}`);
      const isoTokenHash = recLinkIso.data.properties.hashed_token;

      await userPage.goto(
        `${appOrigin}/en/auth/recovery?token_hash=${encodeURIComponent(isoTokenHash)}&type=recovery&next=https://evil.example`,
      );
      await userPage.waitForURL('**/en/auth/reset-password', { timeout: 20_000 });
      assert(!userPage.url().includes(isoTokenHash), 'Recovery redirect must strip token_hash from URL');

      const recCookieInfo = readSbAuthSession(await userCtx.cookies());
      assert(recCookieInfo?.session?.access_token, 'Expected active recovery JWT in sb-*-auth-token cookie');
      const capturedRecoveryJwt = recCookieInfo.session.access_token;
      const directRecClient = directClientWithJwt(capturedRecoveryJwt);

      // 5a. Account pages blocked
      for (const path of ['/en/account', '/en/account/listings', '/en/account/photos', '/en/admin']) {
        await userPage.goto(`${appOrigin}${path}`);
        await userPage.waitForURL('**/en/auth/signin', { timeout: 20_000 });
      }
      // 5b. Protected photo delivery and upload APIs blocked
      assert(
        (await userCtx.request.get(`${appOrigin}/api/media/${privatePhotoId}?variant=card`)).status() === 404,
        'Recovery session must NOT read private draft photo',
      );
      assert(
        (
          await userCtx.request.post(`${appOrigin}/api/listings/${draftId}/photos`, {
            headers: { Origin: appOrigin, 'X-Listing-Version': String(draftVersionAfterPhoto) },
            data: img2.bytes,
          })
        ).status() === 401,
        'Recovery session must NOT upload listing photos',
      );
      // 5c. Direct Supabase RPCs (reads & owner mutations) blocked at Postgres boundary
      const activeFlag = await directRecClient.rpc('is_my_account_session_active');
      assert(!activeFlag.error && activeFlag.data === false, `is_my_account_session_active must be false for recovery JWT (got ${JSON.stringify(activeFlag)})`);
      await assertDirectRpcDenied(directRecClient, 'get_my_profile_bundle', null, 'Recovery JWT get_my_profile_bundle');
      await assertDirectRpcDenied(directRecClient, 'update_seller_profile', { p_expected_version: 2, p_patch: { bio: 'tampered' } }, 'Recovery JWT update_seller_profile');
      await assertDirectRpcDenied(directRecClient, 'create_listing_draft', { p_category: 'rackets' }, 'Recovery JWT create_listing_draft');
      await assertDirectRpcDenied(directRecClient, 'update_listing_draft', { p_listing_id: draftId, p_expected_version: draftVersionAfterPhoto, p_patch: { title: 'tampered' } }, 'Recovery JWT update_listing_draft');
      await assertDirectRpcDenied(directRecClient, 'get_my_listings', null, 'Recovery JWT get_my_listings');
      await assertDirectRpcDenied(directRecClient, 'get_my_photo_drafts', null, 'Recovery JWT get_my_photo_drafts');
      await assertDirectRpcDenied(directRecClient, 'get_listing_metrics', { p_admin: false }, 'Recovery JWT get_listing_metrics');
      pass('Recovery session blocked across account pages, private photo delivery (404), photo uploads (401), owner mutations, and direct Supabase RPCs (42501)');

      // 5d. Cookie expiry / removal + forced Supabase session refresh keeps boundary intact
      await expireCookiesAndForceRefresh(userCtx);
      await userPage.goto(`${appOrigin}/en/account`);
      await userPage.waitForURL('**/en/auth/signin', { timeout: 20_000 });
      assert(
        (await userCtx.request.get(`${appOrigin}/api/media/${privatePhotoId}?variant=card`)).status() === 404,
        'Refreshed recovery session after cookie removal/expiry must NOT read private photo',
      );
      assert(
        (
          await userCtx.request.post(`${appOrigin}/api/listings/${draftId}/photos`, {
            headers: { Origin: appOrigin, 'X-Listing-Version': String(draftVersionAfterPhoto) },
            data: img2.bytes,
          })
        ).status() === 401,
        'Refreshed recovery session after cookie removal/expiry must NOT upload photos',
      );
      const refreshedRecCookie = readSbAuthSession(await userCtx.cookies());
      assert(refreshedRecCookie?.session?.access_token, 'Expected refreshed recovery session');
      const directRefreshedRecClient = directClientWithJwt(refreshedRecCookie.session.access_token);
      await assertDirectRpcDenied(directRefreshedRecClient, 'get_my_profile_bundle', null, 'Refreshed recovery JWT get_my_profile_bundle');
      await assertDirectRpcDenied(directRefreshedRecClient, 'update_seller_profile', { p_expected_version: 2, p_patch: { bio: 'tampered2' } }, 'Refreshed recovery JWT update_seller_profile');
      pass('Recovery boundary holds across cookie removal, >15m expiry simulation, and Supabase session refresh');

      // 5e. Invalid subsequent /auth/recovery request while holding an active recovery session MUST invalidate it!
      await userPage.goto(`${appOrigin}/en/auth/recovery?token_hash=invalid_retry_after_valid&type=recovery`);
      await userPage.waitForURL('**/en/auth/reset-password?error=invalid', { timeout: 20_000 });
      assert((await userPage.locator('input[type="password"]').count()) === 0, 'Invalid retry must not render reset form');
      assert(readSbAuthSession(await userCtx.cookies()) === null, 'Invalid subsequent /auth/recovery must clear active recovery Supabase cookies');
      await userPage.goto(`${appOrigin}/en/account`);
      await userPage.waitForURL('**/en/auth/signin', { timeout: 20_000 });
      assert((await userCtx.request.get(`${appOrigin}/api/media/${privatePhotoId}?variant=card`)).status() === 404, 'Invalid recovery retry must keep private photo 404');
      assert(
        (
          await userCtx.request.post(`${appOrigin}/api/listings/${draftId}/photos`, {
            headers: { Origin: appOrigin, 'X-Listing-Version': String(draftVersionAfterPhoto) },
            data: img2.bytes,
          })
        ).status() === 401,
        'Invalid recovery retry must keep photo upload 401',
      );
      await userPage.goto(`${appOrigin}/en/auth/reset-password`);
      assert((await userPage.locator('input[type="password"]').count()) === 0, 'Reset page must stay closed after invalid-token retry');
      // Even replaying the previously captured recovery JWT directly against Postgres stays denied.
      await assertDirectRpcDenied(directRecClient, 'get_my_profile_bundle', null, 'Captured pre-retry recovery JWT get_my_profile_bundle');
      pass('Invalid subsequent /auth/recovery invalidates active recovery session and keeps pages, photos, APIs, and RPCs denied');

      // 6. Complete full password recovery on a fresh link, reuse rejection, old vs new password, profile & draft intact
      const recLinkComplete = await serviceClient.auth.admin.generateLink({
        type: 'recovery',
        email: sellerEmail,
        options: { redirectTo: `${appOrigin}/en/auth/recovery` },
      });
      assert(!recLinkComplete.error && recLinkComplete.data.properties.hashed_token, 'Fresh recovery generateLink failed');
      const tokenHashComplete = recLinkComplete.data.properties.hashed_token;

      await userPage.goto(`${appOrigin}/en/auth/recovery?token_hash=${encodeURIComponent(tokenHashComplete)}&type=recovery`);
      await userPage.waitForURL('**/en/auth/reset-password', { timeout: 20_000 });

      // Password mismatch rejected cleanly
      await userPage.getByLabel('New password', { exact: true }).fill(newPassword);
      await userPage.getByLabel('Confirm new password', { exact: true }).fill('WrongMismatch!123');
      await userPage.getByRole('button', { name: 'Update password', exact: true }).click();
      await userPage.getByText('Passwords do not match.').waitFor({ timeout: 10_000 });

      // Valid update signs out globally and redirects to /en/auth/signin?reset=1
      await userPage.getByLabel('New password', { exact: true }).fill(newPassword);
      await userPage.getByLabel('Confirm new password', { exact: true }).fill(newPassword);
      await userPage.getByRole('button', { name: 'Update password', exact: true }).click();
      await userPage.waitForURL('**/en/auth/signin?reset=1', { timeout: 20_000 });
      currentSellerPassword = newPassword;
      await userPage.getByRole('status').filter({ hasText: 'Your password has been updated' }).waitFor({ timeout: 10_000 });

      // Reused token fails closed
      await userPage.goto(`${appOrigin}/en/auth/recovery?token_hash=${encodeURIComponent(tokenHashComplete)}&type=recovery`);
      await userPage.waitForURL('**/en/auth/reset-password?error=invalid', { timeout: 20_000 });
      assert((await userPage.locator('input[type="password"]').count()) === 0, 'Reused recovery link must not unlock reset form');

      // Old password fails; new password works and preserves seller profile, draft version, and private photo
      await userPage.goto(`${appOrigin}/en/auth/signin`);
      await userPage.getByLabel('Email address').fill(sellerEmail);
      await userPage.getByLabel('Password', { exact: true }).fill(oldPassword);
      await userPage.getByRole('button', { name: 'Sign in', exact: true }).click();
      await userPage.getByText(/Sign-in failed/i).waitFor({ timeout: 15_000 });

      await userPage.getByLabel('Password', { exact: true }).fill(newPassword);
      await userPage.getByRole('button', { name: 'Sign in', exact: true }).click();
      await userPage.waitForURL('**/en/account', { timeout: 25_000 });
      assert((await userPage.getByLabel('Display name').inputValue()) === 'Recovery Seller Preserved', 'Seller profile preserved after reset');
      assert((await userCtx.request.get(`${appOrigin}/api/media/${privatePhotoId}?variant=card`)).status() === 200, 'Owner photo accessible again after normal password login');
      await userCtx.close();

      // Re-authenticate cleanup client with new password (since reset signed out globally)
      await sellerPassClient.auth.signInWithPassword({ email: sellerEmail, password: newPassword });

      // Arabic 390px mobile recovery round-trip
      const recLinkAr = await serviceClient.auth.admin.generateLink({
        type: 'recovery',
        email: sellerEmail,
        options: { redirectTo: `${appOrigin}/ar/auth/recovery` },
      });
      assert(!recLinkAr.error && recLinkAr.data.properties.hashed_token, 'AR generateLink succeeded');
      const arCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const arPage = await arCtx.newPage();
      await arPage.goto(
        `${appOrigin}/ar/auth/recovery?token_hash=${encodeURIComponent(recLinkAr.data.properties.hashed_token)}&type=recovery`,
      );
      await arPage.waitForURL('**/ar/auth/reset-password', { timeout: 20_000 });
      await arPage.locator('input[name="password"]').fill(arPassword);
      await arPage.locator('input[name="confirmPassword"]').fill(arPassword);
      await arPage.locator('form.account-form button.primary').click();
      await arPage.waitForURL('**/ar/auth/signin?reset=1', { timeout: 20_000 });
      currentSellerPassword = arPassword;
      await arCtx.close();
      await sellerPassClient.auth.signInWithPassword({ email: sellerEmail, password: arPassword });
      pass('End-to-end password recovery (EN desktop & AR mobile), reuse rejection, old/new password check, and profile/photo preservation verified');

      // 7. MFA-enrolled Admin Recovery Isolation (aal1 AND aal2!) + Operator MFA Recovery (Task 2B-4)
      const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const adminPage = await adminCtx.newPage();

      await adminPage.goto(`${appOrigin}/en/auth/signin`);
      await adminPage.getByLabel('Email address').fill(adminState.email);
      await adminPage.getByLabel('Password', { exact: true }).fill(adminState.password);
      await adminPage.getByRole('button', { name: 'Sign in', exact: true }).click();
      await adminPage.waitForURL('**/en/account', { timeout: 25_000 });

      // Enroll TOTP on /en/admin and confirm normal aal2 access (including admin review photo delivery!)
      const adminGateRes = await adminPage.goto(`${appOrigin}/en/admin`);
      assert(
        adminGateRes?.status() === 200,
        `Smoke admin /en/admin returned ${adminGateRes?.status()} — grant userId ${adminState.userId} in private.admin_roles before running smoke-phase2b.`,
      );
      await adminPage.locator('button[name="intent"][value="enroll"]').click();
      const secretEl = adminPage.locator('[data-testid="mfa-secret"]');
      await secretEl.waitFor({ timeout: 20_000 });
      const initialSecret = (await secretEl.innerText()).trim();
      const initialFactorId = await adminPage.locator('input[name="factor"]').inputValue();
      await adminPage.locator('input[name="code"]').fill(totp(initialSecret));
      await adminPage.locator('button[name="intent"][value="verify"]').click();
      await adminPage.getByRole('heading', { name: 'Review listings', exact: true }).waitFor({ timeout: 20_000 });
      assert(
        (await adminCtx.request.get(`${appOrigin}/api/admin/listings/${pendingListingId}/photos/${pendingPhotoId}?variant=card`)).status() === 200,
        'Normal aal2 admin must read pending review photo',
      );
      pass('Synthetic admin enrolled TOTP MFA and verified normal aal2 admin queue + review photo access');

      // 7a. Admin recovery session at aal1 AND after TOTP step-up to aal2!
      const adminRecLink1 = await serviceClient.auth.admin.generateLink({
        type: 'recovery',
        email: adminState.email,
        options: { redirectTo: `${appOrigin}/en/auth/recovery` },
      });
      assert(!adminRecLink1.error && adminRecLink1.data.properties.hashed_token, 'Admin recovery generateLink 1 succeeded');

      const adminRecCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const adminRecPage = await adminRecCtx.newPage();
      await adminRecPage.goto(
        `${appOrigin}/en/auth/recovery?token_hash=${encodeURIComponent(adminRecLink1.data.properties.hashed_token)}&type=recovery`,
      );
      await adminRecPage.waitForURL('**/en/auth/reset-password', { timeout: 20_000 });
      assert((await adminRecPage.locator('input[name="code"]').count()) === 1, 'MFA-enrolled recovery must require 6-digit TOTP step');
      assert((await adminRecPage.locator('input[name="password"]').count()) === 0, 'MFA-enrolled recovery must NOT show password input at aal1');

      // Blocked at aal1 recovery: /en/admin, admin review photo, and direct admin RPCs
      await adminRecPage.goto(`${appOrigin}/en/admin`);
      await adminRecPage.waitForURL('**/en/auth/signin', { timeout: 20_000 });
      assert(
        (await adminRecCtx.request.get(`${appOrigin}/api/admin/listings/${pendingListingId}/photos/${pendingPhotoId}?variant=card`)).status() === 404,
        'aal1 admin recovery session must NOT read admin review photo',
      );
      const adminAal1Jwt = readSbAuthSession(await adminRecCtx.cookies())?.session?.access_token;
      assert(adminAal1Jwt, 'Expected admin aal1 recovery JWT');
      await assertDirectRpcDenied(directClientWithJwt(adminAal1Jwt), 'get_my_admin_access', null, 'aal1 admin recovery get_my_admin_access');

      // Invalid TOTP rejected cleanly
      await adminRecPage.goto(`${appOrigin}/en/auth/reset-password`);
      await adminRecPage.locator('input[name="code"]').fill('000000');
      await adminRecPage.locator('form.account-form button.primary').click();
      await adminRecPage
        .locator('main')
        .getByRole('alert')
        .filter({ hasText: /six-digit code/i })
        .waitFor({ timeout: 15_000 });

      // Elevate recovery session to aal2 via valid TOTP — BEFORE submitting new password, verify admin access is STILL 100% blocked!
      await adminRecPage.locator('input[name="code"]').fill(totp(initialSecret));
      await adminRecPage.locator('form.account-form button.primary').click();
      await adminRecPage.locator('input[name="password"]').waitFor({ timeout: 20_000 });

      const adminAal2Jwt = readSbAuthSession(await adminRecCtx.cookies())?.session?.access_token;
      assert(adminAal2Jwt, 'Expected admin aal2 recovery JWT');
      const directAdminRecAal2 = directClientWithJwt(adminAal2Jwt);

      await adminRecPage.goto(`${appOrigin}/en/admin`);
      await adminRecPage.waitForURL('**/en/auth/signin', { timeout: 20_000 });
      await adminRecPage.goto(`${appOrigin}/en/account`);
      await adminRecPage.waitForURL('**/en/auth/signin', { timeout: 20_000 });
      assert(
        (await adminRecCtx.request.get(`${appOrigin}/api/admin/listings/${pendingListingId}/photos/${pendingPhotoId}?variant=card`)).status() === 404,
        'aal2 admin recovery session must STILL NOT read admin review photo',
      );
      const adminActiveFlag = await directAdminRecAal2.rpc('is_my_account_session_active');
      assert(!adminActiveFlag.error && adminActiveFlag.data === false, 'aal2 admin recovery is_my_account_session_active must be false');
      await assertDirectRpcDenied(directAdminRecAal2, 'get_my_admin_access', null, 'aal2 admin recovery get_my_admin_access');
      await assertDirectRpcDenied(directAdminRecAal2, 'admin_pending_listings', { p_page: 1 }, 'aal2 admin recovery admin_pending_listings');
      await assertDirectRpcDenied(directAdminRecAal2, 'admin_get_listing_review', { p_listing_id: pendingListingId }, 'aal2 admin recovery admin_get_listing_review');
      await assertDirectRpcDenied(directAdminRecAal2, 'admin_photo_delivery', { p_listing: pendingListingId, p_asset: pendingPhotoId }, 'aal2 admin recovery admin_photo_delivery');
      await assertDirectRpcDenied(directAdminRecAal2, 'get_listing_metrics', { p_admin: true }, 'aal2 admin recovery admin metrics');

      // Cookie removal/expiry + refresh at aal2 recovery STILL blocks admin access; invalid /auth/recovery invalidates the aal2 recovery session!
      await expireCookiesAndForceRefresh(adminRecCtx);
      await adminRecPage.goto(`${appOrigin}/en/admin`);
      await adminRecPage.waitForURL('**/en/auth/signin', { timeout: 20_000 });
      assert(
        (await adminRecCtx.request.get(`${appOrigin}/api/admin/listings/${pendingListingId}/photos/${pendingPhotoId}?variant=card`)).status() === 404,
        'Refreshed aal2 admin recovery session must NOT read admin review photo',
      );
      await adminRecPage.goto(`${appOrigin}/en/auth/recovery?token_hash=invalid_admin_retry&type=recovery`);
      await adminRecPage.waitForURL('**/en/auth/reset-password?error=invalid', { timeout: 20_000 });
      assert(readSbAuthSession(await adminRecCtx.cookies()) === null, 'Invalid /auth/recovery retry must revoke aal2 recovery session');
      await adminRecCtx.close();
      pass('MFA-enrolled admin recovery blocked at BOTH aal1 and aal2 across /admin, admin review photos (404), direct admin RPCs (42501), cookie refresh, and invalid retry');

      // 7b. Complete fresh admin recovery with TOTP -> update password -> verify MFA factor preserved!
      const adminRecLink2 = await serviceClient.auth.admin.generateLink({
        type: 'recovery',
        email: adminState.email,
        options: { redirectTo: `${appOrigin}/en/auth/recovery` },
      });
      assert(!adminRecLink2.error && adminRecLink2.data.properties.hashed_token, 'Admin recovery generateLink 2 succeeded');
      const adminRecCtx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const adminRecPage2 = await adminRecCtx2.newPage();
      await adminRecPage2.goto(
        `${appOrigin}/en/auth/recovery?token_hash=${encodeURIComponent(adminRecLink2.data.properties.hashed_token)}&type=recovery`,
      );
      await adminRecPage2.waitForURL('**/en/auth/reset-password', { timeout: 20_000 });
      const adminPass2 = `AdminPass2!${randomBytes(6).toString('hex')}`;
      await adminRecPage2.locator('input[name="code"]').fill(totp(initialSecret));
      await adminRecPage2.locator('form.account-form button.primary').click();
      await adminRecPage2.locator('input[name="password"]').waitFor({ timeout: 20_000 });
      await adminRecPage2.locator('input[name="password"]').fill(adminPass2);
      await adminRecPage2.locator('input[name="confirmPassword"]').fill(adminPass2);
      await adminRecPage2.locator('form.account-form button.primary').click();
      await adminRecPage2.waitForURL('**/en/auth/signin?reset=1', { timeout: 20_000 });
      await adminRecCtx2.close();

      // Confirm MFA factor is STILL verified after password reset (never auto-removed)
      const factorsAfterReset = await serviceClient.auth.admin.mfa.listFactors({ userId: adminState.userId });
      assert(
        !factorsAfterReset.error &&
          factorsAfterReset.data.factors.some((f) => f.id === initialFactorId && f.status === 'verified'),
        'Password reset must NEVER remove or disable an admin TOTP MFA factor',
      );
      pass('Password recovery on MFA-enrolled admin completes cleanly with TOTP and preserves verified MFA factor');

      // Operator lost-authenticator recovery: delete lost factor via service-role Admin MFA API -> verify fresh re-enrollment works!
      const deletedFactor = await serviceClient.auth.admin.mfa.deleteFactor({
        userId: adminState.userId,
        id: initialFactorId,
      });
      assert(!deletedFactor.error, `Operator MFA deleteFactor failed: ${deletedFactor.error?.message}`);
      const factorsAfterDelete = await serviceClient.auth.admin.mfa.listFactors({ userId: adminState.userId });
      assert(
        !factorsAfterDelete.error && factorsAfterDelete.data.factors.length === 0,
        'Operator deleteFactor must remove lost verified factor',
      );

      // Re-login with new password -> /en/admin prompts fresh TOTP enrollment
      const reEnrollCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const reEnrollPage = await reEnrollCtx.newPage();
      await reEnrollPage.goto(`${appOrigin}/en/auth/signin`);
      await reEnrollPage.getByLabel('Email address').fill(adminState.email);
      await reEnrollPage.getByLabel('Password', { exact: true }).fill(adminPass2);
      await reEnrollPage.getByRole('button', { name: 'Sign in', exact: true }).click();
      await reEnrollPage.waitForURL('**/en/account', { timeout: 25_000 });

      await reEnrollPage.goto(`${appOrigin}/en/admin`);
      await reEnrollPage.locator('button[name="intent"][value="enroll"]').click();
      const freshSecretEl = reEnrollPage.locator('[data-testid="mfa-secret"]');
      await freshSecretEl.waitFor({ timeout: 20_000 });
      const freshSecret = (await freshSecretEl.innerText()).trim();
      const freshFactorId = await reEnrollPage.locator('input[name="factor"]').inputValue();
      assert(freshSecret !== initialSecret && freshFactorId !== initialFactorId, 'Fresh re-enrollment must generate a brand-new factor & secret');
      await reEnrollPage.locator('input[name="code"]').fill(totp(freshSecret));
      await reEnrollPage.locator('button[name="intent"][value="verify"]').click();
      await reEnrollPage.getByRole('heading', { name: 'Review listings', exact: true }).waitFor({ timeout: 20_000 });

      // Update saved adminState with new password, fresh factor, and aal2 storageState for verify-revoked-admin!
      adminState.password = adminPass2;
      adminState.factorId = freshFactorId;
      adminState.totpSecret = freshSecret;
      adminState.storageState = await reEnrollCtx.storageState();
      writeFileSync(adminStatePath, JSON.stringify(adminState), { mode: 0o600 });

      await reEnrollCtx.close();
      await adminCtx.close();
      pass('Operator lost-factor MFA recovery (deleteFactor -> forced fresh re-enrollment -> aal2 verification) verified');

      console.log(`\nALL PHASE 2B STAGING SMOKE CHECKS PASSED (${results.length} passed, 0 failed).`);
    } finally {
      if (browser) await browser.close().catch(() => {});
      if (sellerCleanupClient && currentSellerEmail && currentSellerPassword) {
        try {
          await sellerCleanupClient.auth.signInWithPassword({
            email: currentSellerEmail,
            password: currentSellerPassword,
          });
          if (pendingListingId) {
            const cur = await sellerCleanupClient.rpc('get_my_listing', { p_listing_id: pendingListingId });
            if (cur.data && ['pending', 'active'].includes(cur.data.status)) {
              await sellerCleanupClient.rpc('withdraw_listing', {
                p_listing_id: pendingListingId,
                p_expected_version: cur.data.version,
              });
            }
          }
          const prof = await sellerCleanupClient.rpc('get_my_profile_bundle');
          if (prof.data?.profile?.is_public) {
            await sellerCleanupClient.rpc('update_seller_profile', {
              p_expected_version: prof.data.profile.version,
              p_patch: { is_public: false },
            });
          }
        } catch {
          // Best-effort cleanup of synthetic test seller & pending listing
        }
      }
      for (const uid of disposableUserIds) {
        try {
          await serviceClient.auth.admin.deleteUser(uid);
        } catch {
          // Synthetic user with FK-protected seller_profiles row stays private and inactive.
        }
      }
    }
  }
}
