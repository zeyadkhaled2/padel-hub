import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { readFile } from 'node:fs/promises';
import { approveLocalListing } from './local-review';
test.use({ trace: 'off', screenshot: 'off', video: 'off' }); // Never record authentication credentials.

// Account creation uses real local Auth + Mailpit. Approval uses the isolated local-review fixture; no production MFA UI is claimed.
test.describe('local verified accounts', () => {
  test.skip(process.env.PADELHUB_AUTH_E2E !== '1', 'Requires the dedicated local Auth launcher and Mailpit');
  test.setTimeout(120_000);

  async function save(page: Page, name: string) {
    await Promise.all([
      page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/account')),
      page.getByRole('button', { name, exact: true }).click(),
    ]);
    if (name === 'Create profile') await expect(page.getByRole('heading', { name: 'Profile details' })).toBeVisible();
    else await expect(page.getByRole('button', { name, exact: true })).toBeEnabled();
  }

  async function confirmation(request: APIRequestContext, email: string) {
    let id: string | undefined;
    await expect.poll(async () => {
      const response = await request.get('http://127.0.0.1:54324/api/v1/messages');
      const body = await response.json();
      id = body.messages?.find((message: { To: { Address: string }[] }) => message.To.some(to => to.Address === email))?.ID;
      return !!id;
    }, { timeout: 20_000 }).toBe(true);
    const message = await (await request.get(`http://127.0.0.1:54324/api/v1/message/${id}`)).json();
    const link = (message.HTML || message.Text).match(/https?:\/\/[^\s"<>]+\/auth\/v1\/verify[^\s"<>]*/)?.[0]?.replaceAll('&amp;', '&');
    if (!link) throw new Error('Local confirmation message has no verification link');
    const destination = new URL(link);
    if (!['127.0.0.1', 'localhost'].includes(destination.hostname)) throw new Error('Refusing nonlocal email link');
    return link as string;
  }

  async function signup(page: Page, email: string, password: string, locale = 'en') {
    await page.goto(`/${locale}/auth/signup`);
    await page.getByLabel(locale === 'en' ? 'Email address' : 'البريد الإلكتروني').fill(email);
    await page.getByLabel(locale === 'en' ? 'Password' : 'كلمة المرور', { exact: true }).fill(password);
    await page.getByRole('button', { name: locale === 'en' ? 'Create account' : 'إنشاء حساب', exact: true }).click();
    await expect(page.getByText(locale === 'en' ? /Check your inbox/ : /راجع بريدك/)).toBeVisible();
  }

  test('confirmation, private profile, RPC edits, conflict, signout and isolation', async ({ page, context, request, browser }, info) => {
    const suffix = `${Date.now()}${info.project.name === 'mobile' ? 'm' : 'd'}`;
    const email = `t03-${suffix}@example.test`;
    const password = 'Local-only-Padel-739!';
    const username = `p_${suffix}`;
    const anonymous = await page.goto('/en/account');
    expect(anonymous?.headers()['cache-control']).toContain('no-store');
    await expect(page).toHaveURL(/\/en\/auth\/signin$/);
    await expect(page).toHaveTitle('Sign in — PadelHub');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    const signupLocale = info.project.name === 'mobile' ? 'ar' : 'en';
    await signup(page, email, password, signupLocale);
    const link = await confirmation(request, email);

    // Still unconfirmed: neither password login nor profile access is allowed.
    await page.goto('/en/auth/signin');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('Confirm your email before signing in.', { exact: false })).toBeVisible();
    await page.goto(link);
    await expect(page).toHaveURL(new RegExp(`/${signupLocale}/account$`));
    await page.goto('/en/account');
    await expect(page.getByRole('heading', { name: 'Create profile' })).toBeVisible();
    await expect(page.locator('input[type="checkbox"]')).toHaveCount(0);
    await page.getByLabel('Username', { exact: true }).fill(username);
    await page.getByLabel('Display name').fill('Synthetic T03 Player');
    await page.getByLabel('Governorate').selectOption('cairo');
    await save(page, 'Create profile');
    await expect(page.getByRole('status')).toContainText('Saved successfully');
    await expect(page.getByText('Private profile', { exact: false })).toBeVisible();
    await expect(page.getByLabel('Allow my seller profile to be public')).not.toBeChecked();
    await expect(page.getByLabel(/I agree to let buyers/)).not.toBeChecked();

    await expect(page.getByLabel('Username', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Your username is fixed after profile creation.', { exact: true })).toBeVisible();
    expect((await request.get(`/en/@${username}`)).status()).toBe(404);

    await page.getByLabel('WhatsApp number (optional)').fill('not-a-number');
    await page.getByLabel('About you (optional)').fill('Unsaved biography remains across contact saves.');
    await page.getByLabel(/I agree to let buyers/).check();
    await save(page, 'Save contact preferences');
    await expect(page.getByRole('status')).toContainText('Check the highlighted fields');
    await expect(page.getByLabel('WhatsApp number (optional)')).toHaveValue('not-a-number');
    await expect(page.getByLabel(/I agree to let buyers/)).toBeChecked();
    await page.getByLabel('WhatsApp number (optional)').fill('+201000000000');
    await save(page, 'Save contact preferences');
    await expect(page.getByRole('status')).toContainText('Saved successfully');
    await expect(page.getByLabel('About you (optional)')).toHaveValue('Unsaved biography remains across contact saves.');
    await page.reload();
    await expect(page.getByLabel(/I agree to let buyers/)).toBeChecked();
    await expect(page.getByLabel('Allow my seller profile to be public')).not.toBeChecked();

    const stale = await context.newPage();
    await stale.goto('/en/account');
    await stale.getByLabel('Display name').fill('Stale edit must remain');
    await page.getByLabel('Display name').fill('Latest saved player');
    await save(page, 'Save profile details');
    await expect(page.getByRole('status')).toContainText('Saved successfully');
    await stale.getByRole('button', { name: 'Save profile details' }).click();
    await expect(stale.getByRole('status')).toContainText('profile changed in another session');
    await expect(stale.getByLabel('Display name')).toHaveValue('Stale edit must remain');
    await expect(stale.getByRole('button', { name: 'Save profile details' })).toBeDisabled();
    await stale.getByRole('link', { name: 'Reload saved profile' }).click();
    await expect(stale.getByLabel('Display name')).toHaveValue('Latest saved player');
    await stale.close();

    await page.reload();
    await page.getByLabel('Allow my seller profile to be public').check();
    await save(page, 'Save profile details');
    await expect(page.getByRole('status')).toContainText('Saved successfully');
    await page.reload();
    await expect(page.getByLabel('Allow my seller profile to be public')).toBeChecked();
    await page.getByLabel('Allow my seller profile to be public').uncheck();
    await save(page, 'Save profile details');
    await expect(page.getByRole('status')).toContainText('Saved successfully');
    await page.getByLabel(/I agree to let buyers/).uncheck();
    await save(page, 'Save contact preferences');
    await expect(page.getByRole('status')).toContainText('Saved successfully');
    await page.reload();
    await expect(page.getByLabel(/I agree to let buyers/)).not.toBeChecked();
    await expect(page.getByLabel('Allow my seller profile to be public')).not.toBeChecked();

    // A separate verified account gets its own empty profile, never this profile.
    const other = await browser.newContext({ baseURL: 'http://127.0.0.1:3100' });
    const otherPage = await other.newPage();
    await signup(otherPage, `t03-other-${suffix}@example.test`, password);
    await otherPage.goto(await confirmation(request, `t03-other-${suffix}@example.test`));
    await expect(otherPage.getByRole('heading', { name: 'Create profile' })).toBeVisible();
    await expect(otherPage.getByLabel('Display name')).toHaveValue('');
    await other.close();

    const privateResponse = await page.reload();
    expect(privateResponse?.headers()['cache-control']).toContain('no-store');
    await page.getByRole('link', { name: 'العربية' }).click();
    await expect(page).toHaveURL(/\/ar\/account$/);
    await expect(page).toHaveTitle('ملفي الشخصي — PadelHub');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByLabel('الاسم الظاهر')).toHaveValue('Latest saved player');
    await page.getByRole('button', { name: 'تسجيل الخروج' }).click();
    await expect(page).toHaveURL(/\/ar\/auth\/signin$/);
    await page.goto('/en/account');
    await expect(page).toHaveURL(/\/en\/auth\/signin$/);
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/en\/account$/);
    await expect(page.getByLabel('Display name')).toHaveValue('Latest saved player');
    const sessionCookies = (await context.cookies()).filter(cookie => /^sb-.*-auth-token(?:\.\d+)?$/.test(cookie.name));
    expect(sessionCookies.length).toBeGreaterThan(0);
    expect(sessionCookies.every(cookie => cookie.httpOnly && cookie.sameSite === 'Lax')).toBe(true);
    // Make the stored expiry stale while keeping the genuine refresh credential.
    // The proxy must renew it with Auth and persist the new session cookies.
    const serialized = sessionCookies.sort((a, b) => a.name.localeCompare(b.name)).map(cookie => cookie.value).join('');
    const session = JSON.parse(Buffer.from(serialized.replace(/^base64-/, ''), 'base64url').toString());
    session.expires_at = 1;
    const expired = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
    const cookieName = sessionCookies[0].name.replace(/\.\d+$/, '');
    await context.clearCookies({ name: /^sb-.*-auth-token(?:\.\d+)?$/ });
    const chunks = expired.match(/.{1,3000}/g)!;
    await context.addCookies(chunks.map((value, index) => ({ ...sessionCookies[0], name: chunks.length === 1 ? cookieName : `${cookieName}.${index}`, value })));
    await page.reload();
    await expect(page.getByLabel('Display name')).toHaveValue('Latest saved player');
    const renewed = (await context.cookies()).filter(cookie => /^sb-.*-auth-token(?:\.\d+)?$/.test(cookie.name)).sort((a,b)=>a.name.localeCompare(b.name)).map(cookie=>cookie.value).join('');
    expect(JSON.parse(Buffer.from(renewed.replace(/^base64-/, ''), 'base64url').toString()).expires_at).toBeGreaterThan(Date.now() / 1000);
    // Actual synchronous photo upload, durable attachment and metadata stripping.
    await page.goto('/en/account/photos');
    await page.getByRole('button', { name: 'Create photo draft' }).click();
    await expect(page).toHaveURL(/listing=/);
    const listingId = new URL(page.url()).searchParams.get('listing');
    expect(listingId).toBeTruthy();
    const source = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#245b38' } }).jpeg().withMetadata().toBuffer();
    await page.getByLabel('Choose equipment photo').setInputFiles({ name: 'equipment.jpg', mimeType: 'image/jpeg', buffer: source });
    await page.getByRole('button', { name: 'Upload photo', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Photo saved to your draft');
    await page.reload();
    const savedImage = page.locator('.photo-grid img');
    await expect(savedImage).toHaveCount(1);
    const imageUrl = (await savedImage.getAttribute('src'))!;
    const imageResponse = await page.request.get(imageUrl);
    expect(imageResponse.status()).toBe(200);
    expect(imageResponse.headers()['cache-control']).toContain('no-store');
    const metadata = await sharp(await imageResponse.body()).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.exif).toBeUndefined();
    expect((await page.request.get(imageUrl, { headers: { Range: 'bytes=0-10' } })).status()).toBe(416);
    expect((await page.request.head(imageUrl)).status()).toBe(200);
    await page.getByRole('button', { name: 'Replace photo', exact: true }).click();
    await page.getByLabel('Choose equipment photo').setInputFiles({ name: 'fake.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not an image') });
    await page.getByRole('button', { name: 'Replace photo', exact: true }).last().click();
    await expect(page.getByRole('status')).toContainText('Use a valid, still');
    await expect(savedImage).toHaveAttribute('src', imageUrl);
    await page.getByLabel('Choose equipment photo').setInputFiles({ name: 'replacement.jpg', mimeType: 'image/jpeg', buffer: source });
    const replacementResponse = page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/photos'));
    await page.getByRole('button', { name: 'Replace photo', exact: true }).last().click();
    const replacementResult = await (await replacementResponse).json();
    await expect(page.getByRole('status')).toContainText('Photo saved to your draft');
    await expect(savedImage).not.toHaveAttribute('src', imageUrl);
    await expect(savedImage).toHaveCount(1);
    expect((await page.request.get(imageUrl)).status()).toBe(200); // Saved original retained privately.
    expect((await page.request.post(`/api/listings/${listingId}/photos`, { headers: { Origin: 'http://127.0.0.1:3100', 'X-Listing-Version': '1' }, data: source })).status()).toBe(409);
    const racingUploads = await Promise.all([0, 1].map(() => page.request.post(`/api/listings/${listingId}/photos`, { headers: { Origin: 'http://127.0.0.1:3100', 'X-Listing-Version': String(replacementResult.version) }, data: source })));
    expect(racingUploads.map(response => response.status()).sort()).toEqual([201, 409]);
    expect((await page.request.post(`/api/listings/${listingId}/photos`, { headers: { Origin: 'http://127.0.0.1:3100', 'X-Listing-Version': '1' }, data: Buffer.alloc(8 * 1024 * 1024 + 1) })).status()).toBe(413);
    const privateVisitor = await browser.newContext({ baseURL: 'http://127.0.0.1:3100' });
    expect((await privateVisitor.request.get(imageUrl)).status()).toBe(404);
    expect((await privateVisitor.request.post(`/api/listings/${listingId}/photos`, { headers: { Origin: 'http://127.0.0.1:3100', 'X-Listing-Version': '1' }, data: source })).status()).toBe(401);
    await privateVisitor.close();
    expect((await page.request.post(`/api/listings/${listingId}/photos`, { headers: { Origin: 'https://example.com', 'X-Listing-Version': '1' }, data: source })).status()).toBe(403);
    // Complete a real racket draft, enforce consent, submit and withdraw.
    await page.goto(`/en/account/photos?listing=${listingId}`);
    await page.getByLabel('Choose equipment photo').setInputFiles({ name: 'third.jpg', mimeType: 'image/jpeg', buffer: source });
    await page.getByRole('button', { name: 'Upload photo', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Photo saved');
    await page.getByRole('link', { name: 'Listing details', exact: true }).click();
    await expect(page).toHaveURL(/account\/listings\/[0-9a-f-]+$/);
    const editorUrl = page.url();
    await page.getByLabel('Listing title', { exact: true }).fill('Synthetic racket listing');
    await page.getByLabel('Brand', { exact: true }).selectOption('head');
    await page.getByLabel('Model', { exact: true }).fill('Test model');
    await page.getByLabel('Description', { exact: true }).fill('Synthetic equipment for local tests only.');
    await page.getByLabel('Governorate', { exact: true }).selectOption('cairo');
    await page.getByLabel('Condition', { exact: true }).selectOption('used');
    await page.getByLabel('Condition details and wear').fill('Light wear');
    await page.getByLabel('Racket damage or repairs').fill('No repairs');
    await page.getByLabel('Offer type').selectOption('sale');
    await page.getByLabel('Price in EGP').fill('2500');
    await expect(page.getByRole('button', { name: 'Submit for approval', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Draft saved.');
    await page.reload();
    await expect(page.getByLabel('Listing title', { exact: true })).toHaveValue('Synthetic racket listing');
    const staleListing = await context.newPage();
    await staleListing.goto(editorUrl);
    await page.getByLabel('Listing title', { exact: true }).fill(`Latest racket title ${suffix}`);
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Draft saved.');
    await staleListing.getByLabel('Listing title', { exact: true }).fill('Stale title stays here');
    await staleListing.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(staleListing.getByRole('status')).toContainText('changed elsewhere');
    await expect(staleListing.getByLabel('Listing title', { exact: true })).toHaveValue('Stale title stays here');
    await staleListing.close();
    await page.getByRole('button', { name: 'Submit for approval', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Submission needs');
    await page.goto('/en/account');
    await page.getByLabel('Allow my seller profile to be public').check();
    await save(page, 'Save profile details');
    await page.getByLabel(/I agree to let buyers/).check();
    await save(page, 'Save contact preferences');
    await page.goto(editorUrl);
    await page.getByRole('button', { name: 'Submit for approval', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Submitted.');
    await page.goto('/en/account/listings');
    await expect(page.getByText('Waiting for approval', { exact: false })).toBeVisible();
    await page.getByRole('link', { name: `Latest racket title ${suffix}`, exact: true }).click();
    await expect(page.getByText('Status: Waiting for approval', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Listing title', { exact: true })).toHaveCount(0);
    approveLocalListing(listingId!);
    const buyer = await browser.newContext({ baseURL: 'http://127.0.0.1:3100' });
    const buyerPage = await buyer.newPage();
    await buyerPage.goto(`/@${username}`);
    await expect(buyerPage).toHaveURL(new RegExp(`/en/@${username}$`));
    await expect(buyerPage.locator('.listing-card')).toHaveCount(1);
    await buyerPage.getByRole('button', { name: 'Show QR code', exact: true }).click();
    const qrImage = buyerPage.getByRole('img', { name: `QR code for @${username}`, exact: true });
    await expect(qrImage).toBeVisible();
    const downloadEvent = buyerPage.waitForEvent('download');
    await buyerPage.getByRole('link', { name: 'Download QR code', exact: true }).click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe(`padelhub-${username}-qr.png`);
    const png = await readFile((await download.path())!);
    const decodedImage = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const code = jsQR(new Uint8ClampedArray(decodedImage.data), decodedImage.info.width, decodedImage.info.height);
    expect(code?.data).toMatch(/^http:\/\/127\.0\.0\.1:3100\/api\/profiles\/[a-f0-9-]{36}$/);
    const qrTarget = code!.data;
    const qrResponse = await buyer.request.get(qrTarget, { maxRedirects: 0 });
    expect(qrResponse.status()).toBe(302);
    expect(qrResponse.headers().location).toBe(`/@${username}`);
    expect(qrResponse.headers()['cache-control']).toContain('no-store');
    await buyerPage.getByRole('button', { name: 'Hide QR code', exact: true }).click();
    await expect(qrImage).toHaveCount(0);
    expect(await buyerPage.content()).not.toContain('+201000000000');
    await buyer.addCookies([{name:'NEXT_LOCALE', value:'ar', url:'http://127.0.0.1:3100'}]);
    await buyerPage.goto(qrTarget);
    await expect(buyerPage).toHaveURL(new RegExp(`/ar/@${username}$`));
    await expect(buyerPage.locator('html')).toHaveAttribute('dir','rtl');
    await expect(buyerPage.getByRole('button', { name: 'نسخ رابط الملف' })).toBeVisible();
    await buyerPage.goto(`/en?q=${encodeURIComponent(`Latest racket title ${suffix}`)}&category=rackets&governorate=cairo&brand=head&condition=used&offer=sale&min=2000&max=3000&sort=low`);
    await expect(buyerPage.locator('.listing-card')).toHaveCount(1);
    const publicImage = buyerPage.locator('.listing-card img');
    await expect.poll(() => publicImage.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await buyerPage.getByRole('heading', { name: `Latest racket title ${suffix}` }).getByRole('link').click();
    await expect(buyerPage.getByRole('heading', { level: 1 })).toHaveText(`Latest racket title ${suffix}`);
    await expect(buyerPage.getByText('Light wear', { exact: true })).toBeVisible();
    expect(await buyerPage.content()).not.toContain('+201000000000');
    const contact = await buyer.request.get(`/api/contact/${listingId}?locale=en&next=https://example.com`, { maxRedirects: 0 });
    expect(contact.status()).toBe(302);
    expect(contact.headers()['cache-control']).toContain('no-store');
    const destination = new URL(contact.headers().location);
    expect(destination.origin).toBe('https://wa.me');
    expect(destination.pathname).toBe('/201000000000');
    expect(destination.searchParams.get('text')).toContain(`/en/equipment/${listingId}`);
    await buyerPage.goto(`/ar/equipment/${listingId}`);
    await expect(buyerPage.getByRole('link', { name: 'تواصل عبر واتساب' })).toBeVisible();
    await page.reload();
    const staleStatus = await page.context().newPage();
    await staleStatus.goto(`/en/account/listings/${listingId}`);
    await expect(page.getByRole('button', { name: 'Mark as traded', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Mark as sold', exact: true }).click();
    await expect(page.getByText('Status: Sold', { exact: true })).toBeVisible();
    await buyerPage.goto(`/en/@${username}`);
    await expect(buyerPage.locator('.listing-card')).toHaveCount(0);
    await staleStatus.getByRole('button', { name: 'Archive listing', exact: true }).click();
    await expect(staleStatus.getByRole('status')).toContainText('changed elsewhere');
    await staleStatus.close();
    expect((await buyer.request.get(`/api/contact/${listingId}`, { maxRedirects: 0 })).status()).toBe(404);
    await buyerPage.goto(`/en/equipment/${listingId}`);
    await expect(buyerPage.getByRole('link', { name: 'Contact on WhatsApp' })).toHaveCount(0);
    await expect(buyerPage.locator('.condition')).toContainText('Sold');
    await buyerPage.goto(`/en?q=${encodeURIComponent(`Latest racket title ${suffix}`)}`);
    await expect(buyerPage.locator('.listing-card')).toHaveCount(0);
    await page.getByRole('button', { name: 'Relist for approval', exact: true }).click();
    await expect(page.getByText('Status: Waiting for approval', { exact: true })).toBeVisible();
    expect((await buyer.request.get(`/en/equipment/${listingId}`)).status()).toBe(404);
    await page.getByRole('button', { name: 'Archive listing', exact: true }).click();
    await expect(page.getByText('Status: Archived', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Relist for approval', exact: true }).click();
    await expect(page.getByText('Status: Waiting for approval', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Withdraw to edit', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Returned to draft');
    expect((await buyer.request.get(`/api/contact/${listingId}`, { maxRedirects: 0 })).status()).toBe(404);
    expect((await buyer.request.get(`/en/equipment/${listingId}`)).status()).toBe(404);
    await buyer.close();
    await expect(page.getByRole('status')).toContainText('Returned to draft');
    await expect(page.getByLabel('Listing title', { exact: true })).toHaveValue(`Latest racket title ${suffix}`);
    await page.goto('/en/account/listings');
    await page.getByLabel('Equipment category', { exact: true }).selectOption('balls');
    await page.getByRole('button', { name: 'Create listing', exact: true }).click();
    await expect(page.getByLabel('Ball quantity and packaging')).toBeVisible();
    await expect(page.getByLabel('Racket damage or repairs')).toHaveCount(0);
    await page.getByLabel('Listing title', { exact: true }).fill('Synthetic balls');
    await page.getByLabel('Ball quantity and packaging').fill('Three sealed balls');
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Draft saved.');
    await page.getByRole('button', { name: 'Submit for approval', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Submission needs');
    await page.reload();
    await expect(page.getByLabel('Ball quantity and packaging')).toHaveValue('Three sealed balls');
    for (const category of ['shoes','bags']) {
      await page.goto('/en/account/listings');
      await page.locator('#category').selectOption(category);
      await page.getByRole('button', { name: 'Create listing', exact: true }).click();
      await page.getByLabel('Listing title', { exact: true }).fill(`Synthetic ${category} ${suffix}`);
      await expect(page.getByLabel('Offer type', { exact: true })).toHaveCount(0);
      await expect(page.getByLabel('Ball quantity and packaging')).toHaveCount(0);
      if (category === 'shoes') await page.getByLabel('Shoe size (EU)', { exact: false }).fill('42.5');
      else await expect(page.locator('input[name="shoe_size_eu"]')).toHaveCount(0);
      await page.getByRole('button', { name: 'Save draft', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Draft saved');
      await page.reload();
      await expect(page.getByLabel('Listing title', { exact: true })).toHaveValue(`Synthetic ${category} ${suffix}`);
      if (category === 'shoes') await expect(page.locator('input[name="shoe_size_eu"]')).toHaveValue('42.5');
    }
    const listingVisitor = await browser.newContext({ baseURL: 'http://127.0.0.1:3100' });
    const visitorPage = await listingVisitor.newPage();
    await visitorPage.goto(editorUrl);
    await expect(visitorPage).toHaveURL(/auth\/signin/);
    await listingVisitor.close();
    await page.goto('/en/account');
    const forged = await browser.newContext({ baseURL: 'http://127.0.0.1:3100' });
    await forged.addCookies(sessionCookies.map(cookie => ({ ...cookie, value: 'base64-invalid-session' })));
    const forgedPage = await forged.newPage();
    await forgedPage.goto('/en/account');
    await expect(forgedPage).toHaveURL(/\/en\/auth\/signin$/);
    await forged.close();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    // Confirmation is one-time; no arbitrary next URL may influence the callback.
    await page.goto('/en/auth/callback?code=invalid&next=https://example.com');
    await expect(page).toHaveURL(/127\.0\.0\.1:3100\/en\/auth\/signin\?error=confirmation$/);
    await expect(page.locator('main').getByRole('alert')).toContainText('confirmation link');
  });
});


