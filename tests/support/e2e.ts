import { randomUUID } from 'node:crypto';
import { test as base, type Page } from '@playwright/test';

// Each scenario exercises the real limiter without sharing another test's quota.
// This header is interpreted only by the disposable E2E server.
export const test = base.extend<{ isolatedApi: void }>({
  isolatedApi: [async ({ context }, use) => {
    await context.setExtraHTTPHeaders({ 'x-e2e-test-id': randomUUID() });
    await use();
  }, { auto: true }],
});
export { expect } from '@playwright/test';

// Compact shell (<760px) keeps the navigation links inside the mobile menu
// dialog, so open it first; desktop clicks the sidebar link directly.
export async function clickNav(page: Page, name: string) {
  if ((page.viewportSize()?.width ?? 1280) < 760) {
    await page.getByTestId('mobile-menu').click();
    await page.getByTestId('mobile-menu-dialog').getByRole('link', { name, exact: true }).click();
    return;
  }
  await page.getByRole('link', { name, exact: true }).click();
}
