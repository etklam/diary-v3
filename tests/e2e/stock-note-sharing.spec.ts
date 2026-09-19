import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { e2eBaseURL, test, expect, selectLocale } from '../support/e2e';

test('shared Stock Notes stay visible in the list and Hub until sharing is revoked or unlinked', async ({ page: owner, browser }) => {
  const partnerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const partner = await partnerContext.newPage();
  const ownerEmail = `stock-note-owner-${randomUUID()}@example.test`;
  const partnerEmail = `stock-note-partner-${randomUUID()}@example.test`;
  const password = 'synthetic-stock-note-sharing-password';
  async function signIn(view: Page, email: string) {
    await view.goto(`${e2eBaseURL}/login?returnTo=%2Fpartners`); await selectLocale(view, 'en');
    await view.getByLabel('Email', { exact: true }).fill(email); await view.getByLabel('Password', { exact: true }).fill(password);
    await view.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(view).toHaveURL(/\/partners$/); await selectLocale(view, 'en');
  }
  async function csrf(view: Page) {
    return { 'x-csrf-token': (await view.context().cookies()).find(cookie => cookie.name === 'csrf-token')!.value };
  }
  try {
    await owner.request.post(`${e2eBaseURL}/api/auth/register`, { data: { email: ownerEmail, password } });
    await partner.request.post(`${e2eBaseURL}/api/auth/register`, { data: { email: partnerEmail, password } });
    await signIn(owner, ownerEmail); await signIn(partner, partnerEmail);
    await owner.getByLabel('Partner email', { exact: true }).fill(partnerEmail);
    await owner.getByRole('button', { name: 'Invite partner', exact: true }).click();
    await partner.getByRole('button', { name: 'Refresh partners', exact: true }).click();
    await partner.getByRole('button', { name: 'Accept invitation', exact: true }).click();
    await owner.getByRole('button', { name: 'Refresh partners', exact: true }).click();
    const links = await (await owner.request.get(`${e2eBaseURL}/api/partners`)).json() as { links: Array<{ id: string; partner: { id: string } }> };
    const link = links.links[0]!;
    await partner.getByRole('button', { name: 'Share my stock notes', exact: true }).click();
    const ownerHeaders = await csrf(owner), partnerHeaders = await csrf(partner);
    const ownerNote = await owner.request.post(`${e2eBaseURL}/api/stocks/AAPL/notes`, { headers: ownerHeaders, data: { title: 'Owner view', content: 'Owner research' } });
    expect(ownerNote.status()).toBe(200);
    const partnerNote = await partner.request.post(`${e2eBaseURL}/api/stocks/AAPL/notes`, { headers: partnerHeaders, data: { title: 'Partner view', content: 'Partner research' } });
    expect(partnerNote.status()).toBe(200);

    const initialHubResponse = owner.waitForResponse(response => {
      const url = new URL(response.url());
      return response.request().method() === 'GET' && url.pathname === '/api/stocks/AAPL/hub';
    });
    await owner.goto(`${e2eBaseURL}/stocks/AAPL`);
    const notes = owner.getByRole('region', { name: 'Company notes', exact: true });
    await notes.getByLabel('Whose notes').selectOption(link.partner.id);
    await expect(notes.getByTestId('stock-note')).toContainText('Partner view');
    await expect(notes.getByRole('button', { name: 'Edit note', exact: true })).toHaveCount(0);
    const sharedHubResponse = await initialHubResponse;
    expect(sharedHubResponse.ok()).toBe(true);
    const sharedHub = await sharedHubResponse.json() as { notes: Array<{ title: string; source: string; sourceName: string | null }> };
    expect(sharedHub.notes).toEqual(expect.arrayContaining([expect.objectContaining({ title: 'Partner view', source: 'partner', sourceName: 'Partner' })]));

    await partner.getByRole('button', { name: 'Stop sharing my stock notes', exact: true }).click();
    await notes.getByRole('button', { name: 'Refresh notes', exact: true }).click();
    await expect(notes.getByTestId('stock-note')).toHaveCount(0);
    const revokedHubResponse = owner.waitForResponse(response => {
      const url = new URL(response.url());
      return response.request().method() === 'GET' && url.pathname === '/api/stocks/AAPL/hub';
    });
    await owner.reload();
    const revokedHubResponseValue = await revokedHubResponse;
    expect(revokedHubResponseValue.ok()).toBe(true);
    const revokedHub = await revokedHubResponseValue.json() as { notes: Array<{ title: string; source: string }> };
    expect(revokedHub.notes.some(note => note.title === 'Partner view')).toBe(false);
    expect(revokedHub.notes).toEqual(expect.arrayContaining([expect.objectContaining({ title: 'Owner view', source: 'owner' })]));

    await partner.goto(`${e2eBaseURL}/partners`);
    partner.once('dialog', dialog => dialog.accept()); await partner.getByRole('button', { name: 'Remove connection', exact: true }).click();
    const denied = await owner.request.get(`${e2eBaseURL}/api/stocks/AAPL/notes?partnerId=${link.partner.id}`);
    expect(denied.status()).toBe(403);
    const unlinkedHubResponse = owner.waitForResponse(response => {
      const url = new URL(response.url());
      return response.request().method() === 'GET' && url.pathname === '/api/stocks/AAPL/hub';
    });
    await owner.reload();
    const unlinkedHubResponseValue = await unlinkedHubResponse;
    expect(unlinkedHubResponseValue.ok()).toBe(true);
    const unlinkedHub = await unlinkedHubResponseValue.json() as { notes: Array<{ title: string; source: string }> };
    expect(unlinkedHub.notes.some(note => note.title === 'Partner view')).toBe(false);
  } finally {
    await partnerContext.close();
  }
});
