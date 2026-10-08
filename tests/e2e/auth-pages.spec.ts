import { randomUUID } from 'node:crypto';
import { expect, test, selectLocale, selectTheme } from '../support/e2e';

// Ticket 109. The authentication pages had narrow coverage of their behaviour
// and none of their composition, which is why they scored lowest of any public
// surface without anything failing. These assertions pin the decisions — a
// composed two-column surface, weighted secondary paths, a recovery link that
// is only offered when recovery exists, and the same password safeguard the
// account security page already has — not pixels.

const pages = ['/login', '/register', '/forgot-password', '/reset-password', '/register/complete'] as const;

async function capabilities(page: import('@playwright/test').Page, passwordRecoveryAvailable: boolean) {
  await page.route('**/api/auth/capabilities', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ registrationMode: 'direct', passwordRecoveryAvailable }) }));
}

test('every authentication page is a composed surface rather than a form in a void', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await capabilities(page, true);
  for (const path of pages) {
    await page.goto(path);
    await selectLocale(page, 'en');
    const composition = page.locator('.auth-page');
    await expect(composition).toHaveCount(1);
    // Both columns carry content: the form and the statement of what this is.
    await expect(composition.locator('.form-page h1')).toBeVisible();
    await expect(composition.locator('.auth-points > li')).toHaveCount(3);
    // The defect was content stranded in the top half with an empty remainder.
    const box = await composition.boundingBox();
    expect(box, path).not.toBeNull();
    expect(box!.y + box!.height, path).toBeGreaterThan(450);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path).toBe(true);
  }
});

test('the alternative journey and the recovery path read as different weights', async ({ page }) => {
  await capabilities(page, true);
  await page.goto('/login');
  await selectLocale(page, 'en');
  const alternate = page.locator('.auth-alternate');
  await expect(alternate.getByRole('link', { name: 'Create account', exact: true })).toHaveClass(/button/);
  const recovery = alternate.getByRole('link', { name: 'Forgot password?', exact: true });
  await expect(recovery).toBeVisible();
  await expect(recovery).not.toHaveClass(/button/);
});

test('recovery stays offered when email is off but a support route exists', async ({ page }) => {
  await capabilities(page, false);
  await page.goto('/login');
  await selectLocale(page, 'en');
  // The harness configures ACCOUNT_RECOVERY_SUPPORT_URL, so recovery is still
  // reachable by a human route and the link must survive. The case where
  // neither path exists cannot be produced here — the support route is server
  // configuration — and is pinned by tests/unit/auth-recovery.test.ts.
  await page.locator('.auth-alternate').getByRole('link', { name: 'Forgot password?', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Get sign-in help', exact: true })).toBeVisible();
});

test('registration confirms the password and reports a mismatch on the field', async ({ page }) => {
  await capabilities(page, true);
  await page.goto('/register');
  await selectLocale(page, 'en');
  const email = `auth-pages-${randomUUID()}@example.test`, password = 'synthetic-auth-pages-password';
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(`${password}-typo`);
  const submit = page.getByRole('button', { name: 'Create account', exact: true });
  // A disabled button never stands in for field validation, so the control
  // stays live and the error is reported where it was made.
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByRole('alert')).toContainText('The passwords do not match.');
  await expect(page.getByLabel('Confirm password', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  // Failed forms keep their content.
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await submit.click();
  await expect(page.getByRole('status')).toContainText('Your account is ready');
});

test('the return destination survives the move between sign in and registration', async ({ page }) => {
  await capabilities(page, true);
  await page.goto('/login?returnTo=%2Fdiaries%2Fquick');
  await selectLocale(page, 'en');
  await page.locator('.auth-alternate').getByRole('link', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL('/register?returnTo=%2Fdiaries%2Fquick');
  await page.locator('.auth-alternate').getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL('/login?returnTo=%2Fdiaries%2Fquick');
});

test('a fresh direct load renders the public shell with its stylesheet at every width', async ({ browser }) => {
  // The earlier defect was a direct load requesting no public stylesheet, which
  // left the header as an unstyled block. Each page gets its own context so
  // nothing is served from a previous navigation.
  for (const width of [320, 390, 1440]) {
    for (const path of pages) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      await page.goto(path);
      const header = page.locator('.public-header');
      await expect(header).toBeVisible();
      const chrome = await header.evaluate(node => { const style = getComputedStyle(node); return { display: style.display, padding: style.paddingTop }; });
      expect(chrome.display, `${path} at ${width}`).toBe('flex');
      expect(chrome.padding, `${path} at ${width}`).not.toBe('0px');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path} at ${width}`).toBe(true);
      await context.close();
    }
  }
});

test('the authentication pages compose in every locale, light and dark', async ({ page }) => {
  await capabilities(page, true);
  for (const [locale, heading] of [['zh-TW', '回到你的日記'], ['zh-CN', '回到你的日记'], ['en', 'Return to your diary']] as const) {
    await page.goto('/login');
    await selectLocale(page, locale);
    await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
    await expect(page.locator('.auth-points > li h3').first()).not.toBeEmpty();
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark'] as const) {
      await selectTheme(page, theme);
      await page.screenshot({ path: `docs/design/evidence/auth/login-${width}-${theme}.png`, fullPage: true });
    }
  }
  await page.goto('/register');
  await selectLocale(page, 'en');
  await page.screenshot({ path: 'docs/design/evidence/auth/register-390-dark.png', fullPage: true });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('each authentication page is readable from the first response', async ({ page }) => {
    for (const path of pages) {
      await page.goto(path);
      await expect(page.locator('.public-header')).toBeVisible();
      await expect(page.locator('.auth-page .form-page h1')).not.toBeEmpty();
      // The statement beside the form ships in the SSR HTML, like the home page.
      await expect(page.locator('.auth-points > li')).toHaveCount(3);
    }
  });
});
