import { test, expect, login, newPage, createTodoList, checkbox, dayTasks } from './fixtures'

test('Ctrl+Z / Ctrl+Y undo and redo typing, titles and deleted pages', async ({ page }) => {
  await login(page, 'undo')
  await newPage(page, 'Plans')
  await page.keyboard.press('Enter')
  await page.keyboard.type('first line')
  await page.waitForTimeout(900)
  await page.keyboard.type(' and more')
  const editor = page.locator('.gunita-editor')
  await page.keyboard.press('Control+z')
  await expect(editor).toHaveText('first line')
  await page.keyboard.press('Control+y')
  await expect(editor).toHaveText('first line and more')

  // The title is undone as a whole word, not letter by letter.
  const title = page.locator('main textarea')
  await title.click()
  await page.keyboard.press('End')
  await page.waitForTimeout(900)
  await page.keyboard.type(' for 2027')
  await expect(title).toHaveValue('Plans for 2027')
  await page.keyboard.press('Control+z')
  await expect(title).toHaveValue('Plans')
  await page.keyboard.press('Control+Shift+z')
  await expect(title).toHaveValue('Plans for 2027')

  // The undo/redo buttons in the top bar.
  await page.getByRole('button', { name: /^Undo \(/ }).click()
  await expect(title).toHaveValue('Plans')
  await page.getByRole('button', { name: /^Redo \(/ }).click()
  await expect(title).toHaveValue('Plans for 2027')

  // A page moved to the trash comes back with Ctrl+Z.
  await page.waitForTimeout(900)
  await page.locator('aside').getByText('Plans for 2027').hover()
  await page.locator('aside [aria-label="Page options"]').first().click()
  await page.getByRole('menuitem', { name: /trash/i }).click()
  await expect(page.locator('aside').getByText('Plans for 2027')).toHaveCount(0)
  await page.locator('body').press('Control+z')
  await expect(page.getByText('Restored “Plans for 2027” from the trash')).toBeVisible()
  await expect(page.locator('aside').getByText('Plans for 2027')).toBeVisible()
})

test('undo works on TODO checkboxes and moves', async ({ page }) => {
  await login(page, 'undotodo')
  await createTodoList(page)
  await page.waitForTimeout(900)
  await checkbox(page, 'check emails').click()
  expect(await dayTasks(page)).toContain('done|check emails')
  await page.keyboard.press('Control+z')
  await expect.poll(() => dayTasks(page)).toContain('open|check emails')
})
