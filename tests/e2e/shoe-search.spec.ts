import { test, expect } from '@playwright/test';

test('shoe size search persists across refresh, locale and category navigation', async ({ page }, info) => {
  await page.goto('/en?category=shoes');
  await page.getByLabel('Shoe size (EU)', { exact: true }).selectOption('45.5');
  await page.getByRole('button', { name: 'Find equipment' }).click();
  await expect(page).toHaveURL(/size=45\.5/);
  await page.reload();
  await expect(page.locator('select[name="size"]')).toHaveValue('45.5');
  await page.getByRole('link', { name: 'العربية' }).click();
  await expect(page).toHaveURL(/\/ar\?.*size=45\.5/);
  await expect(page.locator('select[name="size"]')).toHaveValue('45.5');
  for (const theme of ['light', 'dark']) {
    await page.locator('.theme-switch input[value="' + theme + '"]').check();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  if (info.project.name === 'mobile') await page.screenshot({ path: '.cache/shoe-search-ar-dark.png', fullPage: true });
  await page.goto('/en?category=shoes&size=45.5&min=100');
  await page.getByRole('group', { name: 'Equipment' }).getByRole('link', { name: 'Bags', exact: true }).click();
  await expect(page).toHaveURL(/category=bags/);
  expect(new URL(page.url()).searchParams.has('size')).toBe(false);
  expect(new URL(page.url()).searchParams.get('min')).toBe('100');
  await page.goBack();
  await expect(page.locator('select[name="size"]')).toHaveValue('45.5');
  await page.goto('/en?size=42.3');
  await expect(page.locator('main [role="alert"]')).toBeVisible();
});
