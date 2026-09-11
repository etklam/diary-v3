import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expect, test, selectLocale, selectTheme } from '../support/e2e';

const password = 'synthetic-discovery-password';

type Seed = { date: string; title: string; content?: string; tags?: string[]; stockSymbols?: string[]; thesis?: string; risk?: string; execution?: string; reviewDueAt?: string; transactions?: Array<{ symbol: string; type: 'BUY' | 'SELL'; quantity: string; price: string; tradeDate: string }> };

async function signIn(page: Page, email: string) {
  expect((await page.request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200);
  await page.goto('/login?returnTo=%2Fdiaries%2Fnew');
  await selectLocale(page, 'en');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/diaries\/new$/);
  await selectLocale(page, 'en');
}

async function seed(page: Page, entries: Seed[]) {
  const csrf = (await page.context().cookies()).find(cookie => cookie.name === 'csrf-token')!.value;
  for (const entry of entries) {
    expect((await page.request.post('/api/diaries', { headers: { 'x-csrf-token': csrf }, data: { ...entry, content: entry.content ?? 'Demand observations with plain text.' } })).status()).toBe(201);
  }
}

function libraryRow(page: Page) {
  return page.locator('.diary-records > li');
}

test('library search, symbol filter, review status and sorting narrow results', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, `discovery-${randomUUID()}@example.test`);
  await seed(page, [
    { date: '2026-09-01', title: 'NVDA demand remains intact', stockSymbols: ['NVDA'], tags: ['AI', 'earnings'], thesis: 'AI demand stays intact' },
    { date: '2026-09-02', title: 'NVDA position sizing after the run', stockSymbols: ['NVDA'], reviewDueAt: '2026-09-03T00:00:00.000Z' },
    { date: '2026-09-03', title: 'AAPL wait for the guide', stockSymbols: ['AAPL'], tags: ['earnings'] },
    { date: '2026-09-04', title: 'TSLA delivery number is noise', stockSymbols: ['TSLA'] },
    { date: '2026-09-05', title: '投資決策：等待需求確認', stockSymbols: ['NVDA'], tags: ['長期'] },
    { date: '2026-08-15', title: 'August thesis review', stockSymbols: ['NVDA'], reviewDueAt: '2026-08-20T00:00:00.000Z', transactions: [{ symbol: 'NVDA', type: 'BUY', quantity: '1.25', price: '110.00', tradeDate: '2026-08-15T02:30:00.000Z' }] },
    { date: '2026-08-20', title: 'Reviewed August entry', reviewDueAt: '2026-08-18T00:00:00.000Z', tags: ['research'] },
  ]);

  await page.goto('/diaries');
  await expect(page.getByRole('status')).toContainText('7 diaries');
  await expect(libraryRow(page)).toHaveCount(7);
  // Rows carry the investment context without opening the diary.
  await expect(libraryRow(page).first()).toContainText('NVDA');
  await expect(page.locator('.diary-library-symbol').first()).toHaveText('NVDA');
  await expect(page.locator('.diary-library-review').first()).toContainText('Due for review');

  // Free text reaches the reasoning fields and tags.
  await page.getByRole('searchbox', { name: 'Search title or content', exact: true }).fill('stretched');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('0 diaries');
  // thesis search
  await page.getByRole('searchbox', { name: 'Search title or content', exact: true }).fill('demand stays intact');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('1 diaries');
  // tag search
  await page.getByRole('searchbox', { name: 'Search title or content', exact: true }).fill('長期');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('1 diaries');
  await expect(libraryRow(page).first()).toContainText('投資決策');

  // Symbol filter is exact and case-insensitive, and different from text search.
  await page.getByRole('searchbox', { name: 'Search title or content', exact: true }).fill('');
  await page.getByRole('textbox', { name: 'Company symbol', exact: true }).fill('nvda');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('4 diaries');
  await expect(page.locator('.diary-library-symbol')).toHaveText(['NVDA', 'NVDA', 'NVDA', 'NVDA']);

  // Review status filter.
  await page.getByRole('textbox', { name: 'Company symbol', exact: true }).fill('');
  await page.getByRole('combobox', { name: 'Review status', exact: true }).selectOption('pending');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('3 diaries');

  // Date range and sort live behind the advanced disclosure.
  await page.getByTestId('diary-advanced').locator('summary').click();
  await page.getByLabel('From date', { exact: true }).fill('2026-08-01');
  await page.getByLabel('Through date', { exact: true }).fill('2026-08-31');
  await page.getByRole('combobox', { name: 'Sort diaries', exact: true }).selectOption('title-asc');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('2 diaries');
  await expect(libraryRow(page).first()).toContainText('August thesis review');

  // Clear filters restores everything.
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('7 diaries');
});

test('filter changes reset the page and Back preserves the filtered context', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, `discovery-page-${randomUUID()}@example.test`);
  await seed(page, Array.from({ length: 12 }, (_, index) => ({
    date: `2026-09-${String(index + 1).padStart(2, '0')}`,
    title: `Entry ${String(index + 1).padStart(2, '0')}`,
    stockSymbols: index < 2 ? ['AAPL'] : undefined,
  })));
  await page.goto('/diaries');
  await page.getByTestId('diary-advanced').locator('summary').click();
  await page.getByRole('combobox', { name: 'Diaries per page', exact: true }).selectOption('10');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(libraryRow(page)).toHaveCount(10);
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(libraryRow(page)).toHaveCount(2);

  // A restrictive filter applied on the last page lands on page 1, not empty.
  await page.getByRole('searchbox', { name: 'Search title or content', exact: true }).fill('Entry 01');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(page).not.toHaveURL(/page=2/);
  await expect(libraryRow(page)).toHaveCount(1);
  await expect(page.getByRole('status')).toContainText('1 diaries');

  // Pagination keeps the active filter.
  await page.getByRole('searchbox', { name: 'Search title or content', exact: true }).fill('Entry');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await page.getByRole('combobox', { name: 'Diaries per page', exact: true }).selectOption('10');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page).toHaveURL(/search=Entry/);

  // Opening a diary and going Back restores filters and page.
  await expect(page).toHaveURL(/page=2/);
  await libraryRow(page).first().getByRole('link').click();
  await expect(page).toHaveURL(/\/diaries\/\d+$/);
  await page.goBack();
  await expect(page).toHaveURL(/search=Entry/);
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByRole('searchbox', { name: 'Search title or content', exact: true })).toHaveValue('Entry');
  await expect(libraryRow(page)).toHaveCount(2);
});

test('a slow earlier search response never replaces the newer result', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, `discovery-race-${randomUUID()}@example.test`);
  await seed(page, [
    { date: '2026-09-01', title: 'Slow query target', content: 'unique-slow-needle' },
    { date: '2026-09-02', title: 'Fast query target', content: 'unique-fast-needle' },
  ]);
  await page.goto('/diaries');
  let slowArmed = false;
  await page.route('**/api/diaries/summary*', async route => {
    const url = new URL(route.request().url());
    if (!slowArmed && url.searchParams.get('search') === 'unique-slow-needle') {
      slowArmed = true;
      await new Promise(resolve => setTimeout(resolve, 2500));
      await route.continue();
      return;
    }
    await route.continue();
  });
  await page.getByRole('searchbox', { name: 'Search title or content', exact: true }).fill('unique-slow-needle');
  const slowRequest = page.waitForRequest(request => request.url().includes('search=unique-slow-needle'));
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await slowRequest;
  await page.getByRole('searchbox', { name: 'Search title or content', exact: true }).fill('unique-fast-needle');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(libraryRow(page)).toHaveCount(1);
  await expect(libraryRow(page)).toContainText('Fast query target');
  // The slow response lands afterwards; the UI keeps showing the newer result.
  await page.waitForTimeout(3000);
  await expect(libraryRow(page)).toHaveCount(1);
  await expect(libraryRow(page)).toContainText('Fast query target');
});

test('timeline groups by month, loads more, and returns from a diary', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, `discovery-timeline-${randomUUID()}@example.test`);
  await seed(page, [
    ...Array.from({ length: 22 }, (_, index) => ({ date: `2026-09-${String(index + 1).padStart(2, '0')}`, title: `September entry ${index + 1}`, stockSymbols: index === 0 ? ['NVDA'] : undefined })),
    ...Array.from({ length: 5 }, (_, index) => ({ date: `2026-08-${String(index + 1).padStart(2, '0')}`, title: `August entry ${index + 1}` })),
  ]);
  await page.goto('/timeline');
  await expect(page.locator('.timeline-month')).toHaveCount(1);
  await expect(page.locator('.timeline-month header h2')).toHaveText('September 2026');
  await expect(page.getByTestId('timeline-entry')).toHaveCount(20);
  await page.getByRole('button', { name: 'Load more diaries', exact: true }).click();
  await expect(page.getByTestId('timeline-entry')).toHaveCount(27);
  await expect(page.locator('.timeline-month')).toHaveCount(2);
  await expect(page.locator('.timeline-symbol').first()).toHaveText('NVDA');
  await expect(page.locator('.timeline-month header h2').last()).toHaveText('August 2026');
  await expect(page.getByRole('status')).toContainText('27 diaries loaded');

  // Opening a diary and returning keeps the timeline usable. Entries carry two
  // links (title and the bounded "read full diary" link) to the same diary.
  await page.getByTestId('timeline-entry').first().getByRole('link').first().click();
  await expect(page).toHaveURL(/\/diaries\/\d+$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/timeline/);
  await expect(page.getByTestId('timeline-entry').first()).toBeVisible();

  // Date filter with no matches shows the timeline empty state.
  await page.getByLabel('From date', { exact: true }).fill('2026-01-01');
  await page.getByLabel('Through date', { exact: true }).fill('2026-01-31');
  await page.getByRole('button', { name: 'Apply dates', exact: true }).click();
  await expect(page.locator('.timeline-empty')).toBeVisible();
});

test('scale: bounded pagination stays fast and requests stay batched at 120 diaries', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, `discovery-scale-${randomUUID()}@example.test`);
  const symbols = ['NVDA', 'AAPL', 'MSFT', 'TSLA'];
  const csrf = (await page.context().cookies()).find(cookie => cookie.name === 'csrf-token')!.value;
  for (let index = 0; index < 120; index++) {
    expect((await page.request.post('/api/diaries', {
      headers: { 'x-csrf-token': csrf },
      data: {
        date: new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10),
        title: `Scale diary ${index + 1} ${index % 3 === 0 ? '規模測試' : 'position'}`,
        content: `Entry ${index + 1}. `.repeat(10),
        stockSymbols: index % 7 === 0 ? [symbols[index % symbols.length]!] : undefined,
        tags: index % 5 === 0 ? ['research'] : [],
      },
    })).status()).toBe(201);
  }
  const listRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/diaries/summary')) listRequests.push(request.url()); });

  const started = Date.now();
  await page.goto('/diaries');
  await expect(page.getByRole('status')).toContainText('120 diaries');
  const firstLoad = Date.now() - started;
  expect(listRequests.length).toBeLessThanOrEqual(2); // one per load; dev StrictMode may double-fire

  // Every user action triggers exactly one bounded list request. Waiting for
  // the response itself keeps the count deterministic: URL and result text can
  // settle before the fetch lands.
  async function expectSingleRequest(action: () => Promise<void>, settle: () => Promise<void>) {
    const before = listRequests.length;
    const responsePromise = page.waitForResponse(response => response.url().includes('/api/diaries/summary'));
    await action();
    await responsePromise;
    await settle();
    expect(listRequests.length, listRequests.join(' | ')).toBe(before + 1);
  }

  await expectSingleRequest(
    async () => {
      await page.getByRole('searchbox', { name: 'Search title or content', exact: true }).fill('規模測試');
      await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
    },
    async () => { await expect(page.getByRole('status')).toContainText('40 diaries'); },
  );
  await expectSingleRequest(
    async () => {
      await page.getByRole('searchbox', { name: 'Search title or content', exact: true }).fill('');
      await page.getByRole('textbox', { name: 'Company symbol', exact: true }).fill('MSFT');
      await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
    },
    async () => { await expect(page.getByRole('status')).toContainText('4 diaries'); },
  );
  await expectSingleRequest(
    async () => {
      await page.getByRole('textbox', { name: 'Company symbol', exact: true }).fill('');
      await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
    },
    async () => { await expect(page.getByRole('status')).toContainText('120 diaries'); },
  );
  await expectSingleRequest(
    async () => { await page.getByRole('button', { name: 'Next page', exact: true }).click(); },
    async () => { await expect(page).toHaveURL(/page=2/); },
  );

  // Timeline load-more stays bounded: 20 per page, one request per step.
  listRequests.length = 0;
  await page.goto('/timeline');
  await expect(page.getByTestId('timeline-entry')).toHaveCount(20);
  expect(listRequests.length).toBeLessThanOrEqual(2);
  await expectSingleRequest(
    async () => { await page.getByRole('button', { name: 'Load more diaries', exact: true }).click(); },
    async () => { await expect(page.getByTestId('timeline-entry')).toHaveCount(40); },
  );
  console.log(`SCALE first-load=${firstLoad}ms requests=${JSON.stringify(listRequests)}`);
  expect(firstLoad).toBeLessThan(5_000);
});

for (const width of [390, 768]) {
  test(`library and timeline stay compact without overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await signIn(page, `discovery-mobile-${width}-${randomUUID()}@example.test`);
    await seed(page, [
      { date: '2026-09-01', title: '一個非常非常非常非常非常非常非常非常長的中文投資決策標題需要被截斷或自然換行', stockSymbols: ['NVDA', 'AAPL', 'MSFT', 'TSLA', 'AMD'], tags: ['research', 'evidence', '長期', 'AI'], content: '這篇記錄的內容很長。'.repeat(20) },
      { date: '2026-09-02', title: 'A very long English investment decision title about position sizing and evidence accumulation', content: 'Long markdown content\n\n## Heading\n\n- item one\n- item two\n\nhttps://example.test/very/long/url/that/should/not/dominate/the/excerpt' },
      { date: '2026-09-03', title: 'No tags or symbols', content: '.' },
    ]);
    await page.goto('/diaries');
    await expect(libraryRow(page)).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await selectTheme(page, 'dark');
    await page.screenshot({ path: `docs/design/evidence/diary-list/discovery-${width}-dark.png`, fullPage: true });
    await selectTheme(page, 'light');
    await page.screenshot({ path: `docs/design/evidence/diary-list/discovery-${width}-light.png`, fullPage: true });
    await page.goto('/timeline');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `docs/design/evidence/diary-list/timeline-${width}-light.png`, fullPage: true });
  });
}
