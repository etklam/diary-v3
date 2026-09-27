import { randomUUID } from 'node:crypto';
import { test, expect, selectLocale } from '../support/e2e';

test('continuous review saves before navigating, skips locally and reschedules without replacing content', async ({ page, context }) => {
  const email = `review-flow-${randomUUID()}@example.test`, password = 'synthetic-review-password';
  await page.request.post('/api/auth/register', { data: { email, password } });
  await page.goto('/login'); await selectLocale(page, 'en');
  await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL('/timeline'); await selectLocale(page, 'en');
  const headers = { 'x-csrf-token': (await context.cookies()).find(cookie => cookie.name === 'csrf-token')!.value };
  const entries: { id: string }[] = [];
  for (const day of ['01','02']) {
    const response = await page.request.post('/api/diaries', { headers, data: { title: `Review ${day}`, content: `Original ${day}`, date: `2026-09-${day}`, reviewDueAt: '2026-01-01T00:00:00Z' } });
    expect(response.status()).toBe(201); entries.push(await response.json());
  }
  const thesis = await page.request.put('/api/stocks/AAPL/thesis', { headers, data: { status: 'ACTIVE', summary: 'Synthetic thesis', whyIOwnIt: 'Synthetic reason', reviewDueAt: '2026-01-01T00:00:00Z' } });
  expect(thesis.ok()).toBe(true);
  await page.goto('/reviews'); await page.getByRole('button', { name: 'Start reviewing', exact: true }).click();
  await expect(page).toHaveURL(/reviewSession=/);
  await expect(page.getByRole('button', { name: 'Save and review next', exact: true })).toBeVisible();
  await page.getByRole('radio').first().check();
  await page.locator('textarea[name="reviewSummary"]').fill('Confirmed reflection');
  const firstUrl = page.url();
  await page.route('**/api/diaries/*/review-workflow', async route => {
    if (route.request().method() === 'PATCH') await route.fulfill({ status: 409, json: { data: { code: 'DIARY_REVISION_CONFLICT' } } });
    else await route.continue();
  });
  await page.getByRole('button', { name: 'Save and review next', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible(); expect(page.url()).toBe(firstUrl);
  await page.unroute('**/api/diaries/*/review-workflow');
  await page.route('**/api/reviews?*', route => route.fulfill({status:500,json:{data:{code:'SYS_INTERNAL_ERROR'}}}));
  await page.getByRole('button', { name: 'Save and review next', exact: true }).click();
  await expect(page.getByRole('button',{name:'Try opening the next review again',exact:true})).toBeVisible();
  expect(page.url()).toBe(firstUrl);
  await page.unroute('**/api/reviews?*');
  await page.getByRole('button',{name:'Try opening the next review again',exact:true}).click();
  await expect(page).not.toHaveURL(firstUrl);
  await expect(page.getByText('Completed this session: 1', { exact: false })).toBeVisible();
  await page.getByText('Reschedule here', { exact: true }).click();
  await page.getByRole('button', { name: 'Tomorrow at 09:00', exact: true }).click();
  await page.getByRole('button', { name: 'Save schedule', exact: true }).click();
  await page.getByRole('button', { name: 'Skip for now', exact: true }).click();
  await expect(page).toHaveURL(/stocks\/AAPL\/thesis/);
  await page.getByRole('button', { name: 'Skip for now', exact: true }).click();
  await expect(page).toHaveURL(/\/reviews\?/);
  await expect(page.getByText('No unhandled items remain in this review session.', { exact: true })).toBeVisible();
  const thesisAfter = await (await page.request.get('/api/stocks/AAPL/thesis')).json();
  expect(thesisAfter.reviews).toEqual([]);
  const second = await (await page.request.get(`/api/diaries/${entries[1]!.id}/review`)).json();
  expect(second.content).toBe('Original 02'); expect(second.reviewStatus).toBe('pending');
});

test('switching review sessions cancels an in-flight advance and leaves the new session usable', async ({ page, context }) => {
  const email = `review-session-reset-${randomUUID()}@example.test`, password = 'synthetic-review-password';
  await page.request.post('/api/auth/register', { data: { email, password } });
  await page.goto('/login'); await selectLocale(page, 'en');
  await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page).toHaveURL('/timeline'); await selectLocale(page, 'en');
  const headers = { 'x-csrf-token': (await context.cookies()).find(cookie => cookie.name === 'csrf-token')!.value };
  for (const day of ['11', '12']) {
    const response = await page.request.post('/api/diaries', { headers, data: { title: `Session reset ${day}`, content: `Original ${day}`, date: `2026-09-${day}`, reviewDueAt: '2026-01-01T00:00:00Z' } });
    expect(response.status()).toBe(201);
  }

  await page.goto('/reviews'); await page.getByRole('button', { name: 'Start reviewing', exact: true }).click();
  await expect(page).toHaveURL(/reviewSession=/);
  const replacementSessionId = randomUUID();
  await page.evaluate(id => {
    const sourceKey = Object.keys(sessionStorage).find(key => key.startsWith('review-session:'));
    if (!sourceKey) throw new Error('Review session was not persisted');
    const source = JSON.parse(sessionStorage.getItem(sourceKey) ?? 'null') as { owner: string };
    sessionStorage.setItem(`review-session:${source.owner}:${id}`, JSON.stringify({ ...source, completed: [], skipped: [] }));
  }, replacementSessionId);

  let releaseAdvance!: () => void;
  let markIntercepted!: () => void;
  const intercepted = new Promise<void>(resolve => { markIntercepted = resolve; });
  await page.route('**/api/reviews?*', async route => {
    markIntercepted();
    await new Promise<void>(resolve => { releaseAdvance = resolve; });
    await route.fulfill({ status: 500, json: { data: { code: 'SYS_INTERNAL_ERROR' } } }).catch(() => undefined);
  });
  await page.getByRole('button', { name: 'Skip for now', exact: true }).click();
  await intercepted;

  await page.evaluate(id => {
    const url = new URL(window.location.href);
    url.searchParams.set('reviewSession', id);
    history.pushState({}, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, replacementSessionId);
  await expect(page).toHaveURL(new RegExp(`reviewSession=${replacementSessionId}`));
  await expect(page.getByText('Skipped this session: 0', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skip for now', exact: true })).toBeEnabled();

  releaseAdvance();
  await page.unroute('**/api/reviews?*');
  await page.getByRole('button', { name: 'Skip for now', exact: true }).click();
  await expect(page).toHaveURL(/reviewSession=/);
  await expect(page.getByText('Skipped this session: 1', { exact: false })).toBeVisible();
});
