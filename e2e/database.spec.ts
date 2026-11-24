import { test, expect, login } from './fixtures'

test('creates a database with rows, a status and a board view', async ({ page }) => {
  await login(page, 'db')
  await page.getByRole('button', { name: 'Database' }).click()
  await expect(page.locator('main textarea')).toBeFocused()
  await page.keyboard.type('Job applications')

  for (const name of ['Analyst', 'Developer', 'Engineer']) {
    await page.getByText('New row').click()
    await page.locator('tbody tr').last().locator('td').first().locator('div.cursor-text').click()
    await page.keyboard.type(name)
    await page.keyboard.press('Enter')
  }
  await expect(page.locator('tbody tr')).toHaveCount(3)
  await expect(page.locator('tbody tr').first()).toContainText('Analyst')

  await page.locator('tbody tr').first().locator('td').nth(1).locator('button').first().click()
  await page.getByRole('menuitem', { name: 'In progress' }).or(page.getByText('In progress', { exact: true })).first().click()
  await page.keyboard.press('Escape')
  await expect(page.locator('tbody tr').first()).toContainText('In progress')

  await page.getByRole('button', { name: 'Add view' }).click()
  await page.getByRole('menuitem', { name: 'Board' }).click()
  await expect(page.getByText('Analyst')).toBeVisible()
  await expect(page.locator('tbody')).toHaveCount(0) // the board replaced the table
})
