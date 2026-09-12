import { readFile } from 'node:fs/promises';
import { e2eBaseURL, expect, test, selectLocale, selectTheme } from '../support/e2e';

const baseRow = {
  symbol: 'XLK', name: 'Technology Select Sector SPDR Fund', groupType: 'sector', sectorName: 'Technology',
  lastPrice: 252.34, rsi14: 64.2, above20d: true, above50d: true, maStatus: 'bullish_stack',
  percentFromHigh: -2.1, rotationScore: 92.4, rotationScoreDelta2W: 9.1, rotationRank: 1, rankDelta2W: 2,
  rsiDelta2W: 3.2, twoWeekPerformancePct: 4.8, twoWeekTrend: [{ date: '2026-09-04', value: 100 }],
  signal: 'turning_strong', signalStatus: 'complete',
};

type MarketStateValue = 'risk_on' | 'neutral' | 'defensive' | 'risk_off' | 'unknown';

function marketStateFixture(state: MarketStateValue = 'risk_off', isStale = false) {
  return {
    universeKey: 'SP500_NDX', date: '2026-09-02', latestPriceDate: '2026-09-02',
    coveragePct: isStale ? 72 : 98, isStale, marketState: state, score: state === 'unknown' ? null : 35,
    up4: state === 'unknown' ? null : 10, down4: state === 'unknown' ? null : 20,
    up4Pct: state === 'unknown' ? null : 10, down4Pct: state === 'unknown' ? null : 20,
    ratio10d: state === 'unknown' ? null : 0.6, above40dPct: state === 'unknown' ? null : 25,
    suggestedExposure: state === 'unknown' ? '40-60%' : '20-40%',
    message: state === 'unknown' ? 'Market-state reading is unavailable until breadth coverage is sufficient.' : 'Risk-off conditions — capital is rotating to safety.',
  };
}

function marketStateHistoryFixture(state: MarketStateValue = 'risk_off') {
  return [
    { date: '2026-09-02', up4: state === 'unknown' ? null : 10, down4: state === 'unknown' ? null : 20, up4Pct: state === 'unknown' ? null : 10, down4Pct: state === 'unknown' ? null : 20, ratio10d: state === 'unknown' ? null : 0.6, above40dPct: state === 'unknown' ? null : 25, marketState: state },
    { date: '2026-09-01', up4: 16, down4: 14, up4Pct: 16, down4Pct: 14, ratio10d: 1.1, above40dPct: 48, marketState: 'neutral' as const },
  ];
}

function monitorFixture(scope: 'sectors' | 'indexes' | 'core', options: { state?: 'risk_on' | 'neutral' | 'defensive' | 'risk_off' | 'unknown'; signal?: 'turning_strong' | 'strong_but_extended' | 'losing_momentum' | 'breaking_down' | 'early_recovery' | 'neutral' | null; insufficient?: boolean } = {}) {
  const insufficient = options.insufficient ?? false;
  const row = { ...baseRow, signal: insufficient ? null : options.signal ?? 'breaking_down', signalStatus: insufficient ? 'insufficient_data' : 'complete', ...(insufficient ? { lastPrice: null, rsi14: null, rotationScore: null, rotationScoreDelta2W: null, rotationRank: null, rankDelta2W: null, rsiDelta2W: null, twoWeekPerformancePct: null, twoWeekTrend: [{ date: '2026-09-04', value: null }], above20d: null, above50d: null } : {}) };
  const marketState = options.state ?? 'risk_off';
  const ratio = insufficient ? { count: 0, total: 0, ratio: null } : { count: 1, total: 1, ratio: 1 };
  const expectedSymbolCount = scope === 'sectors' ? 11 : scope === 'indexes' ? 8 : 23;
  return {
    asOfDate: '2026-09-04', comparisonDate: null, summaryAsOfDate: '2026-09-03', marketStateAsOfDate: '2026-09-02', rankScope: scope,
    marketState, breadthCondition: insufficient ? 'unknown' : 'weak_breadth', breadthConfirmation: insufficient ? 'unknown' : 'warning',
    summary: { marketState, breadthCondition: insufficient ? 'unknown' : 'weak_breadth', breadthConfirmation: insufficient ? 'unknown' : 'warning', above20d: ratio, above50d: ratio, averageRsi: insufficient ? null : 64.2 },
    summaryCards: { above20d: ratio, above50d: ratio, averageRsi: insufficient ? null : 64.2, marketState },
    charts: { topImproving: insufficient ? [] : [row], bottomWeakening: [] }, rows: [row], topImproving: insufficient ? [] : [row], bottomWeakening: [],
    betaAllocation: marketState === 'unknown'
      ? { suggestedMode: 'unknown', suggestedBetaLevel: null, highBetaTargetPct: 0, coreIndexTargetPct: 50, cashTargetPct: 50, explanation: 'Market regime unclear. No high-confidence allocation. Default to balanced cash position.', warnings: [] }
      : { suggestedMode: 'capital_preservation', suggestedBetaLevel: 0, highBetaTargetPct: 0, coreIndexTargetPct: 40, cashTargetPct: 60, explanation: 'Market is risk-off with unclear breadth. Capital preservation mode.', warnings: [] },
    dataQuality: { asOfDate: '2026-09-04', comparisonDate: null, rankScope: scope, rowCount: 1, completeSignalCount: insufficient ? 0 : 1, coverageRatio: 1 / expectedSymbolCount, isQualified: false, expectedSymbolCount, actualSymbolCount: 1, scoreVersion: 'v1' },
    currentMarketSummary: marketState === 'unknown'
      ? 'Market state is unclear due to insufficient data. Breadth data is insufficient. Suggested posture is unknown: Market regime unclear. No high-confidence allocation. Default to balanced cash position.'
      : 'Risk-off conditions — capital is rotating to safety. Breadth is weak at 100% above 50-day SMA. Sector breadth warns against the current market state. Leaders: Technology. Average RSI at 64. Suggested posture is capital preservation: Market is risk-off, breadth deteriorating fast. Maximum capital preservation: highest cash allocation.',
  };
}

function monitorControlsFixture() {
  const payload = monitorFixture('sectors', { state: 'risk_on', signal: 'turning_strong' });
  const rows = [
    { ...baseRow, symbol: 'XLK', sectorName: 'Technology', rotationRank: 1, rankDelta2W: 2, rsiDelta2W: 3.2, twoWeekPerformancePct: 4.8, percentFromHigh: -2, signal: 'turning_strong' as const, twoWeekTrend: [{ date: '2026-08-20', value: 100 }, { date: '2026-08-21', value: 102 }, { date: '2026-08-22', value: null }, { date: '2026-08-23', value: 105 }] },
    { ...baseRow, symbol: 'XLF', sectorName: 'Financials', rotationRank: 2, rankDelta2W: -2, rsiDelta2W: -3.2, twoWeekPerformancePct: -4.8, percentFromHigh: -12, signal: 'losing_momentum' as const, twoWeekTrend: [{ date: '2026-08-20', value: 100 }, { date: '2026-08-21', value: null }, { date: '2026-08-22', value: 98 }, { date: '2026-08-23', value: 95 }] },
    { ...baseRow, symbol: 'XLE', sectorName: 'Energy, "Power" research group with a deliberately long label for wrapping／能源動能研究摘要', rotationRank: 3, rankDelta2W: 0, rsiDelta2W: 0, twoWeekPerformancePct: 0, percentFromHigh: -1, signal: 'strong_but_extended' as const, twoWeekTrend: [{ date: '2026-08-20', value: null }, { date: '2026-08-21', value: 100 }, { date: '2026-08-22', value: 101 }] },
  ];
  return {
    ...payload,
    asOfDate: '2026-08-23',
    comparisonDate: '2026-08-20',
    rows,
    topImproving: [rows[0]!],
    bottomWeakening: [rows[1]!],
    charts: { topImproving: [rows[0]!], bottomWeakening: [rows[1]!] },
    currentMarketSummary: 'Current read with a "quoted" label\nthat spans lines. 長中文市場觀察摘要需要換行。',
    dataQuality: { ...payload.dataQuality, asOfDate: '2026-08-23', comparisonDate: '2026-08-20', rowCount: rows.length, actualSymbolCount: rows.length },
  };
}

test('admin rotation batch writes controlled indexes and guest monitor renders desktop/mobile evidence', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/login?returnTo=%2Fdiaries%2Fnew');
  await selectLocale(page, 'en');
  await page.getByLabel('Email', { exact: true }).fill('rotation-admin@example.test');
  await page.getByLabel('Password', { exact: true }).fill('synthetic-rotation-admin-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/diaries\/new$/);
  await page.goto('/tools/market-rotation');
  const csrf = (await page.context().cookies()).find(cookie => cookie.name === 'csrf-token')!.value;
  const batch = await page.request.post('/api/admin/market/rotation-batch', { headers: { 'x-csrf-token': csrf }, data: { scope: 'indexes' } });
  expect(batch.status()).toBe(200);
  expect(await batch.json()).toMatchObject({ success: true, result: { rankScope: 'indexes', symbolCount: 8, upsertedCount: 8, status: 'success', errors: [] } });

  const guestContext = await browser.newContext({ baseURL: e2eBaseURL, viewport: { width: 1440, height: 900 } });
  const guest = await guestContext.newPage();
  try {
    await guest.route('**/api/market/state/snapshot', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(marketStateFixture()) });
    });
    await guest.route('**/api/market/state/history*', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(marketStateHistoryFixture()) });
    });
    await guest.goto('/tools/market-rotation');
    await selectLocale(guest, 'en');
    await expect(guest.getByRole('heading', { level: 1, name: 'Market rotation', exact: true })).toBeVisible();
    await guest.getByLabel('Rank scope', { exact: true }).selectOption('indexes');
    await expect(guest.getByTestId('rotation-row')).toHaveCount(8);
    await expect(guest.getByText('SPY', { exact: true })).toBeVisible();
    await expect(guest.getByRole('region', { name: 'Snapshot date' }).getByText('Snapshot date', { exact: true })).toBeVisible();
    await expect(guest.getByRole('region', { name: 'Snapshot date' }).getByText('Breadth date', { exact: true })).toBeVisible();
    await expect(guest.getByRole('region', { name: 'Snapshot date' }).getByText('Market state date', { exact: true })).toBeVisible();
    await expect(guest.getByTestId('market-state-history')).toBeVisible();
    await expect(guest.getByTestId('market-state-history')).toContainText('Risk off');
    await expect(guest.getByText('State coverage as of: Sep 2, 2026 · Coverage: 98%', { exact: true })).toBeVisible();
    await expect(guest.getByRole('region', { name: 'Market state history' }).getByText('Sep 2, 2026', { exact: true }).first()).toBeVisible();
    await expect(guest.getByText('Data is insufficient for a market-state reading.', { exact: true })).toBeVisible();
    await expect(guest.locator('.rotation-signal-insufficient_data').first()).toContainText('Insufficient data');
    await guest.screenshot({ path: 'docs/design/evidence/market-rotation/desktop.png', fullPage: true });
    await guest.setViewportSize({ width: 390, height: 844 });
    await selectTheme(guest, 'dark');
    expect(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await guest.screenshot({ path: 'docs/design/evidence/market-rotation/mobile.png', fullPage: true });
  } finally {
    await guestContext.close();
  }
});

test('public monitor handles no snapshot retry, localized states/signals, keyboard scopes and unknown values', async ({ page }) => {
  let calls = 0;
  let activeState: MarketStateValue = 'risk_off';
  await page.route('**/api/market/state/snapshot', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(marketStateFixture(activeState, activeState === 'unknown')) });
  });
  await page.route('**/api/market/state/history*', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(marketStateHistoryFixture(activeState)) });
  });
  await page.route('**/api/market/rotation-monitor*', async route => {
    calls += 1;
    if (calls === 1) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ data: { code: 'SYS_NOT_FOUND', requestId: 'rotation-empty' } }) });
      return;
    }
    const scope = (new URL(route.request().url()).searchParams.get('scope') ?? 'sectors') as 'sectors' | 'indexes' | 'core';
    activeState = scope === 'core' ? 'unknown' : 'risk_off';
    const payload = monitorFixture(scope, scope === 'core' ? { state: 'unknown', insufficient: true } : { state: 'risk_off', signal: 'breaking_down' });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });
  await page.goto('/tools/market-rotation');
  await selectLocale(page, 'en');
  await expect(page.getByRole('status')).toContainText('No latest market snapshot is available for this scope yet.');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByTestId('rotation-row')).toHaveCount(1);
  const currentRead = page.getByRole('region', { name: 'Current read', exact: true });
  await expect(currentRead).toContainText('Sector breadth: Weak breadth · Breadth confirmation: Warning');
  await expect(currentRead).toContainText('Risk-off conditions — capital is rotating to safety. Breadth is weak at 100% above 50-day SMA. Sector breadth warns against the current market state. Leaders: Technology. Average RSI at 64. Suggested posture is capital preservation: Market is risk-off, breadth deteriorating fast. Maximum capital preservation: highest cash allocation.');
  await currentRead.screenshot({ path: 'docs/design/evidence/market-rotation/current-read-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await currentRead.screenshot({ path: 'docs/design/evidence/market-rotation/current-read-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByTestId('rotation-row').first().locator('.rotation-signal')).toHaveText('Breaking down');
  await expect(page.getByRole('definition').filter({ hasText: 'Risk off' })).toBeVisible();
  await expect(page.locator('time[datetime="2026-09-04"]').first()).toBeVisible();
  await expect(page.locator('time[datetime="2026-09-03"]').first()).toBeVisible();
  const historyWindow = page.getByRole('combobox', { name: 'History window', exact: true });
  await historyWindow.focus();
  await expect(historyWindow).toBeFocused();
  await historyWindow.selectOption('90');
  await expect(historyWindow).toHaveValue('90');
  await expect(page.getByTestId('market-state-history')).toBeVisible();
  for (const [locale, state, signal] of [['zh-TW', '風險規避', '跌破轉弱'], ['zh-CN', '风险规避', '跌破转弱'], ['en', 'Risk off', 'Breaking down']] as const) {
    await selectLocale(page, locale);
    await expect(page.getByRole('definition').filter({ hasText: state })).toBeVisible();
    await expect(page.getByTestId('rotation-row').first().locator('.rotation-signal')).toHaveText(signal);
    const localizedRead = page.getByRole('region', { name: locale === 'en' ? 'Current read' : locale === 'zh-TW' ? '目前讀法' : '目前读法', exact: true });
    await expect(localizedRead).toContainText(locale === 'zh-TW' ? '板塊廣度: 廣度偏弱' : locale === 'zh-CN' ? '板块广度: 广度偏弱' : 'Sector breadth: Weak breadth');
    await expect(localizedRead).toContainText(locale === 'zh-TW' ? '市場處於風險規避狀態' : locale === 'zh-CN' ? '市场处于风险规避状态' : 'Risk-off conditions');
    await expect(localizedRead).toContainText(locale === 'zh-TW' ? '資本保全' : locale === 'zh-CN' ? '资本保全' : 'capital preservation');
  }
  await selectLocale(page, 'en');
  const scope = page.getByLabel('Rank scope', { exact: true });
  await scope.focus();
  await page.keyboard.press('i');
  await page.keyboard.press('Tab');
  await expect(scope).toHaveValue('indexes');
  await expect(page).toHaveURL(/\/tools\/market-rotation\?scope=indexes$/);
  await expect.poll(() => calls).toBeGreaterThanOrEqual(3);
  await scope.focus();
  await page.keyboard.press('c');
  await page.keyboard.press('Tab');
  await expect(scope).toHaveValue('core');
  await expect(page).toHaveURL(/\/tools\/market-rotation\?scope=core$/);
  await expect(page.getByTestId('rotation-row').first().locator('.rotation-signal')).toHaveText('Insufficient data');
  await expect(page.getByTestId('rotation-row').first()).toContainText('—');
  const unknownRead = page.getByRole('region', { name: 'Current read', exact: true });
  await expect(unknownRead).toContainText('Sector breadth: Unknown · Breadth confirmation: Unknown');
  await expect(unknownRead).toContainText('Market state is unclear due to insufficient data. Breadth data is insufficient. Suggested posture is unknown: Market regime unclear. No high-confidence allocation. Default to balanced cash position.');
  await expect(page.getByRole('definition').filter({ hasText: 'Unknown' })).toBeVisible();
});

test('market state snapshot errors stay separate from pending and empty history', async ({ page }) => {
  let releaseHistory = () => {};
  const historyReady = new Promise<void>(resolve => { releaseHistory = resolve; });
  await page.route('**/api/market/rotation-monitor*', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(monitorFixture('sectors', { state: 'risk_off', signal: 'breaking_down' })) });
  });
  await page.route('**/api/market/state/snapshot', async route => {
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ data: { code: 'SYS_UNAVAILABLE', requestId: 'state-error' } }) });
  });
  await page.route('**/api/market/state/history*', async route => {
    await historyReady;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });
  await page.goto('/tools/market-rotation');
  await selectLocale(page, 'en');
  await expect(page.getByTestId('rotation-row')).toHaveCount(1);
  const historySection = page.getByRole('region', { name: 'Market state history' });
  await expect(historySection.getByText('Loading…', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(historySection.getByText('No market-state history is available yet.', { exact: true })).toHaveCount(0);
  releaseHistory();
  await expect(historySection.getByText('No market-state history is available yet.', { exact: true })).toBeVisible();
  await expect(page.getByTestId('rotation-row')).toHaveCount(1);
});

test('filters, sorts and exports the current rows only', async ({ page, context }) => {
  const payload = monitorControlsFixture();
  let monitorCalls = 0;
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: e2eBaseURL });
  await page.route('**/api/market/rotation-monitor*', async route => {
    monitorCalls += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });
  await page.route('**/api/market/state/snapshot', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(marketStateFixture('risk_on')) });
  });
  await page.route('**/api/market/state/history*', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(marketStateHistoryFixture('risk_on')) });
  });

  await page.goto('/tools/market-rotation');
  await selectLocale(page, 'en');
  await expect(page.getByTestId('rotation-row')).toHaveCount(3);
  const rotationRows = page.getByTestId('rotation-row');
  await expect(rotationRows.nth(0).locator('td').nth(3)).toHaveClass(/market-up/);
  await expect(rotationRows.nth(1).locator('td').nth(3)).toHaveClass(/market-down/);
  await expect(rotationRows.nth(2).locator('td').nth(3)).toHaveClass(/market-flat/);
  await expect(rotationRows.nth(0).locator('td').nth(5)).toHaveClass(/market-up/);
  await expect(rotationRows.nth(1).locator('td').nth(5)).toHaveClass(/market-down/);
  await expect(rotationRows.nth(2).locator('td').nth(5)).toHaveClass(/market-flat/);
  await expect(rotationRows.nth(0).locator('td').nth(6)).toHaveText('+4.80');
  await expect(rotationRows.nth(1).locator('td').nth(6)).toHaveText('-4.80');
  await expect(rotationRows.nth(2).locator('td').nth(6)).toHaveText('0.00');
  const lightColors = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const resolve = (token: string) => { const probe = document.createElement('span'); probe.style.color = root.getPropertyValue(token); document.body.append(probe); const color = getComputedStyle(probe).color; probe.remove(); return color; };
    return { up: resolve('--market-up'), down: resolve('--market-down'), flat: resolve('--market-flat') };
  });
  await expect(rotationRows.nth(0).locator('td').nth(5)).toHaveCSS('color', lightColors.up);
  await expect(rotationRows.nth(1).locator('td').nth(5)).toHaveCSS('color', lightColors.down);
  await expect(rotationRows.nth(2).locator('td').nth(5)).toHaveCSS('color', lightColors.flat);
  await selectTheme(page, 'dark');
  const darkColors = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const resolve = (token: string) => { const probe = document.createElement('span'); probe.style.color = root.getPropertyValue(token); document.body.append(probe); const color = getComputedStyle(probe).color; probe.remove(); return color; };
    return { up: resolve('--market-up'), down: resolve('--market-down'), flat: resolve('--market-flat') };
  });
  await expect(rotationRows.nth(0).locator('td').nth(5)).toHaveCSS('color', darkColors.up);
  await expect(rotationRows.nth(1).locator('td').nth(5)).toHaveCSS('color', darkColors.down);
  await expect(rotationRows.nth(2).locator('td').nth(5)).toHaveCSS('color', darkColors.flat);
  await selectLocale(page, 'zh-TW');
  await expect(rotationRows.nth(0).locator('td').nth(5)).toHaveClass(/market-up/);
  await expect(rotationRows.nth(1).locator('td').nth(5)).toHaveClass(/market-down/);
  await expect(rotationRows.nth(2).locator('td').nth(5)).toHaveClass(/market-flat/);
  await selectLocale(page, 'en');
  const firstTrend = page.getByTestId('rotation-row').first().locator('svg');
  await expect(firstTrend).toBeVisible();
  await expect(firstTrend.locator('polyline')).toHaveCount(1);
  expect(await firstTrend.locator('polyline').getAttribute('points')).not.toContain('96.0');
  const filter = page.getByLabel('Signal filter', { exact: true });
  await filter.selectOption('rank_down');
  await expect(page.getByTestId('rotation-row')).toHaveCount(1);
  await expect(page.getByTestId('rotation-row')).toContainText('XLF');
  await page.getByRole('button', { name: 'Clear filter', exact: true }).click();
  await expect(page.getByTestId('rotation-row')).toHaveCount(3);

  const rankHeader = page.getByRole('button', { name: 'Rank', exact: true });
  await expect(rankHeader.locator('xpath=..')).toHaveAttribute('aria-sort', 'ascending');
  await rankHeader.click();
  await expect(rankHeader.locator('xpath=..')).toHaveAttribute('aria-sort', 'descending');
  await expect(page.getByTestId('rotation-row').first()).toContainText('XLE');
  await filter.selectOption('near_high');
  await expect(page.getByTestId('rotation-row')).toHaveCount(2);
  await expect(page.getByTestId('rotation-row').nth(0)).toContainText('XLE');
  await expect(page.getByTestId('rotation-row').nth(1)).toContainText('XLK');

  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV', exact: true }).click();
  const csvPath = await (await csvDownload).path();
  expect(csvPath).toBeTruthy();
  const csv = await readFile(csvPath!, 'utf8');
  expect(csv).toContain('Current read');
  expect(csv).toContain('XLK');
  expect(csv).toContain('""quoted""');
  expect(csv).toContain('Energy, ""Power"" research group');
  expect(csv).toContain('XLE');
  expect(csv).not.toContain('XLF');
  expect(csv.split('\n').filter(line => line.trim()).at(-1)).toContain('XLK');

  await page.getByRole('button', { name: 'Copy table', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Table copied.');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('XLK\tTechnology');
  expect(copied).toContain('XLE\tEnergy');
  expect(copied).not.toContain('XLF');
  expect(copied.split('\n')[0]?.split('\t')).toHaveLength(5);

  const pngDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG', exact: true }).click();
  const png = await pngDownload;
  expect(png.suggestedFilename()).toMatch(/\.png$/);
  await png.saveAs('docs/design/evidence/market-rotation/export.png');
  await selectLocale(page, 'zh-TW');
  const localizedPngDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '下載 PNG', exact: true }).click();
  const localizedPng = await localizedPngDownload;
  expect(localizedPng.suggestedFilename()).toMatch(/\.png$/);
  await localizedPng.saveAs('docs/design/evidence/market-rotation/export-zh-TW.png');
  expect(monitorCalls).toBe(1);
});
