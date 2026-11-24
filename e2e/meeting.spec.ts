import { test, expect, login, createTodoList } from './fixtures'

// A small PNG, standing in for a slide photo.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

test('meeting notes: slides, summary, and action items sent to the TODO list', async ({ page }) => {
  await login(page, 'meeting')
  await createTodoList(page)
  await page.locator('aside').getByText('Home', { exact: true }).click()
  await page.getByRole('button', { name: 'Meeting note' }).click()
  await expect(page.locator('.gunita-editor h2', { hasText: 'Agenda' })).toBeVisible()
  await page.keyboard.type('Website sync')

  await page.locator('.gunita-editor h2', { hasText: 'Notes' }).click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Talked about the login bug and the demo video.')

  // A slide photo is added and its text is read by Claude.
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Add slides' }).click()
  await (await chooser).setFiles({ name: 'slide.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.locator('.gunita-editor img')).toBeVisible()
  await expect(page.locator('.gunita-editor')).toContainText('Extracted slide text')

  // Finishing writes the summary and offers the action items.
  await page.getByRole('button', { name: 'Finish meeting' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('fix the login bug')
  await dialog.getByRole('button', { name: /Send/ }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('.gunita-editor')).toContainText('We agreed to ship the website update next week.')
  await expect(page.locator('.gunita-editor')).toContainText('Ship on Friday')

  // They wait in the TODO list until added to today.
  await page.locator('aside').getByText('Work TODO', { exact: true }).click()
  await expect(page.getByText(/tasks? waiting/)).toBeVisible()
  await page.getByRole('button', { name: 'Add to today' }).click()
  await expect(page.locator('.todo-day.is-today')).toContainText('fix the login bug')
})
