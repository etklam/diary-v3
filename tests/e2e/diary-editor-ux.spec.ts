import { randomUUID } from 'node:crypto';
import type { Dialog, Page } from '@playwright/test';
import { expect, test, selectLocale } from '../support/e2e';

const password = 'synthetic-editor-ux-password';

async function signInAndOpen(page: Page, email: string) {
  expect((await page.request.post('/api/auth/register', { data: { email, password } })).status()).toBe(200);
  await page.goto('/login');
  await selectLocale(page, 'en');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/diaries\/new$/);
  await selectLocale(page, 'en');
}

test('save status reflects clean, dirty, saving and failed states without fake feedback', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInAndOpen(page, `ux-status-${randomUUID()}@example.test`);
  await expect(page.getByTestId('save-status')).toHaveText('');
  await page.getByLabel('Diary date', { exact: true }).fill('2026-09-06');
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Status machine diary');
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill('First version of the reasoning.');
  await expect(page.getByTestId('save-status')).toHaveText('Unsaved changes');

  // Double submit must not create two diaries: both clicks land before the
  // disabled re-render, the in-flight guard absorbs the second one.
  let creates = 0;
  await page.route('**/api/diaries', async route => {
    if (route.request().method() === 'POST') creates += 1;
    await route.continue();
  });
  await page.getByRole('button', { name: 'Save diary', exact: true }).dblclick();
  await expect(page).toHaveURL(/\/diaries\/\d+$/);
  const diaryId = page.url().split('/').at(-1);
  expect(creates).toBe(1);
  await expect(page.getByRole('heading', { name: 'Status machine diary', exact: true })).toBeVisible();

  // Failed save keeps every entry, marks the status, and retry succeeds.
  await page.getByRole('link', { name: 'Edit diary', exact: true }).click();
  await expect(page.getByTestId('save-status')).toHaveText('');
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Status machine diary, revised');
  await expect(page.getByTestId('save-status')).toHaveText('Unsaved changes');
  await page.route('**/api/diaries/*', async route => {
    if (route.request().method() === 'PUT') await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ data: { code: 'SYS_INTERNAL_ERROR', requestId: 'ux-status-failure' } }) });
    else await route.continue();
  });
  await page.getByRole('button', { name: 'Save diary', exact: true }).click();
  await expect(page.getByTestId('save-status')).toHaveText('Save failed');
  await expect(page.getByTestId('request-id')).toHaveText('ux-status-failure');
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Status machine diary, revised');
  await page.unroute('**/api/diaries/*');
  await page.getByRole('button', { name: 'Save diary', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${diaryId}$`));
});

test('dirty editors warn before internal navigation; clean editors do not', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInAndOpen(page, `ux-guard-${randomUUID()}@example.test`);
  await page.getByLabel('Diary date', { exact: true }).fill('2026-09-06');
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Navigation guard diary');
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill('Guarded content.');
  await page.getByRole('button', { name: 'Save diary', exact: true }).click();
  await expect(page).toHaveURL(/\/diaries\/\d+$/);
  const editPath = `${page.url()}/edit`;

  // One dialog handler with an explicit answer per dialog keeps the native
  // confirm/ blocker deterministic.
  const dialogs: string[] = [];
  let answer: 'accept' | 'dismiss' | null = null;
  const handle = (dialog: Dialog) => {
    dialogs.push(dialog.message());
    if (answer === 'accept') void dialog.accept(); else void dialog.dismiss();
    answer = null;
  };
  page.on('dialog', handle);

  // Clean editor navigates without any dialog.
  await page.goto(editPath);
  await expect(page.getByTestId('save-status')).toHaveText('');
  await page.getByRole('link', { name: 'Timeline', exact: true }).click();
  await expect(page).toHaveURL(/\/timeline$/);
  expect(dialogs).toEqual([]);

  // Dirty editor: staying keeps the entries, leaving discards them.
  await page.goto(editPath);
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Navigation guard diary, changed');
  await expect(page.getByTestId('save-status')).toHaveText('Unsaved changes');
  answer = 'dismiss';
  await page.getByRole('link', { name: 'Timeline', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${editPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Navigation guard diary, changed');
  // The blocker's confirm is synchronous with the navigation attempt; the
  // dialog event itself lands on the driver asynchronously, so poll for it.
  await expect.poll(() => dialogs.length).toBe(1);
  answer = 'accept';
  await page.getByRole('link', { name: 'Timeline', exact: true }).click();
  await expect(page).toHaveURL(/\/timeline$/);

  // A saved editor stops warning on future navigation.
  await page.goto(editPath);
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Navigation guard diary, saved');
  await page.getByRole('button', { name: 'Save diary', exact: true }).click();
  await expect(page).toHaveURL(/\/diaries\/\d+$/);
  expect(dialogs.length).toBe(2);
  page.off('dialog', handle);
});

test('preview round trip preserves content, dirty state, caret and scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInAndOpen(page, `ux-preview-${randomUUID()}@example.test`);
  await page.getByLabel('Diary date', { exact: true }).fill('2026-09-06');
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Preview round trip');
  const content = Array.from({ length: 40 }, (_, index) => `Paragraph line ${index + 1}.`).join('\n\n');
  const editor = page.getByRole('textbox', { name: 'Content', exact: true });
  await editor.fill(content);
  await expect(page.getByTestId('save-status')).toHaveText('Unsaved changes');
  await editor.evaluate((element: HTMLTextAreaElement) => { element.selectionStart = 5; element.selectionEnd = 9; element.scrollTop = 120; });
  await page.getByRole('button', { name: 'Preview Markdown', exact: true }).click();
  const previewSection = page.locator('section[aria-label="Preview Markdown"]');
  await expect(previewSection).toBeVisible();
  await expect(previewSection.locator('p').first()).toContainText('Paragraph line 1');
  await page.getByRole('button', { name: 'Edit text', exact: true }).click();
  await expect(editor).toHaveValue(content);
  expect(await editor.evaluate((element: HTMLTextAreaElement) => ({ start: element.selectionStart, top: element.scrollTop }))).toEqual({ start: 5, top: 120 });
  await expect(editor).toBeFocused();
  await expect(page.getByTestId('save-status')).toHaveText('Unsaved changes');
});

test('device-local recovery restores unsaved writing after a reload and clears after a save', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInAndOpen(page, `ux-recovery-${randomUUID()}@example.test`);
  await page.getByLabel('Diary date', { exact: true }).fill('2026-09-06');
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Recovered title');
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill('Recovered reasoning that never reached the server.');
  const draftKey = () => page.evaluate(() => Object.keys(localStorage).find(key => key.startsWith('diary-editor-draft:')) ?? null);
  await expect.poll(draftKey, { timeout: 5_000 }).not.toBeNull();

  // Reload: the editor offers the device draft, restoring keeps it dirty.
  await page.reload();
  await page.getByRole('button', { name: 'Restore unsaved draft', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Recovered title');
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue('Recovered reasoning that never reached the server.');
  await expect(page.getByTestId('save-status')).toHaveText('Unsaved changes');

  // Discard removes the draft for good: reload shows the banner again because
  // the restored writing was re-backed-up while it was dirty.
  await page.reload();
  await page.getByRole('button', { name: 'Discard draft', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('');
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue('');
  await expect.poll(draftKey).toBeNull();

  // A confirmed save clears the recovery copy.
  await page.getByLabel('Diary date', { exact: true }).fill('2026-09-06');
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Recovered title, saved');
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill('Now durable.');
  await page.getByRole('button', { name: 'Save diary', exact: true }).click();
  await expect(page).toHaveURL(/\/diaries\/\d+$/);
  await expect.poll(draftKey).toBeNull();
});

test('discarding a recovery re-arms backup for new content', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const email = `ux-discard-rearm-${randomUUID()}@example.test`;
  await signInAndOpen(page, email);
  const csrf = (await page.context().cookies()).find(cookie => cookie.name === 'csrf-token')!.value;
  expect((await page.request.post('/api/diaries', {
    headers: { 'x-csrf-token': csrf },
    data: { date: '2026-09-06', title: 'Discard re-arm diary', content: 'Saved baseline reasoning.' },
  })).status()).toBe(201);
  const draftContent = () => page.evaluate(() => {
    const raw = localStorage.getItem(Object.keys(localStorage).find(key => key.startsWith('diary-editor-draft:')) ?? '');
    const saved = raw ? JSON.parse(raw) as { value?: { form?: { content?: string } } } : null;
    return saved?.value?.form?.content ?? null;
  });

  // Draft A is written debounced while dirty.
  await page.goto('/diaries');
  await page.getByRole('link', { name: 'Discard re-arm diary', exact: true }).click();
  await page.getByRole('link', { name: 'Edit diary', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue('Saved baseline reasoning.');
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill('Unsaved draft reasoning A.');
  await expect.poll(draftContent, { timeout: 5_000 }).toBe('Unsaved draft reasoning A.');

  // Discard only drops snapshot A: the form is back on the confirmed baseline,
  // so nothing is rewritten, and typing B re-arms the debounced backup with B.
  await page.reload();
  await page.getByRole('button', { name: 'Discard draft', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue('Saved baseline reasoning.');
  await expect.poll(draftContent).toBeNull();
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill('Brand new reasoning B.');
  await expect.poll(draftContent, { timeout: 5_000 }).toBe('Brand new reasoning B.');

  // The re-armed draft survives a reload and restores B.
  await page.reload();
  await page.getByRole('button', { name: 'Restore unsaved draft', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue('Brand new reasoning B.');
  await expect(page.getByTestId('save-status')).toHaveText('Unsaved changes');
});

test('an expired session keeps local writing through re-login and returns to the editor', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const email = `ux-expiry-${randomUUID()}@example.test`;
  await signInAndOpen(page, email);
  await page.getByLabel('Diary date', { exact: true }).fill('2026-09-06');
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Session expiry diary');
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill('Long reasoning that must survive an expired session.');
  await page.getByRole('button', { name: 'Save diary', exact: true }).click();
  await expect(page).toHaveURL(/\/diaries\/\d+$/);
  const editPath = `${new URL(page.url()).pathname}/edit`;
  await page.goto(editPath);
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Session expiry diary, edited after expiry');
  await page.route('**/api/diaries/*', async route => {
    if (route.request().method() === 'PUT') await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ data: { code: 'AUTH_TOKEN_INVALID' } }) });
    else await route.continue();
  });
  await page.getByRole('button', { name: 'Save diary', exact: true }).click();
  // The shell signs the session out and lands on the login form, keeping the
  // editor path as the return destination; the device draft survives the 401.
  await expect(page).toHaveURL(new RegExp(`/login\\?returnTo=${encodeURIComponent(editPath)}$`));
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('diary-editor-draft:')))).toBe(true);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${editPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
  await page.getByRole('button', { name: 'Restore unsaved draft', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Session expiry diary, edited after expiry');
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue('Long reasoning that must survive an expired session.');
  await expect(page.getByTestId('save-status')).toHaveText('Unsaved changes');
  await page.unroute('**/api/diaries/*');
  await page.getByRole('button', { name: 'Save diary', exact: true }).click();
  await expect(page).toHaveURL(/\/diaries\/\d+$/);
  await expect(page.getByRole('heading', { name: 'Session expiry diary, edited after expiry', exact: true })).toBeVisible();
});

for (const width of [360, 390]) {
  test(`editor stays usable at ${width}px with the full writing surface`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await signInAndOpen(page, `ux-mobile-${width}-${randomUUID()}@example.test`);
    await page.getByLabel('Diary date', { exact: true }).fill('2026-09-06');
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill(`Mobile ${width} diary`);
    await page.getByRole('textbox', { name: 'Content', exact: true }).fill('Mobile writing surface.');
    await expect(page.getByTestId('save-status')).toHaveText('Unsaved changes');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const box = await page.locator('.editor-content').boundingBox();
    expect(box?.height ?? 0).toBeGreaterThan(200);
    // The save action remains reachable by normal scrolling, no fixed overlay.
    const save = page.getByRole('button', { name: 'Save diary', exact: true });
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeVisible();
    await save.click();
    await expect(page).toHaveURL(/\/diaries\/\d+$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('dirty clears when edits return to the confirmed server baseline', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const email = `ux-baseline-${randomUUID()}@example.test`;
  await signInAndOpen(page, email);
  await page.getByLabel('Diary date', { exact: true }).fill('2026-09-06');
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Baseline diary');
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill('Original reasoning.');
  await page.getByRole('button', { name: 'Add purchase', exact: true }).click();
  const row = page.locator('.buy-row').first();
  await row.getByRole('textbox', { name: 'Symbol', exact: true }).fill('AAPL');
  await row.getByRole('textbox', { name: 'Quantity', exact: true }).fill('2.5');
  await row.getByRole('textbox', { name: 'Price per share', exact: true }).fill('180.25');
  await row.getByLabel('Trade date and time (device time)', { exact: true }).fill('2026-09-06T10:30');
  await page.getByRole('button', { name: 'Add reminder', exact: true }).click();
  await page.getByLabel('Reminder message', { exact: true }).fill('Check the fill price');
  await page.getByLabel('Reminder time', { exact: true }).fill('2026-09-08T09:00');
  await page.getByRole('button', { name: 'Save diary', exact: true }).click();
  await expect(page).toHaveURL(/\/diaries\/\d+$/);
  await page.getByRole('link', { name: 'Edit diary', exact: true }).click();
  await expect(page.getByTestId('save-status')).toHaveText('');

  // Title: change then revert to the server value.
  const title = page.getByRole('textbox', { name: 'Title', exact: true });
  await title.fill('Baseline diary, edited');
  await expect(page.getByTestId('save-status')).toHaveText('Unsaved changes');
  await title.fill('Baseline diary');
  await expect(page.getByTestId('save-status')).toHaveText('');

  // Transaction: change then revert.
  const quantity = page.locator('.buy-row').first().getByRole('textbox', { name: 'Quantity', exact: true });
  const serverQuantity = await quantity.inputValue();
  await quantity.fill('9.5');
  await expect(page.getByTestId('save-status')).toHaveText('Unsaved changes');
  await quantity.fill(serverQuantity);
  await expect(page.getByTestId('save-status')).toHaveText('');

  // Review schedule: change then revert.
  const review = page.getByLabel('Review due at', { exact: true });
  const serverReview = await review.inputValue();
  await review.fill('2026-09-15T10:30');
  await expect(page.getByTestId('save-status')).toHaveText('Unsaved changes');
  await review.fill(serverReview);
  await expect(page.getByTestId('save-status')).toHaveText('');

  // Reminder: change then revert.
  const reminder = page.getByLabel('Reminder message', { exact: true });
  await reminder.fill('Check the fill price again');
  await expect(page.getByTestId('save-status')).toHaveText('Unsaved changes');
  await reminder.fill('Check the fill price');
  await expect(page.getByTestId('save-status')).toHaveText('');

  // Whitespace-only differences read as clean because the server trims them.
  await title.fill('  Baseline diary  ');
  await expect(page.getByTestId('save-status')).toHaveText('');
});

test('recovery restores transaction, review and reminder modifications after re-login', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const email = `ux-full-recovery-${randomUUID()}@example.test`;
  await signInAndOpen(page, email);
  const csrf = (await page.context().cookies()).find(cookie => cookie.name === 'csrf-token')!.value;
  expect((await page.request.post('/api/diaries', {
    headers: { 'x-csrf-token': csrf },
    data: {
      date: '2026-09-06', title: 'Full state recovery diary', content: 'Every editable part must survive.',
      transactions: [{ symbol: 'AAPL', type: 'BUY', quantity: '1.25', price: '180.25', tradeDate: '2026-09-06T02:30:00.000Z' }],
      reviewDueAt: '2026-09-10T01:30:00.000Z',
      alerts: [{ message: 'Check the fill price', triggerAt: '2026-09-08T01:00:00.000Z' }],
    },
  })).status()).toBe(201);
  await page.goto('/diaries');
  await page.getByRole('link', { name: 'Full state recovery diary', exact: true }).click();
  await page.getByRole('link', { name: 'Edit diary', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Full state recovery diary');
  await expect(page.getByTestId('save-status')).toHaveText('');

  await page.locator('.buy-row').first().getByRole('textbox', { name: 'Quantity', exact: true }).fill('7.75');
  const review = page.getByLabel('Review due at', { exact: true });
  await review.fill('2026-09-18T11:45');
  await page.getByLabel('Reminder message', { exact: true }).fill('Check the fill price after the split');
  await expect(page.getByTestId('save-status')).toHaveText('Unsaved changes');
  const draftKey = () => page.evaluate(() => Object.keys(localStorage).find(key => key.startsWith('diary-editor-draft:')) ?? null);
  await expect.poll(draftKey, { timeout: 5_000 }).not.toBeNull();

  await page.route('**/api/diaries/*', async route => {
    if (route.request().method() === 'PUT') await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ data: { code: 'AUTH_TOKEN_INVALID' } }) });
    else await route.continue();
  });
  await page.getByRole('button', { name: 'Save diary', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  await expect.poll(draftKey).not.toBeNull();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/diaries\/\d+\/edit$/);
  await page.getByRole('button', { name: 'Restore unsaved draft', exact: true }).click();
  await expect(page.getByTestId('save-status')).toHaveText('Unsaved changes');
  await expect(page.locator('.buy-row').first().getByRole('textbox', { name: 'Quantity', exact: true })).toHaveValue('7.75');
  await expect(page.getByLabel('Review due at', { exact: true })).toHaveValue('2026-09-18T11:45');
  await expect(page.getByLabel('Reminder message', { exact: true })).toHaveValue('Check the fill price after the split');
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Full state recovery diary');
});
