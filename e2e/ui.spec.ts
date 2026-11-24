import { test, expect, login, newPage } from './fixtures'

test('page titles show in the browser tab', async ({ page }) => {
  await login(page, 'title')
  await expect(page).toHaveTitle('Home – Gunita')
  await newPage(page, 'Reading notes')
  await expect(page).toHaveTitle('Reading notes – Gunita')
})

test('the sidebar page menu opens next to its page', async ({ page }) => {
  await login(page, 'menu')
  for (const t of ['One', 'Two', 'Three', 'Four', 'Five']) await newPage(page, t)
  await page.locator('aside').getByText('Five', { exact: true }).hover()
  const button = page.locator('aside [aria-label="Page options"]').last()
  await button.click()
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  const b = (await button.boundingBox())!
  const m = (await menu.boundingBox())!
  expect(Math.abs(m.y - (b.y + b.height))).toBeLessThan(40)
})

test('the emoji picker buttons stay inside the card', async ({ page }) => {
  await login(page, 'emoji')
  await newPage(page, 'Icons')
  await page.locator('main').getByText('Add icon').click({ force: true })
  const card = page.locator('[data-radix-popper-content-wrapper]').last()
  await expect(page.getByRole('button', { name: 'Remove icon' })).toBeVisible()
  const c = (await card.boundingBox())!
  for (const name of ['Random emoji', 'Remove icon']) {
    const r = (await page.getByRole('button', { name }).boundingBox())!
    expect(r.x + r.width).toBeLessThanOrEqual(c.x + c.width)
  }
})

test('the cover gallery shows a message when paintings cannot load', async ({ page }) => {
  await page.route(/artic\.edu|wikimedia\.org/, (r) => r.fulfill({ status: 503, body: 'down' }))
  await login(page, 'cover')
  await newPage(page, 'Cover')
  await page.locator('main').getByText('Add cover').click({ force: true })
  await expect(page.getByText("Couldn't load paintings right now.")).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
})

test('unknown pages show the not found page', async ({ page }) => {
  await login(page, 'notfound')
  await page.goto('/this/does/not/exist')
  await expect(page.getByText('Page not found')).toBeVisible()
})

test.describe('errors', () => {
  test.use({ allowPageErrors: true })
  test('a crash shows the developer error page', async ({ page }) => {
    await login(page, 'crash')
    await page.goto('/?crash=1')
    await expect(page.getByText('Developer error page')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Copy details' })).toBeVisible()
    await expect(page.locator('aside').getByText('Settings', { exact: true })).toBeVisible() // the app around it still works
  })
})
