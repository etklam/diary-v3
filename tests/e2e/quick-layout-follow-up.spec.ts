import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { expect, openQuick, openQuickOptions, selectLocale, test } from '../support/e2e'

const password = 'synthetic-quick-layout-follow-up-password'
const evidenceDir = 'docs/design/evidence/convenience-follow-up'

type Diary = {
  id: string
  tags: string[]
}

async function register(page: Page, email: string) {
  const response = await page.request.post('/api/auth/register', { data: { email, password } })
  expect(response.status()).toBe(200)
}

async function signIn(page: Page, email: string) {
  await page.goto(`/login?returnTo=${encodeURIComponent('/diaries/quick')}`)
  await selectLocale(page, 'en')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/diaries\/quick$/)
  await selectLocale(page, 'en')
}

async function startAccount(page: Page) {
  const email = `quick-layout-follow-up-${randomUUID()}@example.test`
  await register(page, email)
  await signIn(page, email)
}

async function readDiary(page: Page, id: string): Promise<Diary> {
  const response = await page.request.get(`/api/diaries/${id}`)
  expect(response.status()).toBe(200)
  return await response.json() as Diary
}

async function capture(page: Page, name: string, width: number) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  })
  await page.screenshot({ path: `${evidenceDir}/${name}-${width}.png`, fullPage: true })
}

for (const { width, height, date } of [
  { width: 1440, height: 900, date: '2026-10-24' },
  { width: 390, height: 844, date: '2026-10-25' },
]) {
  test(`Quick layout keeps content first and recent tags reachable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await startAccount(page)
    await page.goto('/diaries')
    await openQuick(page)
    const cleanDialog = page.locator('dialog.capture-dialog')
    await expect(cleanDialog).toBeVisible()
    await expect(cleanDialog.getByRole('textbox', { name: 'Content', exact: true })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(cleanDialog).toBeHidden()
    await page.goto(`/diaries/quick?date=${date}`)

    const options = page.locator('details.quick-options')
    const content = page.getByRole('textbox', { name: 'Content', exact: true })
    await expect(options).not.toHaveAttribute('open')
    await expect(content).toBeVisible()
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
    const bounds = await content.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.y).toBeGreaterThanOrEqual(0)
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height)
    await content.click()
    await expect(content).toBeFocused()
    await content.fill('Content remains reachable in the first viewport.')
    await capture(page, 'quick-content-first', width)

    await openQuickOptions(page)
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Recent tag seed')
    await page.getByRole('textbox', { name: 'Tags (one per line)', exact: true }).fill('design, review\ncontext')
    await page.getByRole('button', { name: 'Create diary', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Saved diary', exact: true })).toBeVisible()
    const savedHref = await page.getByRole('link', { name: 'Open diary', exact: true }).getAttribute('href')
    expect(savedHref).toMatch(/^\/diaries\/\d+$/)
    const saved = await readDiary(page, savedHref!.split('/').at(-1)!)
    expect(saved.tags).toEqual(['design, review', 'context'])

    await page.getByRole('button', { name: 'New note', exact: true }).click()
    await expect(content).toHaveValue('')
    await openQuickOptions(page)
    await expect(options).toHaveAttribute('open', '')
    const recent = page.getByRole('button', { name: 'design, review', exact: true })
    await expect(recent).toBeVisible()
    await expect(recent).toHaveAttribute('aria-pressed', 'false')
    await capture(page, 'quick-recent-tags', width)

    await page.goto('/diaries')
    await openQuick(page)
    const dialog = page.locator('dialog.capture-dialog')
    await expect(dialog).toBeVisible()
    const restore = dialog.getByRole('button', { name: 'Restore saved draft', exact: true })
    await expect(restore).toBeFocused()
    await restore.click()
    await expect(dialog.getByRole('textbox', { name: 'Content', exact: true })).toBeFocused()
  })
}
