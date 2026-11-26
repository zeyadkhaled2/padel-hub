import { test, expect } from '@playwright/test';

test('search, empty state, detail and seller navigation', async ({ page }) => {
  await page.goto('/en/demo');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Your next game starts here.',
  );
  await page
    .getByRole('textbox', { name: 'What are you looking for?' })
    .fill('no-such-racket');
  await page.getByRole('button', { name: 'Find equipment' }).click();
  await expect(
    page.getByRole('heading', { name: 'Nothing here just yet' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Clear filters' }).click();
  await page
    .getByRole('heading', { name: 'Head Delta Motion' })
    .getByRole('link')
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Head Delta Motion',
  );
  await expect(
    page.getByText('Contact is not connected in this preview.'),
  ).toBeVisible();
  await page.getByRole('link', { name: /Omar Hassan/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Omar Hassan',
  );
});

test('theme persists and locale switch preserves filters without overflow', async ({
  page,
}) => {
  await page.goto('/en/demo?category=balls&sort=low');
  await expect(page.locator('.listing-card')).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Color theme' }).selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('link', { name: 'العربية' }).click();
  await expect(page).toHaveURL(/\/ar\/demo\?.*category=balls/);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('.listing-card')).toHaveCount(1);
  await page
    .getByRole('combobox', { name: 'مظهر الموقع' })
    .selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('both locales and themes fit a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 780 });
  for (const locale of ['en', 'ar']) {
    for (const theme of ['light', 'dark']) {
      await page.goto(`/${locale}/demo`);
      await page
        .getByRole('combobox', {
          name: locale === 'en' ? 'Color theme' : 'مظهر الموقع',
        })
        .selectOption(theme);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  }
});

test('category shortcuts preserve search and sort, and equipment images load', async ({
  page,
}) => {
  await page.goto('/en/demo?q=Head&sort=low');
  await page
    .getByRole('group', { name: 'Equipment' })
    .getByRole('link', { name: 'Balls', exact: true })
    .click();
  await expect(page).toHaveURL(/category=balls/);
  expect(new URL(page.url()).searchParams.get('q')).toBe('Head');
  expect(new URL(page.url()).searchParams.get('sort')).toBe('low');
  await expect(page.locator('.listing-card')).toHaveCount(1);
  const image = page.locator('.listing-card .equipment-art img');
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
    )
    .toBe(true);
  await expect(page.locator('.listing-card .art-label')).toHaveCount(0);
  await page
    .getByRole('group', { name: 'Equipment' })
    .getByRole('link', { name: 'All equipment' })
    .click();
  await expect(page.locator('.listing-card')).toHaveCount(2);
});

test('interactive inspection showcase and FAQ sections work in both locales', async ({
  page,
}) => {
  await page.goto('/en/demo');
  await expect(
    page.getByRole('heading', {
      name: 'Every listing requires structured court-ready disclosures.',
    }),
  ).toBeVisible();

  const frameTab = page.getByRole('tab', { name: /Frame & bumper guard/ });
  await frameTab.click();
  await expect(frameTab).toHaveAttribute('aria-selected', 'true');
  await expect(
    page.getByRole('heading', { name: 'Structural integrity first' }),
  ).toBeVisible();

  const ballsTab = page.getByRole('tab', { name: /Pressurized ball packs/ });
  await ballsTab.click();
  await expect(ballsTab).toHaveAttribute('aria-selected', 'true');
  await expect(
    page.getByRole('heading', { name: 'Clear quantity & seal status' }),
  ).toBeVisible();

  await expect(
    page.getByRole('heading', {
      name: 'Everything you need to know about the marketplace.',
    }),
  ).toBeVisible();
});

test('auth recovery and OAuth callback routes fail closed and fit EN/AR narrow themes', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  // OAuth cancellation and error callbacks redirect to fixed sign-in notices without reflecting raw descriptions.
  const cancelled = await request.get(
    '/en/auth/callback?error=access_denied&error_description=InjectedText&next=https://evil.example',
    { maxRedirects: 0 },
  );
  expect([302, 307]).toContain(cancelled.status());
  expect(cancelled.headers()['location']).toMatch(/\/en\/auth\/signin\?error=oauth_cancelled$/);
  expect(cancelled.headers()['cache-control']).toContain('no-store');
  expect(cancelled.headers()['referrer-policy']).toBe('no-referrer');

  const badRecovery = await request.get(
    '/ar/auth/recovery?token_hash=invalid_hash&type=recovery&next=https://evil.example',
    { maxRedirects: 0 },
  );
  expect([302, 307]).toContain(badRecovery.status());
  expect(badRecovery.headers()['location']).toMatch(/\/ar\/auth\/reset-password\?error=invalid$/);
  expect(badRecovery.headers()['cache-control']).toContain('no-store');
  expect(badRecovery.headers()['referrer-policy']).toBe('no-referrer');

  // Direct visit to reset-password without a verified recovery session never shows password inputs or account data.
  for (const locale of ['en', 'ar']) {
    const res = await page.goto(`/${locale}/auth/reset-password`);
    expect(res?.status()).toBe(200);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText('InjectedText');
  }

  // Narrow-viewport EN/AR light/dark check on forgot-password.
  await page.setViewportSize({ width: 320, height: 780 });
  for (const locale of ['en', 'ar']) {
    await page.goto(`/${locale}/auth/forgot-password`);
    const themeSelect = page.getByRole('combobox', {
      name: locale === 'en' ? 'Color theme' : 'مظهر الموقع',
    });
    for (const theme of ['light', 'dark']) {
      await themeSelect.selectOption(theme);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
  }
});

test('sticky header clears #equipment-heading anchor in LTR and RTL and preserves skip-link keyboard focus', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });

  for (const locale of ['en', 'ar'] as const) {
    await page.goto(`/${locale}/demo`);

    // Verify scroll-padding-top is not duplicated on html and scroll-margin-top is scoped to intended anchors.
    const scrollStyles = await page.evaluate(() => {
      const htmlPaddingTop = getComputedStyle(document.documentElement).scrollPaddingTop;
      const heading = document.getElementById('equipment-heading');
      const headingMarginTop = heading ? parseFloat(getComputedStyle(heading).scrollMarginTop) : 0;
      const tabPanel = document.querySelector('[role="tabpanel"][id]');
      const tabPanelMarginTop = tabPanel ? parseFloat(getComputedStyle(tabPanel).scrollMarginTop) : 0;
      return { htmlPaddingTop, headingMarginTop, tabPanelMarginTop };
    });
    expect(['auto', '0px']).toContain(scrollStyles.htmlPaddingTop);
    expect(scrollStyles.headingMarginTop).toBeGreaterThanOrEqual(80);
    expect(scrollStyles.tabPanelMarginTop).toBe(0);

    // Verify skip-link keyboard focus is visible above the sticky header.
    const skipLink = page.locator('.skip-link');
    await skipLink.focus();
    await expect(skipLink).toBeFocused();
    const skipBox = await skipLink.boundingBox();
    expect(skipBox).not.toBeNull();
    expect(skipBox!.y).toBeGreaterThanOrEqual(0);

    // Click the Hero Browse CTA (#equipment-heading) and verify #equipment-heading lands at a tight 8px-36px distance below sticky header.
    const browseCta = page.locator('.hero-actions a[href="#equipment-heading"]');
    await browseCta.click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/demo#equipment-heading$`));

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const header = document.querySelector('.site-header');
          const heading = document.getElementById('equipment-heading');
          if (!header || !heading) return -1;
          const headerRect = header.getBoundingClientRect();
          const headingRect = heading.getBoundingClientRect();
          if (window.scrollY <= 0) return -1;
          return Math.round(headingRect.top - headerRect.bottom);
        }),
      )
      .toBeGreaterThanOrEqual(8);

    const browseGap = await page.evaluate(() => {
      const header = document.querySelector('.site-header')!;
      const heading = document.getElementById('equipment-heading')!;
      return Math.round(heading.getBoundingClientRect().top - header.getBoundingClientRect().bottom);
    });
    expect(browseGap).toBeGreaterThanOrEqual(8);
    expect(browseGap).toBeLessThanOrEqual(36);

    // Click a category shortcut pill (#equipment-heading) and verify #equipment-heading lands at the same tight 8px-36px spacing below sticky header.
    await page.locator('.category-links a[href*="category=balls"]').click();
    await expect(page).toHaveURL(
      new RegExp(`/${locale}/demo\\?.*category=balls.*#equipment-heading$`),
    );

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const header = document.querySelector('.site-header');
          const heading = document.getElementById('equipment-heading');
          if (!header || !heading) return -1;
          const headerRect = header.getBoundingClientRect();
          const headingRect = heading.getBoundingClientRect();
          return Math.round(headingRect.top - headerRect.bottom);
        }),
      )
      .toBeGreaterThanOrEqual(8);

    const pillGap = await page.evaluate(() => {
      const header = document.querySelector('.site-header')!;
      const heading = document.getElementById('equipment-heading')!;
      return Math.round(heading.getBoundingClientRect().top - header.getBoundingClientRect().bottom);
    });
    expect(pillGap).toBeGreaterThanOrEqual(8);
    expect(pillGap).toBeLessThanOrEqual(36);
  }
});

test('privacy policy, terms of use, and baseline HTTP security headers work across EN/AR and narrow themes', async ({
  page,
  request,
}) => {
  // Baseline HTTP security headers on normal pages & preserved no-referrer on auth callbacks.
  const homeRes = await request.get('/en/demo');
  expect(homeRes.status()).toBe(200);
  expect(homeRes.headers()['x-content-type-options']).toBe('nosniff');
  expect(homeRes.headers()['x-frame-options']).toBe('DENY');
  expect(homeRes.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(homeRes.headers()['permissions-policy']).toContain('camera=()');

  // Footer links reach localized Privacy Policy and Terms of Use cleanly.
  await page.goto('/en/demo');
  const footer = page.locator('footer.site-footer');
  await footer.getByRole('link', { name: 'Privacy policy', exact: true }).click();
  await expect(page).toHaveURL(/\/en\/privacy$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Request account deletion', exact: true })).toBeVisible();

  await page.locator('footer.site-footer').getByRole('link', { name: 'Terms of use', exact: true }).click();
  await expect(page).toHaveURL(/\/en\/terms$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Terms of Use' })).toBeVisible();

  // Narrow-screen 320px EN/AR light/dark check with zero horizontal overflow.
  await page.setViewportSize({ width: 320, height: 780 });
  for (const route of ['privacy', 'terms'] as const) {
    for (const locale of ['en', 'ar'] as const) {
      await page.goto(`/${locale}/${route}`);
      const themeSelect = page.getByRole('combobox', {
        name: locale === 'en' ? 'Color theme' : 'مظهر الموقع',
      });
      for (const theme of ['light', 'dark']) {
        await themeSelect.selectOption(theme);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
      }
    }
  }
});
