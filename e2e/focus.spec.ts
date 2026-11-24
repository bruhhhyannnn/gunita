import { test, expect, login, createTodoList, taskText, dayTasks } from './fixtures'

test('a Pomodoro session: focus, break, skip, extra time, done', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-24T09:00:00') })
  await login(page, 'focus')
  await page.locator('aside').getByText('Focus', { exact: true }).click()
  await expect(page).toHaveTitle('Focus – Gunita')

  // 25 / 5 is the default; two sets.
  await expect(page.getByRole('radio', { name: '25 / 5' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('button', { name: 'Less Sets' }).click()
  await page.getByRole('button', { name: 'Less Sets' }).click()
  await expect(page.getByRole('textbox', { name: 'Sets' })).toHaveValue('2')
  await expect(page.getByText(/2 × 25 min with 5 min breaks · 55 min in all/)).toBeVisible()
  await page.getByRole('radio', { name: '30 / 5' }).click()
  await expect(page.getByRole('textbox', { name: 'Focus minutes' })).toHaveValue('30')
  await page.getByRole('radio', { name: '25 / 5' }).click()

  await page.getByRole('button', { name: 'Start focus' }).click()
  const time = page.getByTestId('focus-time')
  await expect(time).toHaveText('25:00')
  await expect(page).toHaveTitle(/^▶ 25:00 · Focus/)

  // It keeps counting on other pages: a small timer in the corner and in the sidebar.
  await page.clock.fastForward('10:00')
  await page.locator('aside').getByText('Home', { exact: true }).click()
  await expect(page.getByRole('button', { name: 'Focus timer' })).toContainText('15:00')
  await page.getByRole('button', { name: 'Focus timer' }).click()
  await expect(time).toHaveText('15:00')

  await page.getByRole('button', { name: 'Pause' }).click()
  await page.clock.fastForward('05:00')
  await expect(time).toHaveText('15:00') // paused
  await page.getByRole('button', { name: 'Resume' }).click()

  // The first set ends: a break starts on its own.
  await page.clock.fastForward('15:01')
  await expect(page.getByText('Set 1 of 2 done. Take a 5-minute break.')).toBeVisible()
  await expect(page.getByText('Break', { exact: true })).toBeVisible()
  await expect(page.getByTestId('focus-log')).toContainText('25 min')

  await page.getByRole('button', { name: 'Skip break' }).click()
  await expect(time).toHaveText('25:00')
  await page.getByRole('button', { name: '5 min' }).click()
  await expect(time).toHaveText('30:00')
  await page.clock.fastForward('30:01')

  await expect(page.getByText('Session complete', { exact: true })).toBeVisible()
  await expect(page.getByText('You focused for 55 minutes.')).toBeVisible()
  await expect(page.getByTestId('focus-today')).toHaveText('55 min')
  await expect(page).toHaveTitle('Focus – Gunita')
  await page.getByRole('button', { name: 'Start another' }).click()
  await expect(page.getByRole('button', { name: 'Start focus' })).toBeVisible()
})

test('focus on a task from the TODO list, then check it off', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-24T09:00:00') })
  await login(page, 'focustask')
  // One 25-minute set.
  await page.locator('aside').getByText('Focus', { exact: true }).click()
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Less Sets' }).click()
  await page.locator('aside').getByText('Home', { exact: true }).click()
  await createTodoList(page)

  await taskText(page, 'check emails').hover()
  await taskText(page, 'check emails').locator('.task-menu-btn').dispatchEvent('mousedown')
  await page.getByRole('menuitem', { name: 'Focus on this' }).click()
  await expect(page.getByText('Focusing on “check emails” for 25 min.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Focus timer' })).toContainText('25:00')

  await page.clock.fastForward('25:01')
  await page.locator('aside').getByText('Focus', { exact: true }).click()
  await expect(page.getByText('You focused for 25 minutes on “check emails”.')).toBeVisible()
  await page.getByRole('button', { name: 'Mark the task done' }).click()
  await expect(page.getByText('Checked off “check emails”.')).toBeVisible()
  await page.locator('aside').getByText('Work TODO', { exact: true }).click()
  await expect.poll(() => dayTasks(page)).toContain('done|check emails')
})
