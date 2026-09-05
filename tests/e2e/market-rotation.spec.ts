import { expect, test } from '../support/e2e';

const baseRow = {
  symbol: 'XLK', name: 'Technology Select Sector SPDR Fund', groupType: 'sector', sectorName: 'Technology',
  lastPrice: 252.34, rsi14: 64.2, above20d: true, above50d: true, maStatus: 'bullish_stack',
  percentFromHigh: -2.1, rotationScore: 92.4, rotationScoreDelta2W: 9.1, rotationRank: 1, rankDelta2W: 2,
  rsiDelta2W: 3.2, twoWeekPerformancePct: 4.8, twoWeekTrend: [{ date: '2026-09-04', value: 100 }],
  signal: 'turning_strong', signalStatus: 'complete',
};

function monitorFixture(scope: 'sectors' | 'indexes' | 'core', options: { state?: 'risk_on' | 'neutral' | 'defensive' | 'risk_off' | 'unknown'; signal?: 'turning_strong' | 'strong_but_extended' | 'losing_momentum' | 'breaking_down' | 'early_recovery' | 'neutral' | null; insufficient?: boolean } = {}) {
  const insufficient = options.insufficient ?? false;
  const row = { ...baseRow, signal: insufficient ? null : options.signal ?? 'breaking_down', signalStatus: insufficient ? 'insufficient_data' : 'complete', ...(insufficient ? { lastPrice: null, rsi14: null, rotationScore: null, rotationScoreDelta2W: null, rotationRank: null, rankDelta2W: null, rsiDelta2W: null, twoWeekPerformancePct: null, twoWeekTrend: [{ date: '2026-09-04', value: null }], above20d: null, above50d: null } : {}) };
  const marketState = options.state ?? 'risk_off';
  const ratio = insufficient ? { count: 0, total: 0, ratio: null } : { count: 1, total: 1, ratio: 1 };
  const expectedSymbolCount = scope === 'sectors' ? 11 : scope === 'indexes' ? 8 : 23;
  return {
    asOfDate: '2026-09-04', comparisonDate: null, summaryAsOfDate: scope === 'sectors' ? '2026-09-04' : '2026-09-03', rankScope: scope,
    marketState, breadthCondition: insufficient ? 'unknown' : 'weak_breadth', breadthConfirmation: insufficient ? 'unknown' : 'warning',
    summary: { marketState, breadthCondition: insufficient ? 'unknown' : 'weak_breadth', breadthConfirmation: insufficient ? 'unknown' : 'warning', above20d: ratio, above50d: ratio, averageRsi: insufficient ? null : 64.2 },
    summaryCards: { above20d: ratio, above50d: ratio, averageRsi: insufficient ? null : 64.2, marketState },
    charts: { topImproving: insufficient ? [] : [row], bottomWeakening: [] }, rows: [row], topImproving: insufficient ? [] : [row], bottomWeakening: [],
    dataQuality: { asOfDate: '2026-09-04', comparisonDate: null, rankScope: scope, rowCount: 1, completeSignalCount: insufficient ? 0 : 1, coverageRatio: 1 / expectedSymbolCount, isQualified: false, expectedSymbolCount, actualSymbolCount: 1, scoreVersion: 'v1' },
    currentMarketSummary: 'Risk-off conditions — capital is rotating to safety.',
  };
}

test('admin rotation batch writes controlled indexes and guest monitor renders desktop/mobile evidence', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/login?returnTo=%2Ftools%2Fmarket-rotation');
  await page.getByTestId('locale-select').selectOption('en');
  await page.getByLabel('Email', { exact: true }).fill('rotation-admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('synthetic-rotation-admin-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/tools\/market-rotation$/);
  const csrf = (await page.context().cookies()).find(cookie => cookie.name === 'csrf-token')!.value;
  const batch = await page.request.post('/api/admin/market/rotation-batch', { headers: { 'x-csrf-token': csrf }, data: { scope: 'indexes' } });
  expect(batch.status()).toBe(200);
  expect(await batch.json()).toMatchObject({ success: true, result: { rankScope: 'indexes', symbolCount: 8, upsertedCount: 8, status: 'success', errors: [] } });

  const guestContext = await browser.newContext({ baseURL: 'http://127.0.0.1:3200', viewport: { width: 1440, height: 900 } });
  const guest = await guestContext.newPage();
  try {
    await guest.goto('/tools/market-rotation');
    await guest.getByTestId('locale-select').selectOption('en');
    await expect(guest.getByRole('heading', { level: 1, name: 'Market rotation', exact: true })).toBeVisible();
    await expect(guest.getByTestId('rotation-row')).toHaveCount(8);
    await expect(guest.getByText('SPY', { exact: true })).toBeVisible();
    await expect(guest.getByText('Snapshot date', { exact: true })).toBeVisible();
    await expect(guest.getByText('Breadth date', { exact: true })).toBeVisible();
    await expect(guest.locator('.rotation-signal-complete').first()).toBeVisible();
    await guest.screenshot({ path: 'docs/design/evidence/market-rotation/desktop.png', fullPage: true });
    await guest.setViewportSize({ width: 390, height: 844 });
    await guest.getByTestId('theme-select').selectOption('dark');
    expect(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await guest.screenshot({ path: 'docs/design/evidence/market-rotation/mobile.png', fullPage: true });
  } finally {
    await guestContext.close();
  }
});

test('public monitor handles no snapshot retry, localized states/signals, keyboard scopes and unknown values', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/market/rotation-monitor*', async route => {
    calls += 1;
    if (calls === 1) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ data: { code: 'SYS_NOT_FOUND', requestId: 'rotation-empty' } }) });
      return;
    }
    const scope = (new URL(route.request().url()).searchParams.get('scope') ?? 'sectors') as 'sectors' | 'indexes' | 'core';
    const payload = monitorFixture(scope, scope === 'core' ? { state: 'unknown', insufficient: true } : { state: 'risk_off', signal: 'breaking_down' });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });
  await page.goto('/tools/market-rotation');
  await page.getByTestId('locale-select').selectOption('en');
  await expect(page.getByRole('status')).toContainText('No rotation snapshot is available for this scope yet.');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByTestId('rotation-row')).toHaveCount(1);
  await expect(page.getByTestId('rotation-row').first().locator('.rotation-signal')).toHaveText('Breaking down');
  await expect(page.getByText('Risk off', { exact: true })).toBeVisible();
  await expect(page.locator('time[datetime="2026-09-04"]')).toHaveCount(1);
  await expect(page.locator('time[datetime="2026-09-03"]')).toHaveCount(1);
  for (const [locale, state, signal] of [['zh-TW', '風險規避', '跌破轉弱'], ['zh-CN', '风险规避', '跌破转弱'], ['en', 'Risk off', 'Breaking down']] as const) {
    await page.getByTestId('locale-select').selectOption(locale);
    await expect(page.getByText(state, { exact: true })).toBeVisible();
    await expect(page.getByTestId('rotation-row').first().locator('.rotation-signal')).toHaveText(signal);
  }
  await page.getByTestId('locale-select').selectOption('en');
  const scope = page.getByLabel('Rank scope', { exact: true });
  await scope.focus();
  await scope.press('ArrowDown');
  await expect(page).toHaveURL(/\/tools\/market-rotation\?scope=indexes$/);
  await expect.poll(() => calls).toBeGreaterThanOrEqual(3);
  await scope.press('ArrowDown');
  await expect(page).toHaveURL(/\/tools\/market-rotation\?scope=core$/);
  await expect(page.getByTestId('rotation-row').first().locator('.rotation-signal')).toHaveText('Insufficient data');
  await expect(page.getByTestId('rotation-row').first()).toContainText('—');
  await expect(page.getByText('Unknown', { exact: true })).toBeVisible();
});
