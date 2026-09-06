import type { Page } from '@playwright/test';
import { expect, test, selectLocale, selectTheme } from '../support/e2e';

type QuoteFixture = {
  symbol: string;
  regularMarketPrice: number;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  currency: string | null;
  marketState: string | null;
  lastUpdateTime: string | null;
};

const quotes: Record<string, QuoteFixture> = {
  UP: { symbol: 'UP', regularMarketPrice: 100, previousClose: 90, change: 10, changePercent: 11.111111, currency: 'USD', marketState: 'REGULAR', lastUpdateTime: '2026-09-05T12:00:00.000Z' },
  DOWN: { symbol: 'DOWN', regularMarketPrice: 90, previousClose: 100, change: -10, changePercent: -10, currency: 'USD', marketState: 'REGULAR', lastUpdateTime: '2026-09-05T12:00:00.000Z' },
  FLAT: { symbol: 'FLAT', regularMarketPrice: 100, previousClose: 100, change: 0, changePercent: 0, currency: 'USD', marketState: 'REGULAR', lastUpdateTime: '2026-09-05T12:00:00.000Z' },
  MISSING: { symbol: 'MISSING', regularMarketPrice: 100, previousClose: null, change: null, changePercent: null, currency: null, marketState: null, lastUpdateTime: null },
};

async function palette(page: Page) {
  return page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const resolve = (token: string) => {
      const probe = document.createElement('span');
      probe.style.color = root.getPropertyValue(token);
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    };
    return { up: resolve('--market-up'), down: resolve('--market-down'), flat: resolve('--market-flat') };
  });
}

test('quote direction colors retain semantics across themes and locales', async ({ page }) => {
  await page.route('**/api/market/quote/*', async route => {
    const symbol = new URL(route.request().url()).pathname.split('/').at(-1)!;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(quotes[symbol] ?? quotes.MISSING) });
  });
  await page.route('**/api/market/historical*', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ timestamp: 1788609600, close: 100 }]) });
  });

  for (const [symbol, quote] of Object.entries(quotes)) {
    await page.goto(`/stocks/${symbol}`);
    await selectLocale(page, 'en');
    await expect(page.getByTestId('market-price')).toBeVisible();
    const metrics = page.locator('.market-metrics > div');
    const change = metrics.nth(3).locator('dd');
    const changePercent = metrics.nth(4).locator('dd');
    const expectedClass = quote.change === null ? null : quote.change > 0 ? 'market-up' : quote.change < 0 ? 'market-down' : 'market-flat';
    if (quote.change === null) {
      await expect(change).toHaveText('—');
      await expect(changePercent).toHaveText('—');
      expect(await change.getAttribute('class')).not.toMatch(/market-/);
      expect(await changePercent.getAttribute('class')).not.toMatch(/market-/);
    } else {
      await expect(change).toHaveClass(new RegExp(expectedClass!));
      await expect(changePercent).toHaveClass(new RegExp(expectedClass!));
      await expect(change).toHaveText(quote.change > 0 ? /^\+/u : quote.change < 0 ? /^-/u : /^0/u);
      await expect(changePercent).toHaveText(quote.change > 0 ? /^\+/u : quote.change < 0 ? /^-/u : /^0/u);
      for (const theme of ['light', 'dark'] as const) {
        await selectTheme(page, theme);
        const colors = await palette(page);
        await expect(change).toHaveCSS('color', colors[quote.change > 0 ? 'up' : quote.change < 0 ? 'down' : 'flat']);
        await expect(changePercent).toHaveCSS('color', colors[quote.change > 0 ? 'up' : quote.change < 0 ? 'down' : 'flat']);
      }
    }
    for (const locale of ['zh-TW', 'zh-CN', 'en'] as const) {
      await selectLocale(page, locale);
      if (expectedClass) {
        await expect(change).toHaveClass(new RegExp(expectedClass));
        await expect(changePercent).toHaveClass(new RegExp(expectedClass));
      }
    }
  }
});
