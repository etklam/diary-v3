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
  // Session bootstrap decides the shell: SSR renders the public shell, so on
  // phones the desktop select can disappear mid-action when the private shell
  // swaps in its menu. Let selectOption retry briefly, then pick the control
  // that actually belongs to the resolved shell.
  const desktopControl = page.getByTestId(desktopTestId);
  try {
    await desktopControl.selectOption(value, { timeout: 1500 });
    return;
  } catch {
    // Either the private shell hid the desktop control (use the menu) or the
    // public select is still loading its saved preference (keep waiting).
  }

  const menu = page.getByTestId('mobile-menu');
  const hasMenu = await menu.waitFor({ state: 'visible', timeout: 2000 }).then(() => true).catch(() => false);
  if (!hasMenu) {
    await desktopControl.selectOption(value);
    return;
  }

  const dialog = page.getByTestId('mobile-menu-dialog');
  await menu.click();
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
  await focusQuickTrigger(page);
  await page.keyboard.press('Control+j');
}

// Compact shell (<768px) keeps the navigation links inside the mobile menu
// dialog, so open it first; desktop clicks the sidebar link directly.
export async function clickNav(page: Page, name: string) {
  const view = (page.viewportSize()?.width ?? 1280) < 768;
  const normalized = name === 'Start' ? 'Overview' : name === 'Diary library' ? 'Diary' : name;
  const diaryView = ['Timeline', 'Calendar', 'Diary library'].includes(name);
  const subnavName = name === 'Diary library' ? 'Diary library' : name;
  const secondary = ['Partners', 'Trading principles', 'Diary reminders', 'Price reminders'].includes(name);
  const tool = ['Position sizing', 'Financial freedom', 'Relative value', 'Seasonality', 'ETF research', 'Market rotation', 'SEC filings'].includes(name);
  const toolHref: Record<string, string> = { 'Position sizing': '/tools/position-sizing', 'Financial freedom': '/tools/financial-freedom', 'Relative value': '/tools/relative-value', Seasonality: '/tools/seasonality', 'ETF research': '/tools/etf', 'Market rotation': '/tools/market-rotation', 'SEC filings': '/tools/sec-filings' };
  if (name === 'Quick diary') {
    if (view) {
      const dialog = page.getByTestId('mobile-menu-dialog');
      if (!(await dialog.isVisible().catch(() => false))) await page.getByTestId('mobile-menu').click();
      await dialog.getByTestId('mobile-quick-entry').click();
    } else {
      await page.getByTestId('quick-entry').click();
    }
    return;
  }
  if (view && diaryView) {
    const dialog = page.getByTestId('mobile-menu-dialog');
    const diaryNavigation = page.getByTestId('diary-navigation');
    if (!(await dialog.isVisible().catch(() => false))) await page.getByTestId('mobile-menu').click();
    await dialog.getByRole('link', { name: 'Diary', exact: true }).click();
    await diaryNavigation.waitFor({ state: 'visible' });
    await diaryNavigation.getByRole('link', { name: subnavName, exact: true }).click();
    return;
  }
  if ((page.viewportSize()?.width ?? 1280) < 768) {
    const dialog = page.getByTestId('mobile-menu-dialog');
    if (!(await dialog.isVisible().catch(() => false))) await page.getByTestId('mobile-menu').click();
    if (secondary && !(await dialog.getByRole('link', { name, exact: true }).isVisible().catch(() => false))) await dialog.locator('details.nav-more > summary').click();
    if (tool) {
      await dialog.getByRole('link', { name: 'Tools', exact: true }).click();
      await page.locator(`a[href="${toolHref[name]}"]`).click();
      return;
    }
    await dialog.getByRole('link', { name: normalized, exact: true }).click();
    return;
  }
  if (diaryView) {
    const diaryNavigation = page.getByTestId('diary-navigation');
    if (!(await diaryNavigation.count())) await page.getByRole('link', { name: 'Diary', exact: true }).click();
    await diaryNavigation.waitFor({ state: 'visible' });
    await diaryNavigation.getByRole('link', { name: subnavName, exact: true }).click();
    return;
  }
  if (secondary) {
    const disclosure = page.locator('.desktop-nav details.nav-more');
    if (!(await disclosure.getByRole('link', { name, exact: true }).isVisible().catch(() => false))) await disclosure.locator('summary').click();
  }
  if (tool) {
    await page.getByRole('link', { name: 'Tools', exact: true }).click();
    await page.locator(`a[href="${toolHref[name]}"]`).click();
    return;
  }
  await page.getByRole('link', { name: normalized, exact: true }).click();
}
