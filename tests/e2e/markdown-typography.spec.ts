import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expect,test,selectLocale,selectTheme } from '../support/e2e';
import { markdownFixture } from '../../apps/web/app/markdown-fixture';

const evidence = 'docs/design/evidence/markdown';

type WindowWithFixture = { __fixtureInjected?: boolean };

async function expectMarkdownSemantics(page: Page) {
  // GFM task list stays interactive-looking but inert; raw HTML stays out.
  await expect(page.locator('.safe-markdown li.task-list-item input[type="checkbox"]')).toHaveCount(3);
  await expect(page.locator('.safe-markdown script, .safe-markdown img[src="x"]')).toHaveCount(0);
  expect(await page.evaluate(() => (window as WindowWithFixture).__fixtureInjected)).toBeUndefined();
  await expect(page.locator('.safe-markdown blockquote')).toContainText('應先確認需求');
  await expect(page.locator('.markdown-table')).toHaveCount(2);
}

async function cleanShot(page: Page, path: string) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  await page.screenshot({ path, fullPage: true });
}

function expectNoPageOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth).then(fits => expect(fits).toBe(true));
}

test('markdown fixture renders with the shared typography across surfaces, themes and viewports', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  // Design-preview fixture surface: public, no auth, no production content.
  await page.goto('/design-preview');
  await selectLocale(page, 'en');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  await expect(page.getByRole('heading', { name: '投資論點', exact: true })).toBeVisible();
  await expect(page.locator('.safe-markdown h6')).toContainText('H6');
  await expectMarkdownSemantics(page);
  await expect(page.locator('.safe-markdown img[src="/favicon.svg"]')).toHaveCount(1);
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width > 1000 ? 1000 : 844 });
    await expect(page.getByRole('heading', { name: '投資論點', exact: true })).toBeVisible();
    await expectNoPageOverflow(page);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  // The narrow comparison table fits its scroll region; the 11-column plan
  // table scrolls inside .markdown-table instead of stretching the document.
  const [narrowTable, wideTable] = await page.locator('.markdown-table').all();
  expect(narrowTable).toBeTruthy();
  expect(await narrowTable!.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await wideTable!.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  await cleanShot(page, `${evidence}/preview-1440-light.png`);
  await selectTheme(page, 'dark');
  await expectNoPageOverflow(page);
  await cleanShot(page, `${evidence}/preview-1440-dark.png`);
  await page.setViewportSize({ width: 390, height: 844 });
  await cleanShot(page, `${evidence}/preview-390-dark.png`);

  // Real diary authoring: editor preview, then the reading page.
  const email = `markdown-${randomUUID()}@example.test`,password = 'synthetic-markdown-password';
  expect((await page.request.post('/api/auth/register',{data:{email,password}})).status()).toBe(200);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/login?returnTo=%2Fdiaries%2Fnew');await selectLocale(page, 'en');await selectTheme(page, 'light');
  await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page).toHaveURL(/\/diaries\/new$/);await selectLocale(page, 'en');
  await page.getByLabel('Diary date',{exact:true}).fill('2026-09-07');
  await page.getByRole('textbox',{name:'Title',exact:true}).fill('Markdown typography fixture');
  await page.getByRole('textbox',{name:'Content',exact:true}).fill(markdownFixture);
  await page.getByRole('button',{name:'Preview Markdown'}).click();
  await expect(page.getByRole('heading',{name:'投資論點',exact:true})).toBeVisible();
  await expectMarkdownSemantics(page);
  await expectNoPageOverflow(page);
  await cleanShot(page, `${evidence}/editor-preview-1440-light.png`);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoPageOverflow(page);
  await cleanShot(page, `${evidence}/editor-preview-390-light.png`);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button',{name:'Edit text'}).click();
  await page.getByRole('button',{name:'Save diary',exact:true}).click();
  await expect(page).toHaveURL(/\/diaries\/\d+$/);
  await expect(page.getByRole('heading',{name:'投資論點',exact:true})).toBeVisible();
  await expectMarkdownSemantics(page);
  await cleanShot(page, `${evidence}/reading-1440-light.png`);
  await selectTheme(page, 'dark');
  await cleanShot(page, `${evidence}/reading-1440-dark.png`);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoPageOverflow(page);
  await cleanShot(page, `${evidence}/reading-390-dark.png`);
  await selectTheme(page, 'light');
  await cleanShot(page, `${evidence}/reading-390-light.png`);

  // Articles reuse the same component; check the public article surface.
  expect((await page.request.post('/api/auth/login',{data:{email:'etf-admin@example.test',password:'synthetic-etf-admin-password'}})).status()).toBe(200);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/admin/blog/new');await selectLocale(page, 'en');
  const title = `Markdown fixture ${randomUUID()}`;
  await page.getByLabel('Title',{exact:true}).fill(title);
  await page.getByLabel('Content',{exact:true}).fill(markdownFixture);
  await page.getByRole('button',{name:'Save draft',exact:true}).click();
  await expect(page).toHaveURL(/\/admin\/blog\/\d+\/edit$/);
  const id = page.url().match(/admin\/blog\/(\d+)\/edit$/)?.[1];
  expect(id).toBeTruthy();
  await page.getByRole('button',{name:'Publish',exact:true}).click();
  await expect(page.getByText('Saved.',{exact:true})).toBeVisible();
  const { slug } = await (await page.request.get(`/api/blog/admin/${id}`)).json() as { slug: string };
  await page.goto(`/articles/${encodeURIComponent(slug)}`);
  await expect(page.getByRole('heading',{name:'投資論點',exact:true})).toBeVisible();
  await expectMarkdownSemantics(page);
  await expectNoPageOverflow(page);
  await cleanShot(page, `${evidence}/article-1440-light.png`);
});
