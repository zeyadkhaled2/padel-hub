import { test, expect } from '@playwright/test';

test('theme choices support keyboard navigation, persistence and system changes', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/en/demo?category=balls&sort=low');
  const group = page.getByRole('group', { name: 'Color theme' });
  const system = group.getByRole('radio', { name: 'System', exact: true });
  await expect(system).toBeChecked();
  await system.focus();
  await page.keyboard.press('ArrowRight');
  await expect(group.getByRole('radio', { name: 'Light', exact: true })).toBeChecked();
  await page.keyboard.press('ArrowRight');
  await expect(group.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(group.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
  await system.check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(system).toBeChecked();
  await page.getByRole('link', { name: 'العربية', exact: true }).click();
  await expect(page).toHaveURL(/\/ar\/demo\?category=balls&sort=low/);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('.theme-switch input[value="system"]')).toBeChecked();
  await expect(page.locator('.language')).toHaveAttribute('lang', 'en');
  await expect(page.locator('.language')).toHaveAttribute('hreflang', 'en');
});
