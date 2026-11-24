import { test, expect, login, newPage } from './fixtures'

test('writes a page with headings, formatting and nested tasks', async ({ page }) => {
  await login(page, 'editor')
  await newPage(page, 'AWS Made Easy')
  await expect(page).toHaveTitle('AWS Made Easy – Gunita')
  await page.keyboard.press('Enter')

  // Slash menu → heading
  await page.keyboard.type('/head')
  await expect(page.getByText('Heading 1').first()).toBeVisible()
  await page.keyboard.press('Enter')
  await page.keyboard.type('EC2 (Elastic Compute Cloud)')
  await page.keyboard.press('Enter')

  // Bold with the keyboard
  await page.keyboard.type('lets you rent a ')
  await page.keyboard.press('Control+b')
  await page.keyboard.type('server')
  await page.keyboard.press('Control+b')
  await page.keyboard.press('Enter')

  // "[] " starts a task list; Tab nests, Shift+Tab un-nests
  await page.keyboard.type('[] check emails')
  await page.keyboard.press('Enter')
  await page.keyboard.type('nested task')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.type('back at the top')

  const editor = page.locator('.gunita-editor')
  await expect(editor.locator('h1')).toHaveText('EC2 (Elastic Compute Cloud)')
  await expect(editor.locator('strong')).toHaveText('server')
  await expect(editor.locator('ul[data-type=taskList] li p')).toHaveText(['check emails', 'nested task', 'back at the top'])
  await expect(editor.locator('ul[data-type=taskList] ul[data-type=taskList] li p')).toHaveText(['nested task'])

  // It shows in the sidebar and survives a reload (saved locally and synced).
  await expect(page.locator('aside').getByText('AWS Made Easy', { exact: true })).toBeVisible()
  await page.waitForTimeout(1500)
  await page.reload()
  await expect(page.locator('.gunita-editor strong')).toHaveText('server')
  await expect(page.locator('.gunita-editor')).toContainText('back at the top')
})

test('moves a task up and down with the keyboard', async ({ page }) => {
  await login(page, 'move')
  await newPage(page, 'Order')
  await page.keyboard.press('Enter')
  await page.keyboard.type('[] one')
  await page.keyboard.press('Enter')
  await page.keyboard.type('two')
  await page.keyboard.press('Enter')
  await page.keyboard.type('three')
  await page.keyboard.press('Control+Shift+ArrowUp')
  await page.keyboard.press('Control+Shift+ArrowUp')
  await expect(page.locator('.gunita-editor li p')).toHaveText(['three', 'one', 'two'])
  await page.keyboard.press('Alt+ArrowDown')
  await expect(page.locator('.gunita-editor li p')).toHaveText(['one', 'three', 'two'])
})
