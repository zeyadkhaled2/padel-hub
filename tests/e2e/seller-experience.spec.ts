import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';
import jsQR from 'jsqr';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });

function localDbSql(sql: string) {
  execFileSync(
    'docker',
    ['exec', '-i', 'supabase_db_padelhub-local', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'],
    { input: sql, stdio: ['pipe', 'pipe', 'pipe'] },
  );
}

function approveSyntheticSellerTestListing(listingId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(listingId)) throw new Error('Invalid listing id');
  const adminId = '00000000-0000-4000-8000-0000000000a2';
  localDbSql(`
    begin;
    do $$ begin
      if not exists(select 1 from public.listings l join auth.users u on u.id = l.seller_id where l.id = '${listingId}' and u.email like 'uic-seller-%@example.test') then
        raise exception 'Only synthetic UI-C seller-test inventory may be approved';
      end if;
    end $$;
    insert into auth.users(id, email_confirmed_at) values ('${adminId}', now()) on conflict (id) do nothing;
    insert into private.admin_roles(user_id, role) values ('${adminId}', 'admin')
      on conflict (user_id) do update set revoked_at = null;
    set local role authenticated;
    set local request.jwt.claims = '{"sub":"${adminId}","aal":"aal2","session_id":"00000000-0000-4000-8000-0000000000a2","amr":[{"method":"password","timestamp":1795000000},{"method":"totp","timestamp":1795000001}]}';
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

function rejectLocalListing(listingId: string, reason: string) {
  if (!/^[0-9a-f-]{36}$/i.test(listingId)) throw new Error('Invalid listing id');
  const escaped = reason.replaceAll("'", "''");
  const adminId = '00000000-0000-4000-8000-0000000000a2';
  localDbSql(`
    begin;
    insert into auth.users(id, email_confirmed_at) values ('${adminId}', now()) on conflict (id) do nothing;
    insert into private.admin_roles(user_id, role) values ('${adminId}', 'admin')
      on conflict (user_id) do update set revoked_at = null;
    set local role authenticated;
    set local request.jwt.claims = '{"sub":"${adminId}","aal":"aal2","session_id":"00000000-0000-4000-8000-0000000000a2","amr":[{"method":"password","timestamp":1795000000},{"method":"totp","timestamp":1795000001}]}';
    do $$
    declare
      review jsonb := public.admin_get_listing_review('${listingId}');
    begin
      perform public.admin_reject_listing(
        '${listingId}',
        (review->'listing'->>'version')::integer,
        (review->'listing'->>'content_version')::integer,
        (review->'profile'->>'version')::integer,
        review->'media_manifest',
        '${escaped}'
      );
    end $$;
    reset role;
    update private.admin_roles set revoked_at = now() where user_id = '${adminId}';
    commit;
  `);
}

async function makePhoto(color: string, labelSeed: number): Promise<Buffer> {
  return sharp({
    create: {
      width: 640 + (labelSeed % 3) * 16,
      height: 480,
      channels: 3,
      background: color,
    },
  })
    .jpeg({ quality: 88 })
    .withMetadata()
    .toBuffer();
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/en/auth/signin');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/en\/account$/);
}

test.describe('Phase UI-C — Premium Seller Experience', () => {
  test.skip(process.env.PADELHUB_AUTH_E2E !== '1', 'Requires local Supabase Auth and Storage');
  test.setTimeout(180_000);

  test('seller dashboard, 3-4 photo rules across all 4 categories, photo manager, rejection resubmission, profile sharing, and responsive EN/AR/Light/Dark check', async ({
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
    const email = `uic-seller-${suffix}@example.test`;
    const password = 'Local-Seller-UI-C-951!';
    const username = `uic_${suffix}`;

    const createdUser = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createdUser.error || !createdUser.data.user) {
      throw new Error(`Could not create seller test user: ${createdUser.error?.message}`);
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

    const createdListingIds: string[] = [];
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const photos = await Promise.all([
      makePhoto('#14533c', 0),
      makePhoto('#2a6f54', 1),
      makePhoto('#3d5a80', 2),
      makePhoto('#c85a32', 3),
      makePhoto('#6b705c', 4),
    ]);

    try {
      // 1. Sign in and create Seller Profile (Personal, Private by default)
      await signIn(page, email, password);
      await expect(page.getByRole('heading', { name: 'Create profile' })).toBeVisible();
      await page.getByLabel('Username', { exact: true }).fill(username);
      await page.getByLabel('Display name').fill('Nadia Courtside');
      await page.getByLabel('Governorate').selectOption('cairo');
      await page.getByRole('button', { name: 'Create profile', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Profile details' })).toBeVisible();

      // 2. Verify Seller Dashboard empty onboarding state & real zero counts
      await page.goto('/en/account/listings');
      await expect(page.getByRole('heading', { name: 'My listings', exact: true })).toBeVisible();
      await expect(page.getByText('Nadia Courtside')).toBeVisible();
      await expect(page.getByText(`@${username}`)).toBeVisible();
      await expect(page.getByText('Personal', { exact: true }).first()).toBeVisible();
      await expect(page.getByText('Got gear you no longer use?')).toBeVisible();
      await expect(page.getByText('WhatsApp clicks', { exact: true })).toHaveCount(0);

      // 3. Seller Profile Management: edit Business/Personal, bio, district, favorite racket, public visibility, WhatsApp consent & QR
      await page.goto('/en/account');
      await page.getByLabel('Account type').selectOption('business');
      await expect(page.getByText('Business describes the account type. It does not mean verified.')).toBeVisible();
      await page.getByLabel('Account type').selectOption('individual');
      await page.getByLabel('District or area (optional)').fill('New Cairo');
      await page.getByLabel('Favourite racket (optional)').fill('Bullpadel Vertex 04');
      await page.getByLabel('About you (optional)').fill('Regular player in New Cairo selling well-kept court gear.');
      await expect(page.getByText(/57\s*\/\s*500/)).toBeVisible();
      await page.getByLabel('Allow my seller profile to be public').check();
      await page.getByRole('button', { name: 'Save profile details', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Saved successfully');

      await page.getByLabel('WhatsApp number (optional)').fill('+201012345678');
      await page.getByLabel(/I agree to let buyers/).check();
      await page.getByRole('button', { name: 'Save contact preferences', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Saved successfully');

      // Storefront sharing + QR code directly on /account
      await expect(page.getByText('Share this seller’s profile')).toBeVisible();
      await expect(page.getByRole('link', { name: 'View public profile' })).toHaveAttribute('href', `/en/@${username}`);
      await page.getByRole('button', { name: 'Show QR code', exact: true }).click();
      const profileQr = page.getByRole('img', { name: `QR code for @${username}`, exact: true });
      await expect(profileQr).toBeVisible();
      const qrDownloadPromise = page.waitForEvent('download');
      await page.getByRole('link', { name: 'Download QR code', exact: true }).click();
      const qrDownload = await qrDownloadPromise;
      expect(qrDownload.suggestedFilename()).toBe(`raketna-${username}-qr.png`);
      const qrPng = await readFile((await qrDownload.path())!);
      const decodedQrRaw = await sharp(qrPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const qrDecoded = jsQR(new Uint8ClampedArray(decodedQrRaw.data), decodedQrRaw.info.width, decodedQrRaw.info.height);
      expect(qrDecoded?.data).toMatch(/^http:\/\/127\.0\.0\.1:3100\/api\/profiles\/[a-f0-9-]{36}$/);
      await page.getByRole('button', { name: 'Hide QR code', exact: true }).click();
      await expect(profileQr).toHaveCount(0);

      // 4. Create Racket Draft, test field-level validation preserving entered values, conditional fields & save incomplete draft
      await page.goto('/en/account/listings');
      await page.getByLabel('Equipment category', { exact: true }).selectOption('rackets');
      await page.getByRole('button', { name: 'Create listing', exact: true }).click();
      await expect(page).toHaveURL(/\/en\/account\/listings\/([0-9a-f-]+)$/);
      const racketId = page.url().split('/').pop()!;
      createdListingIds.push(racketId);

      // Brand "Other" toggles custom brand input
      await page.getByLabel('Brand', { exact: true }).selectOption('other');
      await expect(page.getByLabel('Other brand name (only for Other)')).toBeVisible();
      await page.getByLabel('Brand', { exact: true }).selectOption('bullpadel');
      await expect(page.getByLabel('Other brand name (only for Other)')).toHaveCount(0);

      // Offer type toggles price & swap preference dynamically
      await page.getByLabel('Offer type').selectOption('swap');
      await expect(page.getByLabel('Price in EGP (whole offer)')).toHaveCount(0);
      await expect(page.getByLabel('What would you swap for?')).toBeVisible();
      await page.getByLabel('Offer type').selectOption('both');
      await expect(page.getByLabel('Price in EGP (whole offer)')).toBeVisible();
      await expect(page.getByLabel('What would you swap for?')).toBeVisible();

      // Fill complete racket fields + deliberately invalid weight to verify inline field validation & retained input
      const racketTitle = `Bullpadel Vertex 04 Hybrid ${suffix}`;
      await page.getByLabel('Listing title', { exact: true }).fill(racketTitle);
      await page.getByLabel('Model', { exact: true }).fill('Vertex 04 Hybrid');
      await page.getByLabel('Description', { exact: true }).fill('Played 6 matches indoors. Sharp rough finish, clean grip.');
      await page.getByLabel('Condition', { exact: true }).selectOption('used');
      await page.getByLabel('Condition details and wear').fill('Light court scuffs on the top protector only.');
      await page.getByLabel('Racket damage or repairs (write none if none)').fill('Zero structural cracks, zero core rattle, no prior repairs.');
      await page.getByLabel('Price in EGP (whole offer)').fill('7900');
      await page.getByLabel('What would you swap for?').fill('Open to Nox AT10 18K 2025 in clean condition.');
      await page.getByLabel('Governorate', { exact: true }).selectOption('cairo');
      await page.getByLabel('District (optional)').fill('New Cairo');
      await page.getByLabel('Model year', { exact: true }).fill('2025');
      await page.getByLabel('Weight (grams)', { exact: true }).fill('250'); // invalid (< 300)
      await page.getByLabel('Racket shape', { exact: true }).selectOption('teardrop');

      await page.locator('form.account-form').evaluate((form: HTMLFormElement) => {
        form.noValidate = true;
      });
      await page.getByRole('button', { name: 'Save draft', exact: true }).click();
      await expect(page.getByLabel('Weight (grams)', { exact: true })).toHaveAttribute('aria-invalid', 'true');
      await expect(page.getByText('Enter a whole-number weight between 300 and 420 grams, or leave blank.')).toBeVisible();
      await expect(page.getByLabel('Weight (grams)', { exact: true })).toHaveValue('250');
      await expect(page.getByLabel('Listing title', { exact: true })).toHaveValue(racketTitle);

      // Fix weight and save valid draft with 0 photos
      await page.getByLabel('Weight (grams)', { exact: true }).fill('365');
      await page.getByRole('button', { name: 'Save draft', exact: true }).click();
      await expect(page.getByRole('status')).toHaveText('Draft saved.');

      // 0 photos: clicking Submit for approval is rejected by server/DB and stays in Draft
      await expect(page.getByText('Saved photos: 0', { exact: false })).toBeVisible();
      await page.getByRole('button', { name: 'Submit for approval', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Submission needs');
      await expect(page.getByText('Status: Draft', { exact: true })).toBeVisible();

      // 5. Photo Manager Redesign: preview before upload, 0 -> 1 -> 2 (blocked) -> 3 (submit OK) -> 4 -> 5th rejected -> replace at 4
      await page.getByRole('link', { name: 'Manage photos', exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/en/account/photos\\?listing=${racketId}$`));
      await expect(page.getByText('0 of 4 photos')).toBeVisible();
      await expect(page.getByText('3 required · 4 maximum photos')).toBeVisible();
      await expect(page.locator('.photo-empty-slot')).toHaveCount(4);

      // Local preview before upload + clear selection
      await page.getByLabel('Choose equipment photo').setInputFiles({
        name: 'racket-front.jpg',
        mimeType: 'image/jpeg',
        buffer: photos[0],
      });
      await expect(page.locator('.photo-local-preview img')).toBeVisible();
      await expect(page.getByText('racket-front.jpg')).toBeVisible();
      await page.getByRole('button', { name: 'Clear', exact: true }).click();
      await expect(page.locator('.photo-local-preview')).toHaveCount(0);

      // Upload 2 photos (still below 3-photo minimum)
      for (let i = 0; i < 2; i++) {
        await page.getByLabel('Choose equipment photo').setInputFiles({
          name: `racket-${i + 1}.jpg`,
          mimeType: 'image/jpeg',
          buffer: photos[i],
        });
        await page.getByRole('button', { name: 'Upload photo', exact: true }).click();
        await expect(page.getByRole('status')).toContainText('Photo saved to your draft');
      }
      await expect(page.getByText('2 of 4 photos')).toBeVisible();
      await expect(page.locator('.photo-grid img')).toHaveCount(2);
      await expect(page.locator('.photo-empty-slot')).toHaveCount(2);

      // Navigate back to Listing Editor and verify 2 photos still cannot submit
      await page.getByRole('link', { name: 'Listing details', exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/en/account/listings/${racketId}$`));
      await expect(page.getByText('Saved photos: 2', { exact: false })).toBeVisible();
      await page.getByRole('button', { name: 'Submit for approval', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Submission needs');
      await expect(page.getByText('Status: Draft', { exact: true })).toBeVisible();

      // Upload 3rd photo -> submit succeeds
      await page.getByRole('link', { name: 'Manage photos', exact: true }).click();
      await page.getByLabel('Choose equipment photo').setInputFiles({
        name: 'racket-3.jpg',
        mimeType: 'image/jpeg',
        buffer: photos[2],
      });
      await page.getByRole('button', { name: 'Upload photo', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Photo saved to your draft');
      await expect(page.getByText('3 of 4 photos')).toBeVisible();

      await page.getByRole('link', { name: 'Listing details', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Submit for approval', exact: true })).toBeEnabled();
      await page.getByRole('button', { name: 'Submit for approval', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Submitted.');
      await expect(page.getByText('Status: Waiting for approval', { exact: true })).toBeVisible();

      // Withdraw back to draft, upload 4th photo, verify 5th rejected & replacement at 4 works without consuming extra slot
      await page.getByRole('button', { name: 'Withdraw to edit', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Returned to draft');

      await page.getByRole('link', { name: 'Manage photos', exact: true }).click();
      const fourthRespPromise = page.waitForResponse(
        (res) => res.request().method() === 'POST' && res.url().includes(`/api/listings/${racketId}/photos`),
      );
      await page.getByLabel('Choose equipment photo').setInputFiles({
        name: 'racket-4.jpg',
        mimeType: 'image/jpeg',
        buffer: photos[3],
      });
      await page.getByRole('button', { name: 'Upload photo', exact: true }).click();
      const fourthJson = await (await fourthRespPromise).json();
      await expect(page.getByText('4 of 4 photos')).toBeVisible();
      await expect(page.locator('.photo-grid img')).toHaveCount(4);
      await expect(page.locator('.photo-empty-slot')).toHaveCount(0);
      await expect(page.getByText('All 4 photo slots are filled', { exact: false })).toBeVisible();

      // 5th photo via API MUST be rejected with 409 photoLimit
      const fifthResp = await page.request.post(`/api/listings/${racketId}/photos`, {
        headers: {
          Origin: 'http://127.0.0.1:3100',
          'X-Listing-Version': String(fourthJson.version),
        },
        data: photos[4],
      });
      expect(fifthResp.status()).toBe(409);
      expect((await fifthResp.json()).error).toBe('photoLimit');

      // Replace photo #1 while at 4 photos: invalid replacement preserves original, valid replacement keeps count = 4
      const firstPhotoSrcBefore = (await page.locator('.photo-grid img').first().getAttribute('src'))!;
      await page.getByRole('button', { name: 'Replace photo', exact: true }).first().click();
      await page.getByLabel('Choose equipment photo').setInputFiles({
        name: 'corrupt.jpg',
        mimeType: 'image/jpeg',
        buffer: Buffer.from('not-an-image'),
      });
      await page.getByRole('button', { name: 'Replace photo', exact: true }).last().click();
      await expect(page.getByRole('status')).toContainText('Use a valid, still');
      await expect(page.locator('.photo-grid img').first()).toHaveAttribute('src', firstPhotoSrcBefore);

      await page.getByLabel('Choose equipment photo').setInputFiles({
        name: 'racket-1-replaced.jpg',
        mimeType: 'image/jpeg',
        buffer: photos[4],
      });
      await page.getByRole('button', { name: 'Replace photo', exact: true }).last().click();
      await expect(page.getByRole('status')).toContainText('Photo saved to your draft');
      await expect(page.locator('.photo-grid img')).toHaveCount(4);
      await expect(page.getByText('4 of 4 photos')).toBeVisible();
      await expect(page.locator('.photo-grid img').first()).not.toHaveAttribute('src', firstPhotoSrcBefore);
      // Replaced original remains privately accessible to owner (never deleted)
      expect((await page.request.get(firstPhotoSrcBefore)).status()).toBe(200);

      // Submit 4-photo racket for admin review
      await page.getByRole('link', { name: 'Listing details', exact: true }).click();
      await page.getByRole('button', { name: 'Submit for approval', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Submitted.');

      // 6. Verify 0, 1, 2 (blocked), 3 (submit OK), 4 (OK), and 5 (rejected 409) across balls, shoes (EU 42.5), and bags!
      const categorySpecs = [
        {
          category: 'balls' as const,
          patch: {
            title: `Head Padel Pro S+ ${suffix}`,
            brand_slug: 'head',
            model: 'Padel Pro S+',
            description: 'Unopened case of pressurized cans stored indoors.',
            governorate_slug: 'cairo',
            condition: 'new',
            condition_disclosure: 'Factory sealed cans, bought this week.',
            offer_type: 'sale',
            price_egp: 950,
            balls_quantity_packaging: '3 pressurized cans (9 balls total)',
          },
        },
        {
          category: 'shoes' as const,
          patch: {
            title: `Adidas Barricade Padel ${suffix}`,
            brand_slug: 'adidas',
            model: 'Barricade Padel',
            description: 'Tried once indoors, half size too snug.',
            governorate_slug: 'giza',
            condition: 'used',
            condition_disclosure: 'Like new outsole, original box included.',
            offer_type: 'sale',
            price_egp: 4200,
            shoe_size_eu: 42.5,
          },
        },
        {
          category: 'bags' as const,
          patch: {
            title: `Babolat RH Padel Bag ${suffix}`,
            brand_slug: 'babolat',
            model: 'RH Perf Padel',
            description: 'Insulated thermal racket compartment plus ventilated shoe pocket.',
            governorate_slug: 'cairo',
            condition: 'used',
            condition_disclosure: 'Clean zippers and padded straps, light scuff on base.',
            offer_type: 'sale',
            price_egp: 2400,
          },
        },
      ];

      for (const spec of categorySpecs) {
        const draft = await rpc('create_listing_draft', { p_category: spec.category });
        createdListingIds.push(draft.id);
        let ver = (
          await rpc('update_listing_draft', {
            p_listing_id: draft.id,
            p_expected_version: draft.version,
            p_patch: spec.patch,
          })
        ).version as number;

        // 0 photos -> submit rejected
        const sub0 = await sellerClient.rpc('submit_listing', { p_listing_id: draft.id, p_expected_version: ver });
        expect(sub0.error?.code).toBe('23514');

        // Upload photos 1 & 2 via real Next.js upload API -> submit still rejected
        for (let p = 0; p < 2; p++) {
          const uploadRes = await page.request.post(`/api/listings/${draft.id}/photos`, {
            headers: { Origin: 'http://127.0.0.1:3100', 'X-Listing-Version': String(ver) },
            data: photos[p],
          });
          expect(uploadRes.status()).toBe(201);
          ver = (await uploadRes.json()).version;

          const subUnder = await sellerClient.rpc('submit_listing', { p_listing_id: draft.id, p_expected_version: ver });
          expect(subUnder.error?.code).toBe('23514');
        }

        // Upload photo 3 -> submit succeeds
        const up3 = await page.request.post(`/api/listings/${draft.id}/photos`, {
          headers: { Origin: 'http://127.0.0.1:3100', 'X-Listing-Version': String(ver) },
          data: photos[2],
        });
        expect(up3.status()).toBe(201);
        ver = (await up3.json()).version;
        const sub3 = await rpc('submit_listing', { p_listing_id: draft.id, p_expected_version: ver });
        expect(sub3.status).toBe('pending');
        ver = sub3.version;

        // Withdraw, upload photo 4 -> succeeds; attempt photo 5 -> 409 photoLimit
        const withdrawn = await rpc('withdraw_listing', { p_listing_id: draft.id, p_expected_version: ver });
        ver = withdrawn.version;
        const up4 = await page.request.post(`/api/listings/${draft.id}/photos`, {
          headers: { Origin: 'http://127.0.0.1:3100', 'X-Listing-Version': String(ver) },
          data: photos[3],
        });
        expect(up4.status()).toBe(201);
        ver = (await up4.json()).version;

        const up5 = await page.request.post(`/api/listings/${draft.id}/photos`, {
          headers: { Origin: 'http://127.0.0.1:3100', 'X-Listing-Version': String(ver) },
          data: photos[4],
        });
        expect(up5.status()).toBe(409);
        expect((await up5.json()).error).toBe('photoLimit');
      }

      // Check shoes EU 42.5 half-size in editor UI
      const shoesId = createdListingIds[2];
      await page.goto(`/en/account/listings/${shoesId}`);
      await expect(page.getByLabel('Shoe size (EU)', { exact: false })).toHaveValue('42.5');
      await expect(page.getByLabel('Offer type', { exact: true })).toHaveCount(0);

      // 7. Admin rejects racket with reason -> verify visible on Seller Dashboard & Editor -> capture rejection screenshots!
      const rejectionReason = 'Please describe the grip condition and show the upper bumper edge clearly.';
      rejectLocalListing(racketId, rejectionReason);

      await page.goto('/en/account/listings');
      await expect(page.getByText(rejectionReason)).toBeVisible();
      await expect(page.getByRole('button', { name: /Needs correction/ })).toBeVisible();

      // Test status filter tabs on Seller Dashboard
      await page.getByRole('button', { name: /^Needs correction/ }).click();
      await expect(page.locator('.seller-listing-card')).toHaveCount(1);
      await expect(page.getByText(racketTitle)).toBeVisible();
      await page.getByRole('button', { name: /^All/ }).click();
      await expect(page.locator('.seller-listing-card')).toHaveCount(4);

      // 8. Responsive EN/AR & Light/Dark check + visual verification screenshots (desktop run only)
      if (info.project.name === 'desktop') {
        await mkdir('.cache/ui-c-screenshots', { recursive: true });
        const checkPages = [
          { key: 'dashboard', path: '/account/listings' },
          { key: 'editor-rejected', path: `/account/listings/${racketId}` },
          { key: 'photos', path: `/account/photos?listing=${shoesId}` },
          { key: 'profile', path: '/account' },
        ];

        for (const width of [320, 390, 768, 1024, 1440]) {
          for (const locale of ['en', 'ar'] as const) {
            for (const theme of ['light', 'dark'] as const) {
              // Run full 4-page sweep on key breakpoints; keep 320/768/1024 focused on light EN & dark AR to stay fast while testing every width
              if ([320, 768, 1024].includes(width) && !((locale === 'en' && theme === 'light') || (locale === 'ar' && theme === 'dark'))) {
                continue;
              }
              await page.setViewportSize({ width, height: 900 });
              for (const target of checkPages) {
                await page.goto(`/${locale}${target.path}`);
                await page.locator('.theme-switch input[value="' + theme + '"]').check();
                expect(await page.evaluate(() => document.documentElement.dir)).toBe(locale === 'ar' ? 'rtl' : 'ltr');
                const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
                expect(overflow, `Overflow on ${target.key} ${width}px ${locale} ${theme}`).toBeLessThanOrEqual(0);

                if ((width === 1440 || width === 390) && ((locale === 'en' && (theme === 'light' || theme === 'dark')) || (locale === 'ar' && (theme === 'light' || theme === 'dark')))) {
                  const shouldCapture =
                    (width === 1440 && locale === 'en' && theme === 'light') ||
                    (width === 1440 && locale === 'en' && theme === 'dark') ||
                    (width === 1440 && locale === 'ar' && theme === 'light') ||
                    (width === 390 && locale === 'en' && theme === 'light') ||
                    (width === 390 && locale === 'ar' && theme === 'dark');
                  if (shouldCapture) {
                    await page.screenshot({
                      path: `.cache/ui-c-screenshots/${target.key}-${width}-${locale}-${theme}.png`,
                      fullPage: true,
                    });
                  }
                }
              }
            }
          }
        }
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.goto('/en/account/listings');
        await page.locator('.theme-switch input[value="light"]').check();
      }

      // 9. Correct rejected listing -> resubmit -> approve -> verify buyer view shows all 4 photos -> dashboard lifecycle actions
      await page.goto(`/en/account/listings/${racketId}`);
      await expect(page.getByText(rejectionReason)).toBeVisible();
      await page.getByLabel('Condition details and wear').fill('Fresh overgrip installed; light scuffs on bumper edge clearly photographed.');
      await page.getByRole('button', { name: 'Save draft', exact: true }).click();
      await expect(page.getByRole('status')).toHaveText('Draft saved.');
      await page.getByRole('button', { name: 'Submit for approval', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Submitted.');

      approveSyntheticSellerTestListing(racketId);

      // Seller Dashboard shows Published status & View public listing link
      await page.goto('/en/account/listings');
      const racketCard = page.locator('.seller-listing-card', { hasText: racketTitle });
      await expect(racketCard.getByText('Published', { exact: true })).toBeVisible();
      await expect(racketCard.getByRole('link', { name: 'View public listing', exact: true })).toHaveAttribute(
        'href',
        `/en/equipment/${racketId}`,
      );

      // Anonymous buyer sees approved listing with 4-photo gallery
      const buyerCtx = await browser.newContext({ baseURL: 'http://127.0.0.1:3100' });
      const buyerPage = await buyerCtx.newPage();
      await buyerPage.goto(`/en/equipment/${racketId}`);
      await expect(buyerPage.getByRole('heading', { level: 1 })).toHaveText(racketTitle);
      await expect(buyerPage.getByText('1 / 4')).toBeVisible();
      await expect(buyerPage.locator('.gallery-thumbs button')).toHaveCount(4);
      await buyerCtx.close();

      // Lifecycle actions directly from Seller Dashboard: Mark as traded -> Relist for approval -> Archive listing
      await racketCard.getByRole('button', { name: 'Mark as traded', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Listing status updated.');
      await expect(racketCard.getByText('Traded', { exact: true })).toBeVisible();

      await racketCard.getByRole('button', { name: 'Relist for approval', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Submitted.');
      await expect(racketCard.getByText('Waiting for approval', { exact: true })).toBeVisible();

      await racketCard.getByRole('button', { name: 'Archive listing', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Listing status updated.');
      await expect(racketCard.getByText('Archived', { exact: true })).toBeVisible();

      // 10. Safe photo detachment (without deleting Storage objects) & legacy relist-to-draft escape hatches
      // 10a. Reopen the archived 4-photo racket back to draft from Seller Dashboard, detach 1 photo -> verify count drops 4 -> 3 & detached asset remains privately readable (200)
      await racketCard.getByRole('button', { name: 'Return to draft to edit', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Returned to draft.');
      await expect(racketCard.getByText('Draft', { exact: true })).toBeVisible();

      await page.goto(`/en/account/photos?listing=${racketId}`);
      await expect(page.getByText('4 of 4 photos')).toBeVisible();
      const fourthImgSrc = (await page.locator('.photo-grid img').nth(3).getAttribute('src'))!;
      await page.getByRole('button', { name: 'Remove photo 4 from draft', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Photo removed from this draft.');
      await expect(page.getByText('3 of 4 photos')).toBeVisible();
      await expect(page.locator('.photo-grid img')).toHaveCount(3);
      await expect(page.locator('.photo-empty-slot')).toHaveCount(1);
      // Underlying Storage object MUST remain preserved privately (HTTP 200 to owner, never deleted!)
      expect((await page.request.get(fourthImgSrc)).status()).toBe(200);

      // 10b. Legacy 5-photo draft: simulate pre-migration 5th attached photo, verify warning + detach down to 4 + submit succeeds!
      const bagsId = createdListingIds[3];
      const extraMediaId = new URL(fourthImgSrc, 'http://127.0.0.1:3100').pathname.split('/').pop()!;
      localDbSql(`
        insert into public.listing_media(listing_id, owner_id, media_id, sort_order)
        select '${bagsId}', seller_id, '${extraMediaId}', 4
        from public.listings
        where id = '${bagsId}';
      `);
      await page.goto(`/en/account/photos?listing=${bagsId}`);
      await expect(page.getByText('5 of 4 photos')).toBeVisible();
      await expect(page.getByText(/Remove 1 photo from this draft/)).toBeVisible();
      await page.getByRole('button', { name: 'Remove photo 5 from draft', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Photo removed from this draft.');
      await expect(page.getByText('4 of 4 photos')).toBeVisible();
      await page.getByRole('link', { name: 'Listing details', exact: true }).click();
      await page.getByRole('button', { name: 'Submit for approval', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Submitted.');

      // 10c. Legacy 2-photo archived balls listing: verify dashboard shows photo-requirement notice + primary Return to draft CTA, reopen, add 3rd photo & submit!
      const ballsId = createdListingIds[1];
      localDbSql(`
        begin;
        delete from public.listing_media where listing_id = '${ballsId}' and sort_order >= 2;
        update public.listings set status = 'archived', version = version + 1 where id = '${ballsId}';
        commit;
      `);
      await page.goto('/en/account/listings');
      const ballsCard = page.locator('.seller-listing-card', { hasText: `Head Padel Pro S+ ${suffix}` });
      await expect(ballsCard.getByText(/currently has 2 photos/)).toBeVisible();
      await expect(ballsCard.getByRole('button', { name: 'Relist for approval', exact: true })).toHaveCount(0);
      await ballsCard.getByRole('button', { name: 'Return to draft to edit', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Returned to draft.');
      await page.goto(`/en/account/photos?listing=${ballsId}`);
      await expect(page.getByText('2 of 4 photos')).toBeVisible();
      await page.getByLabel('Choose equipment photo').setInputFiles({
        name: 'balls-3rd.jpg',
        mimeType: 'image/jpeg',
        buffer: photos[2],
      });
      await page.getByRole('button', { name: 'Upload photo', exact: true }).click();
      await expect(page.getByText('3 of 4 photos')).toBeVisible();
      await page.getByRole('link', { name: 'Listing details', exact: true }).click();
      await page.getByRole('button', { name: 'Submit for approval', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Submitted.');

      expect(pageErrors).toEqual([]);
    } finally {
      for (const lid of createdListingIds) {
        try {
          const current = await rpc('get_my_listing', { p_listing_id: lid });
          if (['active', 'pending', 'reserved'].includes(current.status)) {
            await rpc('withdraw_listing', { p_listing_id: lid, p_expected_version: current.version });
          }
        } catch {
          // Best-effort cleanup of synthetic test fixtures
        }
      }
    }
  });
});
