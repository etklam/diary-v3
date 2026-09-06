import { randomUUID } from 'node:crypto';
import { expect, test as base, type Page } from '@playwright/test';

// Each scenario exercises the real limiter without sharing another test's quota.
// This header is interpreted only by the disposable E2E server.
export const test = base.extend<{ isolatedApi: void }>({
  isolatedApi: [async ({ context }, use) => {
    await context.setExtraHTTPHeaders({ 'x-e2e-test-id': randomUUID() });
    await use();
  }, { auto: true }],
});
export { expect };

async function selectPreference(page: Page, desktopTestId: string, mobileTestId: string, value: string) {
  const desktopControl = page.getByTestId(desktopTestId);
  if (await desktopControl.isVisible()) {
    await desktopControl.selectOption(value);
    return;
  }

  const dialog = page.getByTestId('mobile-menu-dialog');
  if (!(await dialog.isVisible())) await page.getByTestId('mobile-menu').click();
  await page.getByTestId(mobileTestId).selectOption(value);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
}

export async function selectLocale(page: Page, value: string) {
  await selectPreference(page, 'locale-select', 'mobile-locale-select', value);
}

export async function selectTheme(page: Page, value: string) {
  await selectPreference(page, 'theme-select', 'mobile-theme-select', value);
}

export async function signOut(page: Page) {
  const desktopControl = page.getByTestId('sign-out');
  if (await desktopControl.isVisible()) {
    await desktopControl.click();
    return;
  }

  const dialog = page.getByTestId('mobile-menu-dialog');
  if (!(await dialog.isVisible())) await page.getByTestId('mobile-menu').click();
  await page.getByTestId('mobile-sign-out').click();
}

export async function focusQuickTrigger(page: Page) {
  const trigger = (page.viewportSize()?.width ?? 1280) < 768
    ? page.getByTestId('mobile-menu')
    : page.getByTestId('quick-entry');
  await trigger.focus();
}

export async function openQuick(page: Page) {
  if ((page.viewportSize()?.width ?? 1280) < 768) {
    await focusQuickTrigger(page);
    await page.keyboard.press('Control+j');
    return;
  }
  await page.getByTestId('quick-entry').click();
}

// Compact shell (<768px) keeps the navigation links inside the mobile menu
// dialog, so open it first; desktop clicks the sidebar link directly.
export async function clickNav(page: Page, name: string) {
  if ((page.viewportSize()?.width ?? 1280) < 768) {
    await page.getByTestId('mobile-menu').click();
    await page.getByTestId('mobile-menu-dialog').getByRole('link', { name, exact: true }).click();
    return;
  }
  await page.getByRole('link', { name, exact: true }).click();
}
