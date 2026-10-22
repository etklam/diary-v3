import { randomUUID } from 'node:crypto'
import { expect, selectLocale, test } from '../support/e2e'

for (const scenario of [
  { timezone: 'Asia/Hong_Kong', instant: '2026-10-22T16:01:00Z', deadline: '1 days overdue', status: 'Overdue' },
  { timezone: 'America/New_York', instant: '2026-10-23T03:59:00Z', deadline: 'Due today', status: 'In progress' },
]) test(`goals use the account day in ${scenario.timezone} and preserve the server achievement date`, async ({ page }) => {
  const credentials = { email: `goal-timezone-${randomUUID()}@example.test`, password: 'synthetic-goal-timezone-password' }
  expect((await page.request.post('/api/auth/register', { data: credentials })).ok()).toBe(true)
  expect((await page.request.post('/api/auth/login', { data: credentials })).ok()).toBe(true)
  const csrf = (await page.context().cookies()).find(cookie => cookie.name === 'csrf-token')!.value
  expect((await page.request.put('/api/user/settings', { data: { timezone: scenario.timezone }, headers: { 'x-csrf-token': csrf } })).ok()).toBe(true)
  await page.clock.setFixedTime(new Date(scenario.instant))

  let goal = {
    id: '1', content: 'Synthetic deadline milestone', targetDate: '2026-10-22',
    status: 'active', achievedDate: null as string | null,
    createdAt: '2026-10-20T00:00:00Z', updatedAt: '2026-10-20T00:00:00Z',
  }
  await page.route('**/api/goals', route => route.fulfill({ json: [goal] }))
  await page.route('**/api/goals/1', async route => {
    // A response date is authoritative even if the browser clock differs.
    goal = { ...goal, status: 'achieved', achievedDate: '2026-10-20' }
    await route.fulfill({ json: goal })
  })
  await page.goto('/achievements')
  await selectLocale(page, 'en')
  const row = page.getByTestId('goal')
  await expect(row).toContainText(scenario.deadline)
  await expect(row.locator('.goal-status')).toHaveText(scenario.status)
  await row.getByRole('button', { name: 'Mark achieved', exact: true }).click()
  await expect(page.getByTestId('achievement-date')).toHaveValue('2026-10-20')
  await expect(page.getByTestId('achievement-input')).toHaveValue(goal.content)
  // The handoff still needs the user's explicit save.
  await expect(page.getByTestId('achievement')).toHaveCount(0)
})
