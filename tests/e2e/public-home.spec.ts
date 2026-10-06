import { expect, test, selectLocale } from '../support/e2e';
import { TOOLS } from '../../apps/web/app/tool-shell';

// The guest landing page. These assertions exist because the page previously
// drifted the other way: the tools were the filled action and the first and
// largest section, which demoted the diary the product is actually about, and
// the hero preview showed a single note rather than the chronology the public
// content brief contracted for. See docs/design/CHANGELOG.md, 2026-10-06.

const headline = /Keep investment decisions traceable|讓投資決策保持可追溯|让投资决策保持可追溯/;

test('the landing page ranks the diary above the tools', async ({ page }) => {
  await page.goto('/');
  await selectLocale(page, 'en');

  // The filled action starts a diary; the tools are secondary and say so.
  const actions = page.locator('.home-hero .actions > a');
  await expect(actions).toHaveCount(2);
  await expect(actions.nth(0)).toHaveAttribute('href', '/register');
  await expect(actions.nth(0)).not.toHaveClass(/secondary/);
  await expect(actions.nth(1)).toHaveAttribute('href', '/tools');
  await expect(actions.nth(1)).toHaveClass(/secondary/);

  // Demoting the tools button must not hide that the tools are open to guests.
  await expect(page.locator('.home-hero-note')).toContainText('No account needed');

  // The ordered sequence explaining the diary precedes the tool list.
  const sections = page.locator('.public-section');
  await expect(sections).toHaveCount(2);
  await expect(sections.nth(0).locator('h2')).toHaveAttribute('id', 'public-steps-title');
  await expect(sections.nth(1).locator('h2')).toHaveAttribute('id', 'home-tools-title');

  // Three ordered steps, and every registered tool reachable as a ruled row.
  await expect(page.locator('.public-steps > li')).toHaveCount(3);
  await expect(page.locator('.home-tools .tool-card')).toHaveCount(TOOLS.length);
  for (const tool of TOOLS) await expect(page.locator(`.home-tools a[href="${tool.href}"]`)).toHaveCount(1);

  // The eyebrow pill above the headline was removed and must not return.
  await expect(page.locator('.public-eyebrow')).toHaveCount(0);
});

test('the hero preview shows one decision posted three times in order', async ({ page }) => {
  await page.goto('/');
  await selectLocale(page, 'en');

  const postings = page.locator('.home-trace > li');
  await expect(postings).toHaveCount(3);

  // Chronological order is the claim the page makes, so assert the dates
  // ascend rather than just that three postings exist.
  const dates = await postings.locator('time').evaluateAll(nodes => nodes.map(n => n.getAttribute('datetime')));
  expect(dates).toEqual([...dates].sort());
  expect(new Set(dates).size).toBe(3);

  // Original reasoning first, review last — the product's reading order.
  await expect(postings.nth(0).locator('.home-trace-label')).toHaveText('Original reasoning');
  await expect(postings.nth(1).locator('.home-trace-label')).toHaveText('Later evidence');
  await expect(postings.nth(2).locator('.home-trace-label')).toHaveText('Review');

  // The quote closes the record: the price rose while the thesis failed.
  const rows = page.locator('.home-preview-ledger .ledger-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1).locator('.market-up')).toContainText('+10.00');
});

test('synthetic hero content is labelled and never read as a real account', async ({ page }) => {
  await page.goto('/');
  await selectLocale(page, 'en');

  // Assistive tech gets the illustration described, not fabricated figures.
  const illustration = page.locator('.home-preview-window');
  await expect(illustration).toHaveAttribute('role', 'img');
  const label = await illustration.getAttribute('aria-label');
  expect(label).toMatch(/Not a real account or market/i);
  expect(label).toMatch(/illustration/i);

  // The visible notice says the same thing in every locale.
  const notice = page.locator('.home-preview-note');
  for (const [locale, text] of [['en', 'not a real account or market'], ['zh-TW', '不代表真實帳戶或市場'], ['zh-CN', '不代表真实账户或市场']] as const) {
    await selectLocale(page, locale);
    await expect(notice).toContainText(text);
  }
});

test('the landing page keeps the structural hierarchy rule', async ({ page }) => {
  await page.goto('/');
  // Nothing on this page floats: the preview card is bounded by a rule, and a
  // shadow here would mean the one sanctioned card had become a tile.
  const shadow = await page.locator('.home-preview-window').evaluate(node => getComputedStyle(node).boxShadow);
  expect(shadow).toBe('none');
});

test('the landing page reads in three locales', async ({ page }) => {
  await page.goto('/');
  for (const [locale, title] of [['en', 'Keep investment decisions traceable.'], ['zh-TW', '讓投資決策保持可追溯。'], ['zh-CN', '让投资决策保持可追溯。']] as const) {
    await selectLocale(page, locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('.public-home h1')).toHaveText(title);
    // The steps and the postings are translated with it, not left in English.
    await expect(page.locator('.public-steps > li h3').first()).not.toBeEmpty();
    await expect(page.locator('.home-trace .home-trace-label').first()).not.toBeEmpty();
  }
});

test('the landing page composes on a phone without overflowing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('main')).toBeVisible();

  // The accepted brief requires the heading and actions to precede the example
  // on narrow screens; the hero is a two-column grid above 850px.
  const h1 = await page.locator('.public-home h1').boundingBox();
  const preview = await page.locator('.home-preview').boundingBox();
  expect(h1 && preview && h1.y).toBeLessThan(preview!.y);

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the landing page is readable from the first response', async ({ page }) => {
    await page.goto('/');
    // Public surfaces must not require hydration to be read, so the headline,
    // the record and the synthetic notice all ship in the SSR HTML.
    await expect(page.locator('.public-home h1')).toHaveText(headline);
    await expect(page.locator('.home-trace > li')).toHaveCount(3);
    await expect(page.locator('.public-steps > li')).toHaveCount(3);
    await expect(page.locator('.home-preview-note')).not.toBeEmpty();
    await expect(page.locator('.home-hero .actions a[href="/register"]')).toHaveCount(1);
  });
});
