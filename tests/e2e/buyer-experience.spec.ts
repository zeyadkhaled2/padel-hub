import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import jsQR from 'jsqr';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });

const VIEWPORTS = [320, 390, 768, 1024, 1440] as const;

async function assertNoOverflow(page: Page, contextLabel: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, `${contextLabel} overflowed by ${overflow}px`).toBeLessThanOrEqual(1);
}

function approveSyntheticBuyerTestListing(id: string) {
  if (process.env.PADELHUB_AUTH_E2E !== '1' || !/^[a-f0-9-]{36}$/.test(id)) {
    throw new Error('Local test listing required');
  }
  execFileSync(
    'docker',
    ['exec', '-i', 'supabase_db_padelhub-local', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'],
    {
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
      input: `
begin;
do $$ begin
  if not exists(
    select 1 from public.listings l
    join auth.users u on u.id = l.seller_id
    where l.id = '${id}' and u.email like 'uib-%@example.test'
  ) then
    raise exception 'Only synthetic UI-B browser-test inventory may be approved';
  end if;
end $$;
create temp table uib_review_actor(id uuid default gen_random_uuid());
insert into uib_review_actor default values;
insert into auth.users(id, email_confirmed_at) select id, now() from uib_review_actor;
insert into private.admin_roles(user_id, role) select id, 'admin' from uib_review_actor;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', id,
    'aal', 'aal2',
    'session_id', gen_random_uuid(),
    'amr', jsonb_build_array(
      jsonb_build_object('method', 'password', 'timestamp', 1795000000),
      jsonb_build_object('method', 'totp', 'timestamp', 1795000001)
    )
  )::text,
  true
) from uib_review_actor;
set local role authenticated;
do $$ declare snapshot jsonb; begin
  snapshot := public.admin_get_listing_review('${id}');
  perform public.admin_approve_listing(
    '${id}',
    (snapshot->'listing'->>'version')::integer,
    (snapshot->'listing'->>'content_version')::integer,
    (snapshot->'profile'->>'version')::integer,
    snapshot->'media_manifest'
  );
end $$;
reset role;
update private.admin_roles set revoked_at = now() where user_id in (select id from uib_review_actor);
commit;`,
    },
  );
}

test('demo product detail and seller storefront fit responsive matrix in EN/AR light/dark', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  if (info.project.name === 'desktop') {
    for (const width of VIEWPORTS) {
      await page.setViewportSize({ width, height: 900 });
      for (const locale of ['en', 'ar'] as const) {
        await page.goto(`/${locale}/demo/equipment/head-delta-motion`);
        await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Head Delta Motion');
        await expect(page.getByText(locale === 'en' ? 'Before you meet & buy' : 'قبل المقابلة والشراء')).toBeVisible();
        for (const theme of ['light', 'dark'] as const) {
          await page
            .locator('.theme-switch input[value="' + theme + '"]').check();
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
          await assertNoOverflow(page, `demo detail ${locale} ${theme} ${width}px`);
        }

        await page.goto(`/${locale}/demo/sellers/omar_padel`);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(
          locale === 'en' ? 'Omar Hassan' : 'عمر حسن',
        );
        await expect(page.locator('.listing-card')).toHaveCount(3);
        await assertNoOverflow(page, `demo seller ${locale} ${width}px`);
      }
    }
  } else {
    await page.goto('/en/demo/equipment/head-delta-motion');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Head Delta Motion');
    await assertNoOverflow(page, 'demo detail mobile');
    await page.getByRole('link', { name: /Omar Hassan/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Omar Hassan');
    await assertNoOverflow(page, 'demo seller mobile');
  }

  expect(errors).toEqual([]);
});

test.describe('live buyer experience (UI-B)', () => {
  test.skip(process.env.PADELHUB_AUTH_E2E !== '1', 'Requires local Supabase Auth and Storage');
  test.setTimeout(150_000);

  test('product gallery, category states, storefronts, QR sharing, report dialog and responsive matrix', async ({
    page,
    browser,
  }, info) => {
    const supabaseUrl = process.env.PADELHUB_SUPABASE_URL!;
    if (!['127.0.0.1', 'localhost'].includes(new URL(supabaseUrl).hostname)) {
      throw new Error('Local Supabase only');
    }

    const service = createClient(supabaseUrl, process.env.PADELHUB_SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });

    const suffix = `${Date.now()}${info.project.name === 'mobile' ? 'm' : 'd'}`;
    const password = 'Local-uib-test-824!';
    const sellerEmail = `uib-seller-${suffix}@example.test`;
    const emptyBizEmail = `uib-biz-${suffix}@example.test`;
    const reporterEmail = `uib-reporter-${suffix}@example.test`;

    const [sellerUser, bizUser, reporterUser] = await Promise.all([
      service.auth.admin.createUser({ email: sellerEmail, password, email_confirm: true }),
      service.auth.admin.createUser({ email: emptyBizEmail, password, email_confirm: true }),
      service.auth.admin.createUser({ email: reporterEmail, password, email_confirm: true }),
    ]);
    if (sellerUser.error || bizUser.error || reporterUser.error) {
      throw new Error('Failed to create UI-B test users');
    }

    const sellerId = sellerUser.data.user.id;
    const sellerUsername = `uib_s_${suffix}`;
    const bizUsername = `uib_b_${suffix}`;

    const sellerClient = createClient(supabaseUrl, process.env.PADELHUB_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false },
    });
    await sellerClient.auth.signInWithPassword({ email: sellerEmail, password });
    const sellerRpc = async (name: string, args: Record<string, unknown> = {}) => {
      const res = await sellerClient.rpc(name, args);
      if (res.error) throw new Error(`Seller RPC ${name}: ${res.error.code} ${res.error.message}`);
      return res.data;
    };

    const bizClient = createClient(supabaseUrl, process.env.PADELHUB_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false },
    });
    await bizClient.auth.signInWithPassword({ email: emptyBizEmail, password });
    const bizRpc = async (name: string, args: Record<string, unknown> = {}) => {
      const res = await bizClient.rpc(name, args);
      if (res.error) throw new Error(`Biz RPC ${name}: ${res.error.code} ${res.error.message}`);
      return res.data;
    };

    // Configure active seller profile
    await sellerRpc('create_seller_profile', {
      p_username: sellerUsername,
      p_display_name: 'Karim El-Masry',
      p_governorate_slug: 'cairo',
      p_account_type: 'individual',
    });
    await sellerRpc('update_seller_profile', {
      p_expected_version: 1,
      p_patch: {
        display_name: 'Karim El-Masry',
        governorate_slug: 'cairo',
        account_type: 'individual',
        district_text: 'Maadi',
        bio: 'Regular club player in Maadi. Upgrading my main racket and clearing spare court gear.',
        favorite_racket: 'Bullpadel Vertex 04',
        is_public: true,
      },
    });
    await sellerRpc('update_my_contact', {
      p_expected_profile_version: 2,
      p_expected_contact_version: 1,
      p_whatsapp_e164: '+201000000088',
      p_public_contact_consent: true,
    });

    // Configure empty public Business seller profile
    await bizRpc('create_seller_profile', {
      p_username: bizUsername,
      p_display_name: 'Courtside Gear Egypt',
      p_governorate_slug: 'giza',
      p_account_type: 'business',
    });
    await bizRpc('update_seller_profile', {
      p_expected_version: 1,
      p_patch: {
        display_name: 'Courtside Gear Egypt',
        governorate_slug: 'giza',
        account_type: 'business',
        district_text: 'Sheikh Zayed',
        bio: 'Padel equipment shop in Sheikh Zayed. Fresh stock drops weekly.',
        favorite_racket: null,
        is_public: true,
      },
    });

    // Load realistic demo artwork buffers to attach as distinct WebP listing photos
    const photoSources = await Promise.all([
      readFile(join(process.cwd(), 'public/images/demo/racket-court.webp')),
      readFile(join(process.cwd(), 'public/images/demo/racket-coral.webp')),
      readFile(join(process.cwd(), 'public/images/demo/balls.webp')),
    ]);
    const photoBuffers = await Promise.all(
      photoSources.map((buf) =>
        sharp(buf).resize(800, 600, { fit: 'cover' }).webp({ quality: 82 }).toBuffer(),
      ),
    );

    const attachPhotos = async (
      listingId: string,
      startVersion: number,
      indices: number[],
    ) => {
      let version = startVersion;
      for (const idx of indices) {
        const bytes = photoBuffers[idx % photoBuffers.length];
        const hash = createHash('sha256').update(bytes).digest('hex');
        const asset = randomUUID();
        const attempt = randomUUID();
        const manifest: Record<string, unknown> = {};
        for (const variant of ['thumb', 'card', 'full']) {
          const key = `processed/${asset}/${attempt}/${variant}.webp`;
          const upload = await service.storage
            .from('media-private')
            .upload(key, bytes, { contentType: 'image/webp' });
          if (upload.error) throw new Error(`Photo upload failed: ${upload.error.message}`);
          manifest[variant] = { key, sha256: hash, bytes: bytes.length };
        }
        const attached = await service.rpc('save_listing_photo', {
          p_owner: sellerId,
          p_listing: listingId,
          p_version: version,
          p_asset: asset,
          p_attempt: attempt,
          p_mime: 'image/webp',
          p_bytes: bytes.length * 3,
          p_width: 800,
          p_height: 600,
          p_hash: hash,
          p_manifest: manifest,
        });
        if (attached.error) throw new Error(`Photo attach failed: ${attached.error.message}`);
        version++;
      }
      return version;
    };

    const createdIds: string[] = [];

    try {
      // 1) Used racket with full disclosures, negotiable price, optional specs, and 3 photos
      const usedRacket = await sellerRpc('create_listing_draft', { p_category: 'rackets' });
      createdIds.push(usedRacket.id);
      await sellerRpc('update_listing_draft', {
        p_listing_id: usedRacket.id,
        p_expected_version: 1,
        p_patch: {
          title: `Bullpadel Vertex 04 Comfort ${suffix}`,
          brand_slug: 'bullpadel',
          model: 'Vertex 04 Comfort',
          description:
            'Played around 15 matches on indoor turf. Fresh overgrip installed this week, includes original protective cover. Happy to meet at Maadi clubs for inspection.',
          governorate_slug: 'cairo',
          district_text: 'Maadi',
          condition: 'used',
          condition_disclosure:
            'Light cosmetic marks on the upper bumper guard from normal court play. Carbon face texture remains sharp and responsive.',
          racket_damage_repair_disclosure:
            'No structural cracks, no core rattle, and no prior carbon repairs.',
          offer_type: 'sale',
          price_egp: 6200,
          is_negotiable: true,
          racket_year: 2025,
          racket_weight_grams: 365,
          racket_shape: 'diamond',
        },
      });
      const vRacket = await attachPhotos(usedRacket.id, 2, [0, 1, 2]);
      await sellerRpc('submit_listing', {
        p_listing_id: usedRacket.id,
        p_expected_version: vRacket,
      });
      approveSyntheticBuyerTestListing(usedRacket.id);

      // 2) Padel shoes with EU half size (43.5)
      const shoes = await sellerRpc('create_listing_draft', { p_category: 'shoes' });
      createdIds.push(shoes.id);
      await sellerRpc('update_listing_draft', {
        p_listing_id: shoes.id,
        p_expected_version: 1,
        p_patch: {
          title: `Adidas Barricade Padel ${suffix}`,
          brand_slug: 'adidas',
          model: 'Barricade Clay',
          description: 'Tried indoors once, sizing ran half a size tight.',
          governorate_slug: 'giza',
          district_text: 'Sheikh Zayed',
          condition: 'new',
          condition_disclosure: 'Unworn on court, original box and tags included.',
          offer_type: 'sale',
          price_egp: 4100,
          is_negotiable: false,
          shoe_size_eu: 43.5,
        },
      });
      const vShoes = await attachPhotos(shoes.id, 2, [1, 0, 2]);
      await sellerRpc('submit_listing', { p_listing_id: shoes.id, p_expected_version: vShoes });
      approveSyntheticBuyerTestListing(shoes.id);

      // 3) Swap-only racket (price_egp = null)
      const swapRacket = await sellerRpc('create_listing_draft', { p_category: 'rackets' });
      createdIds.push(swapRacket.id);
      await sellerRpc('update_listing_draft', {
        p_listing_id: swapRacket.id,
        p_expected_version: 1,
        p_patch: {
          title: `Nox AT10 Genius 18K ${suffix}`,
          brand_slug: 'nox',
          model: 'AT10 Genius 18K',
          description: 'Great control frame, looking to switch to a slightly head-heavier model.',
          governorate_slug: 'cairo',
          district_text: 'New Cairo',
          condition: 'used',
          condition_disclosure: 'Minor paint rub near the throat; frame is solid.',
          racket_damage_repair_disclosure: 'No cracks or repairs.',
          offer_type: 'swap',
          price_egp: null,
          is_negotiable: false,
          swap_preference: 'Looking to swap for Bullpadel Hack 03 or Head Speed Motion in similar condition.',
          racket_year: 2024,
          racket_weight_grams: 360,
          racket_shape: 'teardrop',
        },
      });
      const vSwap = await attachPhotos(swapRacket.id, 2, [1, 2, 0]);
      await sellerRpc('submit_listing', {
        p_listing_id: swapRacket.id,
        p_expected_version: vSwap,
      });
      approveSyntheticBuyerTestListing(swapRacket.id);

      // 4) Sold racket (approved, then marked sold -> contact disabled)
      const soldRacket = await sellerRpc('create_listing_draft', { p_category: 'rackets' });
      createdIds.push(soldRacket.id);
      await sellerRpc('update_listing_draft', {
        p_listing_id: soldRacket.id,
        p_expected_version: 1,
        p_patch: {
          title: `Head Extreme Pro Sold ${suffix}`,
          brand_slug: 'head',
          model: 'Extreme Pro',
          description: 'Well cared for tournament racket.',
          governorate_slug: 'cairo',
          condition: 'used',
          condition_disclosure: 'Normal surface wear only.',
          racket_damage_repair_disclosure: 'None.',
          offer_type: 'sale',
          price_egp: 5400,
          is_negotiable: false,
        },
      });
      const vSold = await attachPhotos(soldRacket.id, 2, [0, 1, 2]);
      await sellerRpc('submit_listing', { p_listing_id: soldRacket.id, p_expected_version: vSold });
      approveSyntheticBuyerTestListing(soldRacket.id);
      const soldCurrent = await sellerRpc('get_my_listing', { p_listing_id: soldRacket.id });
      await sellerRpc('change_listing_status', {
        p_listing_id: soldRacket.id,
        p_expected_version: soldCurrent.version,
        p_action: 'sold',
      });

      const pageErrors: string[] = [];
      page.on('pageerror', (err) => pageErrors.push(err.message));

      // --- A. Used Racket Detail + Interactive Gallery + Keyboard/Thumbnail Navigation ---
      await page.goto(`/en/equipment/${usedRacket.id}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        `Bullpadel Vertex 04 Comfort ${suffix}`,
      );
      await expect(page.locator('.gallery-counter')).toHaveText('1 / 3');
      const mainImg = page.locator('.gallery-main-image');
      await expect
        .poll(() => mainImg.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
        .toBe(true);

      // Next button & thumbnail selection
      await page.getByRole('button', { name: 'Next photo' }).click();
      await expect(page.locator('.gallery-counter')).toHaveText('2 / 3');
      const thumb3 = page.getByRole('button', { name: 'View photo 3 of 3' });
      await thumb3.click();
      await expect(page.locator('.gallery-counter')).toHaveText('3 / 3');
      await expect(thumb3).toHaveAttribute('aria-pressed', 'true');

      // Keyboard navigation (Home, ArrowRight, ArrowLeft)
      await thumb3.focus();
      await page.keyboard.press('Home');
      await expect(page.locator('.gallery-counter')).toHaveText('1 / 3');
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('.gallery-counter')).toHaveText('2 / 3');
      await page.keyboard.press('ArrowLeft');
      await expect(page.locator('.gallery-counter')).toHaveText('1 / 3');

      // Prominent disclosures, specs, seller link, safety, and WhatsApp CTA
      await expect(page.getByRole('heading', { name: 'What the seller says about condition' })).toBeVisible();
      await expect(page.getByText('No structural cracks, no core rattle, and no prior carbon repairs.')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Model year', exact: true })).toBeVisible();
      await expect(page.getByText('2025', { exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Weight (grams)', exact: true })).toBeVisible();
      await expect(page.getByText('365', { exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Racket shape', exact: true })).toBeVisible();
      await expect(page.getByText('Diamond', { exact: true })).toBeVisible();
      await expect(page.getByText('Negotiable')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Contact on WhatsApp' })).toHaveAttribute(
        'href',
        `/api/contact/${usedRacket.id}?locale=en`,
      );
      const sellerCardLink = page.locator('.detail-seller-link');
      await expect(sellerCardLink).toHaveAttribute('href', `/en/@${sellerUsername}`);

      // Privacy boundary: no raw phone or storage keys leaked
      const htmlContent = await page.content();
      expect(htmlContent).not.toContain('+201000000088');
      expect(htmlContent).not.toContain('processed/');

      // Server-controlled WhatsApp redirect check
      const waCheck = await page.request.get(`/api/contact/${usedRacket.id}?locale=en`, {
        maxRedirects: 0,
      });
      expect(waCheck.status()).toBe(302);
      expect(waCheck.headers()['cache-control']).toContain('no-store');
      expect(waCheck.headers().location).toMatch(/^https:\/\/wa\.me\/201000000088\?text=/);

      // Mobile sticky contact bar check on mobile project
      if (info.project.name === 'mobile') {
        await expect(page.locator('.mobile-contact-bar')).toHaveCount(0);
        await page.locator('.detail-safety-panel').scrollIntoViewIfNeeded();
        await expect(page.locator('.mobile-contact-bar')).toBeVisible();
        await expect(page.locator('.mobile-contact-bar a')).toHaveAttribute(
          'href',
          `/api/contact/${usedRacket.id}?locale=en`,
        );
        await assertNoOverflow(page, 'used racket mobile sticky bar');
      }

      // --- B. Shoe Listing with EU Half Size ---
      await page.goto(`/en/equipment/${shoes.id}`);
      await expect(page.getByRole('heading', { name: 'Shoe size (EU)', exact: true })).toBeVisible();
      await expect(page.getByText('43.5', { exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Model year', exact: true })).toHaveCount(0);

      // --- C. Swap-Only Racket ---
      await page.goto(`/en/equipment/${swapRacket.id}`);
      await expect(page.locator('.detail-price')).toHaveText('Swap only');
      await expect(
        page.getByText('Looking to swap for Bullpadel Hack 03 or Head Speed Motion in similar condition.'),
      ).toBeVisible();
      await expect(page.getByRole('link', { name: 'Contact on WhatsApp' })).toBeVisible();

      // --- D. Sold Listing State (Disabled Contact & No Availability Confirmation Prompt) ---
      // Populate a historical last_confirmed_available_at on the sold fixture to verify inactive
      // listings never display "Availability last confirmed" or "Ask the seller to confirm...".
      execFileSync(
        'docker',
        ['exec', '-i', 'supabase_db_padelhub-local', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'],
        {
          stdio: ['pipe', 'pipe', 'pipe'],
          input: `update public.listings set last_confirmed_available_at = now() where id = '${soldRacket.id}';`,
        },
      );
      await page.goto(`/en/equipment/${soldRacket.id}`);
      await expect(page.locator('.condition')).toContainText('Sold');
      await expect(page.getByText('This equipment has been marked as sold.')).toBeVisible();
      await expect(page.getByText('Inquiries are unavailable for this listing.')).toBeVisible();
      await expect(page.locator('.detail-availability-note')).toHaveCount(0);
      await expect(page.getByText(/Availability last confirmed/i)).toHaveCount(0);
      await expect(page.getByText('Ask the seller to confirm availability and condition.')).toHaveCount(0);
      await expect(page.getByText('Ask the seller to confirm actual condition and current availability.')).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Contact on WhatsApp' })).toHaveCount(0);
      expect(
        (await page.request.get(`/api/contact/${soldRacket.id}`, { maxRedirects: 0 })).status(),
      ).toBe(404);

      // --- E. Public Seller Storefront + QR Sharing + Copy Link ---
      await page.goto(`/en/@${sellerUsername}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Karim El-Masry');
      await expect(page.getByText(`@${sellerUsername}`)).toBeVisible();
      await expect(page.getByText('Maadi', { exact: true })).toBeVisible();
      await expect(page.locator('.listing-card')).toHaveCount(3); // Only active listings, NOT sold listing!
      expect(await page.content()).not.toContain('+201000000088');

      // Verify Copy profile link produces accessible status feedback (or manual copy fallback)
      await page.getByRole('button', { name: 'Copy profile link', exact: true }).click();
      await expect(page.getByRole('status')).toBeVisible();

      // Show QR + verify decoded PNG + download + Hide QR
      await page.getByRole('button', { name: 'Show QR code', exact: true }).click();
      const qrImg = page.getByRole('img', { name: `QR code for @${sellerUsername}`, exact: true });
      await expect(qrImg).toBeVisible();
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('link', { name: 'Download QR code', exact: true }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe(`raketna-${sellerUsername}-qr.png`);
      const pngBytes = await readFile((await download.path())!);
      const decoded = await sharp(pngBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const qrCode = jsQR(
        new Uint8ClampedArray(decoded.data),
        decoded.info.width,
        decoded.info.height,
      );
      expect(qrCode?.data).toMatch(/^http:\/\/127\.0\.0\.1:3100\/api\/profiles\/[a-f0-9-]{36}$/);
      await page.getByRole('button', { name: 'Hide QR code', exact: true }).click();
      await expect(qrImg).toHaveCount(0);

      // Verify Arabic RTL gallery navigation (ArrowLeft advances in RTL, ArrowRight goes back)
      await page.goto(`/ar/equipment/${usedRacket.id}`);
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.locator('.gallery-counter')).toHaveText('1 / 3');
      await page.getByRole('button', { name: 'الصورة التالية' }).click();
      await expect(page.locator('.gallery-counter')).toHaveText('2 / 3');
      await page.getByRole('button', { name: 'عرض الصورة 2 من 3' }).focus();
      await page.keyboard.press('ArrowLeft');
      await expect(page.locator('.gallery-counter')).toHaveText('3 / 3');
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('.gallery-counter')).toHaveText('2 / 3');

      // --- F. Empty Business Seller Storefront ---
      await page.goto(`/en/@${bizUsername}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Courtside Gear Egypt');
      await expect(page.getByText('Business', { exact: true })).toBeVisible();
      await expect(
        page.getByText('Business account · describes the account type, not an identity verification.'),
      ).toBeVisible();
      await expect(page.getByRole('heading', { name: 'No available listings right now.' })).toBeVisible();
      await expect(page.locator('.listing-card')).toHaveCount(0);

      // --- G. Report Modal Dialog: Focus, Escape, Unauthenticated Input Retention & Verified Submit ---
      await page.goto(`/en/equipment/${usedRacket.id}`);
      const reportTrigger = page.getByRole('button', { name: 'Report content', exact: true });
      await reportTrigger.click();
      const dialog = page.locator('dialog.report-dialog');
      await expect(dialog).toHaveAttribute('open', '');
      await expect(page.getByRole('heading', { name: 'Report this listing' })).toBeVisible();

      // Escape closes modal and restores focus to trigger
      await page.keyboard.press('Escape');
      await expect(dialog).not.toHaveAttribute('open', '');
      await expect(reportTrigger).toBeFocused();

      // Anonymous submission prompts sign-in while preserving entered details
      await reportTrigger.click();
      await page.getByLabel('Reason').selectOption('misleading');
      await page.getByLabel('Details (optional)').fill('Checking unauthenticated draft retention');
      await page.getByRole('button', { name: 'Send report', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Please sign in with a verified account first.');
      await expect(page.getByLabel('Details (optional)')).toHaveValue('Checking unauthenticated draft retention');
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();

      // Verified user submits report cleanly + captures screenshots in desktop project
      const reporterCtx = await browser.newContext({ baseURL: 'http://127.0.0.1:3100' });
      const reporterPage = await reporterCtx.newPage();
      await reporterPage.goto('/en/auth/signin');
      await reporterPage.getByLabel('Email address').fill(reporterEmail);
      await reporterPage.getByLabel('Password', { exact: true }).fill(password);
      await reporterPage.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(reporterPage).toHaveURL(/\/en\/account$/);

      await reporterPage.goto(`/en/equipment/${usedRacket.id}`);
      await reporterPage.getByRole('button', { name: 'Report content', exact: true }).click();
      await reporterPage.getByLabel('Reason').selectOption('other');
      // Verify localized validation when maxLength is bypassed without losing user input
      await reporterPage.locator('dialog.report-dialog textarea[name="details"]').evaluate((el: HTMLTextAreaElement) => {
        el.removeAttribute('maxlength');
      });
      await reporterPage.getByLabel('Details (optional)').fill('x'.repeat(1005));
      await reporterPage.getByRole('button', { name: 'Send report', exact: true }).click();
      await expect(reporterPage.getByRole('status')).toContainText('Keep report details within 1000 characters.');
      await expect(reporterPage.getByLabel('Details (optional)')).toHaveValue('x'.repeat(1005));

      // Valid submission succeeds cleanly
      await reporterPage.getByLabel('Details (optional)').fill(`UI-B verified report ${suffix}`);
      await reporterPage.getByRole('button', { name: 'Send report', exact: true }).click();
      await expect(reporterPage.getByRole('status')).toContainText('Report received. Thank you.');
      await expect(reporterPage.getByRole('button', { name: 'Send report', exact: true })).toBeDisabled();
      await reporterCtx.close();

      // --- H. Responsive Viewport Matrix & 9 Visual Verification Screenshots (Desktop project) ---
      if (info.project.name === 'desktop') {
        const shotsDir = join(process.cwd(), '.cache', 'ui-b-screenshots');
        await mkdir(shotsDir, { recursive: true });

        // Check full 5-width responsive matrix in EN/AR light/dark
        for (const width of VIEWPORTS) {
          await page.setViewportSize({ width, height: 900 });
          for (const locale of ['en', 'ar'] as const) {
            await page.goto(`/${locale}/equipment/${usedRacket.id}`);
            await assertNoOverflow(page, `live detail ${locale} ${width}px`);
            await page.goto(`/${locale}/@${sellerUsername}`);
            await assertNoOverflow(page, `live storefront ${locale} ${width}px`);
          }
        }

        const waitForImages = async (targetPage: Page) => {
          await expect
            .poll(async () =>
              targetPage.evaluate(() => {
                const imgs = Array.from(document.querySelectorAll('img'));
                return imgs.every((img) => img.complete && img.naturalWidth > 0);
              }),
            )
            .toBe(true);
        };

        // Capture all 9 required screenshots for visual inspection
        // 1. Product details — English desktop light (1440px)
        await page.setViewportSize({ width: 1440, height: 960 });
        await page.goto(`/en/equipment/${usedRacket.id}`);
        await page.locator('.theme-switch input[value="light"]').check();
        await expect.poll(() =>
          page.locator('.detail-whatsapp-cta').evaluate((el) => getComputedStyle(el).color),
        ).toBe('rgb(255, 255, 255)');
        await waitForImages(page);
        await page.screenshot({ path: join(shotsDir, '1-product-detail-en-desktop-light.png'), fullPage: true });

        // 2. Product details — English desktop dark (1440px)
        await page.locator('.theme-switch input[value="dark"]').check();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
        await expect.poll(() =>
          page.locator('.detail-whatsapp-cta').evaluate((el) => getComputedStyle(el).color),
        ).toBe('rgb(8, 28, 20)');
        await expect.poll(() =>
          page.locator('.detail-whatsapp-cta').evaluate((el) => getComputedStyle(el).backgroundColor),
        ).toBe('rgb(78, 201, 155)');
        await waitForImages(page);
        await page.screenshot({ path: join(shotsDir, '2-product-detail-en-desktop-dark.png'), fullPage: true });

        // 3. Product details — Arabic mobile RTL (390px, light)
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(`/ar/equipment/${usedRacket.id}`);
        await page.locator('.theme-switch input[value="light"]').check();
        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
        await expect.poll(() =>
          page.locator('.detail-whatsapp-cta').evaluate((el) => getComputedStyle(el).color),
        ).toBe('rgb(255, 255, 255)');
        await waitForImages(page);
        await page.screenshot({ path: join(shotsDir, '3-product-detail-ar-mobile-rtl.png'), fullPage: true });

        // 4. Product details — English mobile (390px, light)
        await page.goto(`/en/equipment/${usedRacket.id}`);
        await page.locator('.theme-switch input[value="light"]').check();
        await expect.poll(() =>
          page.locator('.detail-whatsapp-cta').evaluate((el) => getComputedStyle(el).color),
        ).toBe('rgb(255, 255, 255)');
        await waitForImages(page);
        await page.screenshot({ path: join(shotsDir, '4-product-detail-en-mobile.png'), fullPage: true });

        // 5. Seller storefront — desktop (1440px, light)
        await page.setViewportSize({ width: 1440, height: 960 });
        await page.goto(`/en/@${sellerUsername}`);
        await expect.poll(() =>
          page.locator('.share-action-btn').first().evaluate((el) => getComputedStyle(el).backgroundColor),
        ).toBe('rgb(255, 255, 255)');
        await waitForImages(page);
        await page.screenshot({ path: join(shotsDir, '5-seller-storefront-desktop.png'), fullPage: true });

        // 7. QR sharing interface (1440px, dark mode to verify white quiet zone contrast!)
        await page.locator('.theme-switch input[value="dark"]').check();
        await page.getByRole('button', { name: 'Show QR code', exact: true }).click();
        await expect(page.locator('.profile-qr img')).toBeVisible();
        await expect.poll(() =>
          page.locator('.profile-qr-download').evaluate((el) => getComputedStyle(el).color),
        ).toBe('rgb(8, 28, 20)');
        await waitForImages(page);
        await page.screenshot({ path: join(shotsDir, '7-qr-sharing-interface.png'), fullPage: true });

        // 6. Seller storefront — mobile (390px, light)
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(`/en/@${sellerUsername}`);
        await page.locator('.theme-switch input[value="light"]').check();
        await expect.poll(() =>
          page.locator('.share-action-btn').first().evaluate((el) => getComputedStyle(el).backgroundColor),
        ).toBe('rgb(255, 255, 255)');
        await waitForImages(page);
        await page.screenshot({ path: join(shotsDir, '6-seller-storefront-mobile.png'), fullPage: true });

        // 8. Buyer report interface (1440px light, modal open)
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(`/en/equipment/${usedRacket.id}`);
        await waitForImages(page);
        await page.getByRole('button', { name: 'Report content', exact: true }).click();
        await expect(page.locator('dialog.report-dialog')).toHaveAttribute('open', '');
        await page.screenshot({ path: join(shotsDir, '8-buyer-report-interface.png'), fullPage: false });
        await page.keyboard.press('Escape');

        // 9. Sold/traded listing state (1440px light)
        await page.goto(`/en/equipment/${soldRacket.id}`);
        await expect(page.getByText('This equipment has been marked as sold.')).toBeVisible();
        await waitForImages(page);
        await page.screenshot({ path: join(shotsDir, '9-sold-listing-state.png'), fullPage: true });
      }

      // Mark swap-only racket as traded after storefront screenshots and verify traded state disables contact
      const swapCurrent = await sellerRpc('get_my_listing', { p_listing_id: swapRacket.id });
      await sellerRpc('change_listing_status', {
        p_listing_id: swapRacket.id,
        p_expected_version: swapCurrent.version,
        p_action: 'traded',
      });
      await page.goto(`/en/equipment/${swapRacket.id}`);
      await expect(page.locator('.condition')).toContainText('Traded');
      await expect(page.getByText('This equipment has been marked as traded.')).toBeVisible();
      await expect(page.locator('.detail-availability-note')).toHaveCount(0);
      await expect(page.getByText(/Availability last confirmed/i)).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Contact on WhatsApp' })).toHaveCount(0);
      expect(
        (await page.request.get(`/api/contact/${swapRacket.id}`, { maxRedirects: 0 })).status(),
      ).toBe(404);

      expect(pageErrors).toEqual([]);
    } finally {
      for (const id of createdIds) {
        try {
          const current = await sellerRpc('get_my_listing', { p_listing_id: id });
          if (['active', 'pending', 'reserved'].includes(current.status)) {
            await sellerRpc('withdraw_listing', {
              p_listing_id: id,
              p_expected_version: current.version,
            });
          }
        } catch {
          // Best-effort cleanup
        }
      }
    }
  });
});
