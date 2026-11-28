import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

test.use({ trace: 'off', screenshot: 'off', video: 'off' }); // Never capture MFA secrets or credentials.
test.skip(process.env.PADELHUB_AUTH_E2E !== '1', 'Local Auth and Storage required');

function operator(sql: string) {
  execFileSync(
    'docker',
    ['exec', '-i', 'supabase_db_padelhub-local', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'],
    { input: sql, stdio: ['pipe', 'pipe', 'pipe'] },
  );
}

function totp(secret: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secret.toUpperCase().replace(/=+$/, '')]
    .map((c) => alphabet.indexOf(c).toString(2).padStart(5, '0'))
    .join('');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', key).update(counter).digest();
  const offset = digest[19] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}

test('Admin C seller management, allowances, moderation revocation, audit labels and responsive UI', async ({ page, browser }, info) => {
  test.setTimeout(240000);
  const url = process.env.PADELHUB_SUPABASE_URL!;
  if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('Local test only');
  const service = createClient(url, process.env.PADELHUB_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const suffix = `${Date.now()}${info.project.name === 'mobile' ? 'm' : 'd'}`;
  const password = 'Local-admin-c-only-739!';

  const adminEmail = `adminc-actor-${suffix}@example.test`;
  const coachEmail = `adminc-coach-${suffix}@example.test`;
  const zeroEmail = `adminc-zero-${suffix}@example.test`;
  const [adminUser, coachUser, zeroUser] = await Promise.all([
    service.auth.admin.createUser({ email: adminEmail, password, email_confirm: true }),
    service.auth.admin.createUser({ email: coachEmail, password, email_confirm: true }),
    service.auth.admin.createUser({ email: zeroEmail, password, email_confirm: true }),
  ]);
  if (adminUser.error || coachUser.error || zeroUser.error) throw new Error('Cannot create local Admin C fixtures');

  const actorId = adminUser.data.user.id;
  const coachId = coachUser.data.user.id;
  const zeroId = zeroUser.data.user.id;

  const coachClient = createClient(url, process.env.PADELHUB_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  await coachClient.auth.signInWithPassword({ email: coachEmail, password });
  const coachRpc = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await coachClient.rpc(name, args);
    if (r.error) throw new Error(`Coach RPC ${name}: ${r.error.code} ${r.error.message}`);
    return r.data;
  };
  const coachUsername = `c_${suffix}`;
  const coachProfile = await coachRpc('create_seller_profile', {
    p_username: coachUsername,
    p_display_name: `Coach Synthetic ${suffix}`,
    p_governorate_slug: 'cairo',
    p_account_type: 'individual',
  });
  const coachPublicId = coachProfile.public_id as string;
  await coachRpc('update_seller_profile', { p_expected_version: 1, p_patch: { is_public: true, bio: 'Synthetic pilot coach.' } });
  await coachRpc('update_my_contact', {
    p_expected_profile_version: 2,
    p_expected_contact_version: 1,
    p_whatsapp_e164: '+201000000221',
    p_public_contact_consent: true,
  });

  // Create a second seller with 0 listings to verify custom 0 allowance + reset to default.
  const zeroClient = createClient(url, process.env.PADELHUB_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  await zeroClient.auth.signInWithPassword({ email: zeroEmail, password });
  const zeroUsername = `z_${suffix}`;
  const zeroProfileRes = await zeroClient.rpc('create_seller_profile', {
    p_username: zeroUsername,
    p_display_name: `Zero Quota Seller ${suffix}`,
    p_governorate_slug: 'alexandria',
    p_account_type: 'individual',
  });
  if (zeroProfileRes.error) throw new Error(`Zero seller profile error: ${zeroProfileRes.error.code}`);
  const zeroPublicId = zeroProfileRes.data.public_id as string;

  // Create & submit one listing for coach so we can approve it and verify public/QR/contact/media revocation.
  const draft = await coachRpc('create_listing_draft', { p_category: 'balls' });
  const listingId = draft.id as string;
  await coachRpc('update_listing_draft', {
    p_listing_id: listingId,
    p_expected_version: 1,
    p_patch: {
      title: `Coach Balls ${suffix}`,
      brand_slug: 'head',
      model: 'Pro S',
      description: 'Synthetic Admin C balls fixture for moderation checks.',
      governorate_slug: 'cairo',
      condition: 'new',
      condition_disclosure: 'Sealed synthetic pack',
      offer_type: 'sale',
      price_egp: 280,
      balls_quantity_packaging: '3 balls',
    },
  });
  const bytes = await sharp({ create: { width: 320, height: 240, channels: 3, background: '#14533c' } }).webp().toBuffer();
  const hash = createHash('sha256').update(bytes).digest('hex');
  let coverAsset = '';
  let listingVersion = 2;
  for (let i = 0; i < 3; i++) {
    const asset = randomUUID();
    const attempt = randomUUID();
    if (i === 0) coverAsset = asset;
    const manifest: Record<string, unknown> = {};
    for (const variant of ['thumb', 'card', 'full']) {
      const key = `processed/${asset}/${attempt}/${variant}.webp`;
      const upload = await service.storage.from('media-private').upload(key, bytes, { contentType: 'image/webp' });
      if (upload.error) throw new Error('Fixture photo upload failed');
      manifest[variant] = { key, sha256: hash, bytes: bytes.length };
    }
    const saved = await service.rpc('save_listing_photo', {
      p_owner: coachId,
      p_listing: listingId,
      p_version: listingVersion,
      p_asset: asset,
      p_attempt: attempt,
      p_mime: 'image/webp',
      p_bytes: bytes.length * 3,
      p_width: 320,
      p_height: 240,
      p_hash: hash,
      p_manifest: manifest,
    });
    if (saved.error) throw new Error('Fixture photo save failed');
    listingVersion++;
  }
  await coachRpc('submit_listing', { p_listing_id: listingId, p_expected_version: listingVersion });

  operator(`insert into private.admin_roles(user_id,role) select id,'admin' from auth.users where id='${actorId}' and email='${adminEmail}';`);

  const sellerContext = await browser.newContext({ baseURL: 'http://127.0.0.1:3100' });
  const sellerPage = await sellerContext.newPage();
  const anonContext = await browser.newContext({ baseURL: 'http://127.0.0.1:3100' });
  const login = async (p: typeof page, address: string) => {
    await p.goto('/en/auth/signin');
    await p.getByLabel('Email address').fill(address);
    await p.getByLabel('Password', { exact: true }).fill(password);
    await p.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(p).toHaveURL(/\/account$/);
  };

  try {
    // 1. Authorization checks: anonymous redirect, ordinary seller 404, unauthorized direct RPC denial, aal1 redirect.
    await page.goto('/en/admin/sellers');
    await expect(page).toHaveURL(/auth\/signin/);
    await page.goto(`/en/admin/sellers/${coachPublicId}`);
    await expect(page).toHaveURL(/auth\/signin/);

    const directRpcDeny = await coachClient.rpc('admin_seller_inventory');
    expect(directRpcDeny.error?.code).toBe('42501');

    await login(sellerPage, coachEmail);
    expect((await sellerPage.goto('/en/admin/sellers'))?.status()).toBe(404);
    expect((await sellerPage.goto(`/en/admin/sellers/${coachPublicId}`))?.status()).toBe(404);

    // Admin without MFA redirected to /en/admin challenge
    await login(page, adminEmail);
    await page.goto('/en/admin/sellers');
    await expect(page).toHaveURL(/\/en\/admin$/);
    await expect(page.getByRole('heading', { name: 'Admin verification' })).toBeVisible();

    // Enroll and verify MFA (aal2)
    await page.getByRole('button', { name: 'Set up authenticator' }).click();
    const secret = await page.getByTestId('mfa-secret').innerText();
    await page.getByLabel('Authenticator code').fill(totp(secret));
    await page.getByRole('button', { name: 'Verify code' }).click();
    await expect(page.getByRole('heading', { name: 'Admin overview' })).toBeVisible();

    // Approve coach's listing so public profile, QR, marketplace detail, WhatsApp contact, and ETag media are live.
    await page.goto(`/en/admin/listings/${listingId}`);
    await page.getByRole('button', { name: 'Approve listing', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('saved');

    // Confirm public access works BEFORE moderation and capture public media ETag.
    const publicMediaUrl = `/api/media/${coverAsset}?listing=${listingId}`;
    const mediaBefore = await anonContext.request.get(publicMediaUrl);
    expect(mediaBefore.status()).toBe(200);
    const etag = mediaBefore.headers().etag;
    expect(etag).toBeTruthy();
    expect((await anonContext.request.get(publicMediaUrl, { headers: { 'if-none-match': etag! } })).status()).toBe(304);
    expect((await anonContext.request.get(`/en/@${coachUsername}`)).status()).toBe(200);
    expect((await anonContext.request.get(`/api/profiles/${coachPublicId}`, { maxRedirects: 0 })).status()).toBe(302);
    expect((await anonContext.request.get(`/en/equipment/${listingId}`)).status()).toBe(200);
    expect((await anonContext.request.get(`/api/contact/${listingId}`, { maxRedirects: 0 })).status()).toBe(302);

    // 2. Sellers list workspace: search, combined filters, invalid filters, no-results, no sensitive leaks.
    await page.goto('/en/admin/sellers');
    await expect(page.getByRole('heading', { name: 'Seller management', exact: true })).toBeVisible();
    await expect(page.getByText('not total registered authentication accounts')).toBeVisible();

    const listHtml = await page.content();
    expect(listHtml).not.toContain('+201000000221');
    expect(listHtml).not.toContain(coachId);

    // Search by display name + combined filters
    await page.goto(`/en/admin/sellers?q=${encodeURIComponent(coachPublicId)}&account=individual&status=active&governorate=cairo&visibility=public&sort=activity`);
    await expect(page.locator('.sellers-table:visible tbody tr')).toHaveCount(1);
    await expect(page.locator('.sellers-table:visible')).toContainText(`Coach Synthetic ${suffix}`);
    await expect(page.locator('.sellers-table:visible')).toContainText(`@${coachUsername}`);

    // No-results state & invalid filters state
    await page.getByRole('searchbox', { name: 'Search sellers', exact: true }).fill('no-such-synthetic-seller-xyz');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.getByRole('main')).toContainText('No seller profiles match these filters');

    await page.goto('/en/admin/sellers?status=invalid_state');
    await expect(page.getByRole('main').getByRole('alert')).toContainText('invalid');

    // 3. Seller detail, navigation to Admin B with exact seller filter, and layout/theme matrix
    await page.goto(`/en/admin/sellers?q=${coachUsername}`);
    await page.locator('.sellers-table:visible').getByRole('link', { name: 'Inspect seller' }).click();
    await expect(page).toHaveURL(new RegExp(`/en/admin/sellers/${coachPublicId}`));
    await expect(page.getByRole('heading', { name: `Coach Synthetic ${suffix}` })).toBeVisible();
    const detailHtml = await page.content();
    expect(detailHtml).not.toContain('+201000000221');
    expect(detailHtml).not.toContain(coachId);

    // Link to seller's listings in Admin B with exact seller filter
    await page.getByRole('link', { name: 'View seller listings' }).first().click();
    await expect(page).toHaveURL(new RegExp(`/en/admin/listings\\?seller=${coachPublicId}`));
    await expect(page.getByText(`Filtered to seller: Coach Synthetic ${suffix} (@${coachUsername})`)).toBeVisible();
    await expect(page.locator('.inventory-table:visible tbody tr')).toHaveCount(1);
    await expect(page.locator('.inventory-table:visible')).toContainText(`Coach Balls ${suffix}`);

    // Responsive, theme, and EN/AR RTL checks + screenshots on desktop project
    if (info.project.name === 'desktop') {
      mkdirSync('.cache/admin-c-screenshots', { recursive: true });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      for (const width of [320, 390, 768, 1440]) {
        for (const locale of ['en', 'ar']) {
          for (const theme of ['light', 'dark']) {
            await page.setViewportSize({ width, height: 900 });
            for (const view of ['sellers', 'detail'] as const) {
              await page.goto(
                view === 'sellers'
                  ? `/${locale}/admin/sellers?q=${suffix}`
                  : `/${locale}/admin/sellers/${coachPublicId}`,
              );
              await expect(
                page.locator(view === 'sellers' ? '.sellers-table:visible' : '.seller-profile-dl').first(),
              ).toBeVisible();
              await page.locator('.theme-switch input[value="' + theme + '"]').check();
              expect(await page.getByRole('main').innerText()).not.toContain('profile.');
              expect(await page.evaluate(() => document.documentElement.dir)).toBe(locale === 'ar' ? 'rtl' : 'ltr');
              const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: innerWidth }));
              expect(overflow.scroll, `${view} ${width}px ${locale} ${theme}`).toBeLessThanOrEqual(overflow.inner);
              if (width === 1440 && locale === 'en' && theme === 'light') {
                await page.screenshot({ path: `.cache/admin-c-screenshots/${view}-desktop-en-light.png`, fullPage: true, animations: 'disabled' });
              }
              if (width === 390 && locale === 'ar' && theme === 'dark') {
                await page.screenshot({ path: `.cache/admin-c-screenshots/${view}-mobile-ar-dark.png`, fullPage: true, animations: 'disabled' });
              }
            }
          }
        }
      }
      expect(errors).toEqual([]);
      await page.setViewportSize({ width: 1280, height: 720 });
    }

    // 4. Account-type change, stale profile conflict, and allowance management
    await page.goto(`/en/admin/sellers/${coachPublicId}`);
    const staleTab = await page.context().newPage();
    await staleTab.goto(`/en/admin/sellers/${coachPublicId}`);

    // Upgrade coach from Personal -> Business
    const typeSection = page.locator('section').filter({ hasText: 'Account type management' });
    await typeSection.getByLabel('Administrative reason (required)').fill('Onboarded pilot padel academy');
    await typeSection.getByRole('button', { name: 'Change to Business' }).click();
    await expect(page.getByRole('status')).toContainText('Seller account type updated');

    // Stale tab attempting update gets conflict alert and disabled button
    const staleTypeSection = staleTab.locator('section').filter({ hasText: 'Account type management' });
    await staleTypeSection.getByLabel('Administrative reason (required)').fill('Stale concurrent update');
    await staleTypeSection.getByRole('button', { name: 'Change to Business' }).click();
    await expect(staleTypeSection.getByRole('alert')).toContainText('changed after you opened it');
    await expect(staleTypeSection.getByRole('button', { name: 'Change to Business' })).toBeDisabled();
    await staleTab.close();

    // Allowance management on coach (usage=1): rejecting 0 (below usage=1), setting custom 12, resetting to default 20
    const allowanceSection = page.locator('section').filter({ hasText: 'Per-seller listing allowance' });
    await allowanceSection.getByLabel('Custom active + pending allowance').fill('0');
    await allowanceSection.getByLabel('Administrative reason (required)').fill('Try below active usage');
    await allowanceSection.getByRole('button', { name: 'Save custom allowance' }).click();
    await expect(allowanceSection.getByRole('alert')).toContainText('exceed the resulting allowance');

    await allowanceSection.getByLabel('Custom active + pending allowance').fill('12');
    await allowanceSection.getByLabel('Administrative reason (required)').fill('Pilot custom allowance');
    await allowanceSection.getByRole('button', { name: 'Save custom allowance' }).click();
    await expect(page.getByRole('status')).toContainText('Custom listing allowance saved');

    await allowanceSection.getByLabel('Administrative reason (required)').fill('Return to business default');
    await allowanceSection.getByRole('button', { name: /Reset to default/ }).click();
    await expect(page.getByRole('status')).toContainText('reset to the account-type default');

    // Zero allowance allowed on zero-usage seller (and auth user_id never leaked)
    await page.goto(`/en/admin/sellers/${zeroPublicId}`);
    expect(await page.content()).not.toContain(zeroId);
    const zeroAllowanceSection = page.locator('section').filter({ hasText: 'Per-seller listing allowance' });
    await zeroAllowanceSection.getByLabel('Custom active + pending allowance').fill('0');
    await zeroAllowanceSection.getByLabel('Administrative reason (required)').fill('Zero quota while onboarding');
    await zeroAllowanceSection.getByRole('button', { name: 'Save custom allowance' }).click();
    await expect(page.getByRole('status')).toContainText('Custom listing allowance saved');

    // 5. Moderation: hide coach -> verify ALL 5 public surfaces revoked -> escalate to suspended -> verify retention & audit
    await page.goto(`/en/admin/sellers/${coachPublicId}`);
    const modSection = page.locator('section').filter({ hasText: 'Seller account moderation' });
    await modSection.getByLabel('Hide seller account').check();
    await modSection.getByLabel('Moderation reason (required)').fill('Synthetic pilot hide verification');
    await modSection.getByRole('checkbox').check();
    await modSection.getByRole('button', { name: 'Apply moderation status' }).click();
    await expect(page.getByRole('status')).toContainText('Seller account hidden');

    // Verify immediate revocation across public profile, QR, listing detail, WhatsApp contact, and ETag media!
    expect((await anonContext.request.get(`/en/@${coachUsername}`)).status()).toBe(404);
    const qrAfterHide = await anonContext.request.get(`/api/profiles/${coachPublicId}`, { maxRedirects: 0 });
    expect(qrAfterHide.status()).toBe(404);
    expect(qrAfterHide.headers()['cache-control']).toContain('no-store');
    expect((await anonContext.request.get(`/en/equipment/${listingId}`)).status()).toBe(404);
    expect((await anonContext.request.get(`/api/contact/${listingId}`, { maxRedirects: 0 })).status()).toBe(404);
    const mediaAfterHide = await anonContext.request.get(publicMediaUrl, { headers: { 'if-none-match': etag! } });
    expect(mediaAfterHide.status()).toBe(404);
    expect(mediaAfterHide.headers()['cache-control']).toContain('no-store');

    // Escalate hidden -> suspended
    const modSectionAfterHide = page.locator('section').filter({ hasText: 'Seller account moderation' });
    await modSectionAfterHide.getByLabel('Moderation reason (required)').fill('Synthetic escalation to suspended');
    await modSectionAfterHide.getByRole('checkbox').check();
    await modSectionAfterHide.getByRole('button', { name: 'Escalate to suspended' }).click();
    await expect(page.getByRole('status')).toContainText('Seller account suspended');
    await expect(page.getByText('This seller account is suspended.')).toBeVisible();

    // Saved listing status and historical photos retained (owner private access & admin photo inspection still work)
    const listingAfterSuspend = await coachRpc('get_my_listing', { p_listing_id: listingId });
    expect(listingAfterSuspend.status).toBe('active');
    expect((await sellerPage.request.get(`/api/media/${coverAsset}`)).status()).toBe(200);
    expect((await page.request.get(`/api/admin/listings/${listingId}/photos/${coverAsset}`)).status()).toBe(200);

    // Verify audit activity labels on Seller Detail and Admin A Overview (EN + AR)
    const sellerActivity = page.getByRole('region', { name: 'Recent moderation activity' });
    await expect(sellerActivity).toContainText('Suspended seller account');
    await expect(sellerActivity).toContainText('Hid seller account');
    await expect(sellerActivity).toContainText('Updated seller account type');

    await page.goto('/en/admin');
    const overviewActivity = page.getByRole('region', { name: 'Recent activity' });
    await expect(overviewActivity).toContainText('Suspended seller account');
    await expect(overviewActivity).toContainText(`@${coachUsername}`);

    await page.goto('/ar/admin');
    const overviewActivityAr = page.getByRole('region', { name: 'النشاط الأخير' });
    await expect(overviewActivityAr).toContainText('تعليق حساب البائع');

    // 6. Immediate role revocation denies Admin C routes
    operator(`update private.admin_roles set revoked_at=now() where user_id='${actorId}';`);
    expect((await page.goto('/en/admin/sellers'))?.status()).toBe(404);
    expect((await page.goto(`/en/admin/sellers/${coachPublicId}`))?.status()).toBe(404);
  } finally {
    operator(`update private.admin_roles set revoked_at=now() where user_id='${actorId}';`);
    // Ensure synthetic seller listing is not left active/pending
    const currentListing = await coachClient.rpc('get_my_listing', { p_listing_id: listingId });
    if (currentListing.data && ['active', 'pending', 'reserved'].includes(currentListing.data.status)) {
      await coachClient.rpc('withdraw_listing', { p_listing_id: listingId, p_expected_version: currentListing.data.version });
    }
    await sellerContext.close();
    await anonContext.close();
  }
});
