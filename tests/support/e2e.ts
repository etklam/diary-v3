import { randomUUID } from 'node:crypto';
import { expect, test as base, type Page } from '@playwright/test';
export { e2eBaseURL } from './e2e-origin';

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

  // The private desktop shell keeps the preference selects behind a disclosure.
  // Set `open` on the element instead of clicking the summary: the shell can
  // still be swapping in, and a click would wait on a summary that is not
  // visible yet. The disclosure is uncontrolled, so the attribute sticks — but
  // a shell swap replaces the element, so re-open before each attempt.
  async function openPreferenceDisclosure() {
    const details = page.locator('details.desktop-preferences-disclosure');
    if (await details.count() === 0) return;
    await details.first().evaluate(element => { (element as HTMLDetailsElement).open = true; }).catch(() => {});
  }

  await openPreferenceDisclosure();
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
    // The desktop shell resolved after the first attempt; its disclosure is a
    // fresh element, so open that one before waiting on the select.
    await openPreferenceDisclosure();
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

export async function selectAccountLocale(page: Page, value: string) {
  await expect(page.getByTestId('sign-out')).toBeAttached();
  const current = await page.request.get('/api/user/settings');
  expect(current.status()).toBe(200);
  const currentLocale = (await current.json() as { settings: { locale: string } }).settings.locale;
  const save = currentLocale === value ? null : page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/user/settings' && response.request().method() === 'PUT' && response.ok(),
  );
  await selectLocale(page, value);
  if (save) await save;
  await expect.poll(async () => {
    const response = await page.request.get('/api/user/settings');
    if (!response.ok()) return null;
    return (await response.json() as { settings: { locale: string } }).settings.locale;
  }).toBe(value);
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

async function openDisclosure(page: Page, selector: string) {
  // The composer can still be resolving its account when a test asks for a
  // disclosure, so wait for the element before deciding it is absent.
  const details = page.locator(selector).first();
  await details.waitFor({ state: 'attached', timeout: 10_000 }).catch(() => {});
  if (await details.count() === 0) return;
  if (await details.getAttribute('open') === null) await details.locator(':scope > summary').click();
}

export async function openQuickOptions(page: Page) {
  await openDisclosure(page, 'details.quick-options');
}

/** Destination (date and save mode) is a collapsed summary; open it to edit either. */
export async function openQuickDestination(page: Page) {
  await openDisclosure(page, 'details.quick-destination');
}

export async function openQuickSnippets(page: Page) {
  await openDisclosure(page, 'details.quick-snippets');
}

/** The editor defers its optional regions; open one before filling it. */
export async function openEditorSection(page: Page, key: 'original' | 'transactions' | 'review' | 'reminders') {
  await openDisclosure(page, `[data-testid="editor-section-${key}"]`);
}

// Diary browsing destinations stay visible in the desktop sidebar and mobile shell.
export async function clickNav(page: Page, name: string) {
  const view = (page.viewportSize()?.width ?? 1280) < 768;
  const normalized = name === 'Start' ? 'Overview' : name;
  const diaryView = ['Diary library', 'Timeline', 'Calendar'].includes(name);
  // Only the trade-management group is still a disclosure; diary sub-items sit
  // in the open list.
  const secondary = ['Trading principles', 'Price reminders'].includes(name);
  const secondaryHref: Record<string, string> = { Partners: '/partners', 'Trading principles': '/discipline', 'Diary reminders': '/alerts', 'Price reminders': '/stocks/alerts' };
  const tool = ['Position sizing', 'Financial freedom', 'Relative value', 'Seasonality', 'ETF research', 'Market rotation', 'SEC filings'].includes(name);
  const toolHref: Record<string, string> = { 'Position sizing': '/tools/position-sizing', 'Financial freedom': '/tools/financial-freedom', 'Relative value': '/tools/relative-value', Seasonality: '/tools/seasonality', 'ETF research': '/tools/etf', 'Market rotation': '/tools/market-rotation', 'SEC filings': '/tools/sec-filings' };
  if (diaryView) {
    const destination = name === 'Diary library' ? '/diaries' : name === 'Timeline' ? '/timeline' : '/calendar';
    // The bottom bar has five slots, so it shortens the library label; the
    // sidebar keeps the full name.
    const target = view
      ? page.getByTestId('mobile-diary-navigation').locator(`a[href="${destination}"]`)
      : page.locator('.desktop-nav').getByRole('link', { name, exact: true });
    await expect(target).toBeVisible();
    if (new URL(page.url()).pathname !== destination) {
      await target.click();
      await page.waitForURL(url => url.pathname === destination);
    }
    return;
  }
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
  if (view) {
    const dialog = page.getByTestId('mobile-menu-dialog');
    if (!(await dialog.isVisible().catch(() => false))) await page.getByTestId('mobile-menu').click();
    if (secondary) {
      const href = secondaryHref[name];
      const section = dialog.locator(`details.nav-more:has(a[href="${href}"])`);
      await expect(section).toHaveCount(1);
      const target = section.locator(`a[href="${href}"]`);
      if (!(await target.isVisible())) await section.locator(':scope > summary').click();
      await target.click();
      return;
    }
    if (tool) {
      await dialog.getByRole('link', { name: 'Tools', exact: true }).click();
      // The sidebar now also lists every tool, so scope to the page content.
      await page.locator('#main').locator(`a[href="${toolHref[name]}"]`).click();
      return;
    }
    await dialog.getByRole('link', { name: normalized, exact: true }).click();
    return;
  }
  if (secondary) {
    const href = secondaryHref[name];
    const section = page.locator(`.desktop-nav details.nav-more:has(a[href="${href}"])`);
    await expect(section).toHaveCount(1);
    const target = section.locator(`a[href="${href}"]`);
    if (!(await target.isVisible())) await section.locator(':scope > summary').click();
    await target.click();
    return;
  }
  if (tool) {
    await page.locator('.desktop-nav').getByRole('link', { name: 'Tools', exact: true }).click();
    await page.locator('#main').locator(`a[href="${toolHref[name]}"]`).click();
    return;
  }
  await page.getByRole('link', { name: normalized, exact: true }).click();
}
