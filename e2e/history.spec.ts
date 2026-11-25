import { test, expect, login, newPage } from './fixtures'

test('page history: preview an earlier version, restore it, undo the restore', async ({ page }) => {
  page.on('dialog', (d) => void d.accept())
  await login(page, 'history')
  await newPage(page, 'Notes with history')
  await page.keyboard.press('Enter')
  await page.keyboard.type('version one')
  await page.waitForTimeout(3500) // pushed
  // The first change of the day after that keeps a copy of "version one".
  await page.keyboard.type(' and version two')
  await page.waitForTimeout(3500)

  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: 'Page history' }).click()
  const dialog = page.getByRole('dialog', { name: 'Page history' })
  await expect(dialog.getByRole('option').first()).toContainText('Today')
  const preview = dialog.getByTestId('history-preview')
  await expect(preview).toContainText('version one')
  await expect(preview).not.toContainText('version two')

  await dialog.getByRole('button', { name: 'Restore this version' }).click()
  await expect(dialog).toBeHidden()
  const editor = page.locator('.gunita-editor')
  await expect(editor).toHaveText('version one')
  await expect(page.getByText(/Restored the version from Today/)).toBeVisible()

  // Ctrl+Z undoes the restore.
  await editor.click()
  await page.keyboard.press('Control+z')
  await expect(editor).toHaveText('version one and version two')
})

test('a large page (stored in R2 instead of the database) syncs to another device', async ({ page, browser }) => {
  await login(page, 'bigpage')
  await newPage(page, 'Big page')
  await page.keyboard.press('Enter')
  const big = 'lorem ipsum dolor sit amet '.repeat(230) // ~6 KB: over the test limit, so it goes to R2
  await page.keyboard.insertText(big)
  await page.keyboard.type('THE END')
  await page.waitForTimeout(3500)

  const other = await browser.newContext()
  await other.addCookies(await page.context().cookies())
  const p2 = await other.newPage()
  await p2.goto('/')
  await p2.locator('aside').getByText('Big page').click()
  await expect(p2.locator('.gunita-editor')).toContainText('THE END', { timeout: 30_000 })
  await expect(p2.locator('.gunita-editor')).toContainText(big.trim().slice(0, 200))
  await other.close()
})
