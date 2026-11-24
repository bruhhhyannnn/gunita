import { test, expect, login, createTodoList, newPage } from './fixtures'

test('suggests text that Tab accepts, and Tab still indents lists', async ({ page }) => {
  await login(page, 'ghost')
  await newPage(page, 'AWS notes')
  await page.keyboard.press('Enter')
  await page.keyboard.type('EC2 lets you rent a virtual server')
  await expect(page.locator('.ghost-text')).toContainText('that runs your app', { timeout: 10_000 })
  await page.keyboard.press('Tab')
  await expect(page.locator('.gunita-editor p').first()).toHaveText('EC2 lets you rent a virtual server that runs your app')

  await page.keyboard.press('Enter')
  await page.keyboard.type('[] parent task')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await expect(page.locator('.gunita-editor ul ul li')).toHaveCount(1)
})

test('plans the day and adds suggestions with Tab', async ({ page }) => {
  await login(page, 'plan')
  await createTodoList(page)
  await expect(page.getByText('Suggested for today')).toBeVisible()
  await expect(page.getByText('prepare slides for the quarterly review')).toBeVisible()

  await page.locator('.todo-day.is-today li > div > p').last().click({ position: { x: 4, y: 8 } })
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await expect(page.locator('.ghost-text')).toContainText('prepare slides')
  await page.keyboard.press('Tab')
  await expect(page.locator('.todo-day.is-today')).toContainText('prepare slides for the quarterly review')
})

test('answers questions about my notes', async ({ page, request }) => {
  await login(page, 'ask')
  await newPage(page, 'EC2')
  await page.keyboard.press('Enter')
  await page.keyboard.type('EC2 lets you rent virtual machines.')
  await page.waitForTimeout(800)
  await page.keyboard.press('Control+j')
  await page.getByPlaceholder('Ask about your notes…').fill('what is EC2?')
  await page.keyboard.press('Enter')
  await expect(page.locator('aside').getByText('virtual machines')).toBeVisible()

  // Requests use the configured model with server-side fallbacks.
  const log: { model: string; beta: string | null }[] = await (await request.get('http://127.0.0.1:8788/__log')).json()
  expect(log.some((r) => r.model === 'claude-opus-5-5' && r.beta?.includes('server-side-fallback'))).toBe(true)
})
