import { test, expect, login, newPage } from './fixtures'

test('Ctrl + / − change the page text size, and Settings shows it', async ({ page }) => {
  await login(page, 'textsize')
  await newPage(page, 'Big text')
  await page.keyboard.press('Enter')
  await page.keyboard.type('some words')
  const para = page.locator('.gunita-editor p').first()
  const size = () => para.evaluate((el) => getComputedStyle(el).fontSize)
  await expect.poll(size).toBe('16px')

  await page.keyboard.press('Control+=')
  await page.keyboard.press('Control+=')
  await expect.poll(size).toBe('18px')
  await expect(page.getByText('Text size 18px')).toBeVisible()
  // The title and headings grow with it.
  expect(await page.locator('main textarea').evaluate((el) => getComputedStyle(el).fontSize)).toBe('45px')
  await page.keyboard.press('Control+-')
  await expect.poll(size).toBe('17px')

  // Kept on this device after a reload.
  await page.reload()
  await expect.poll(size).toBe('17px')

  await page.locator('aside').getByText('Settings', { exact: true }).click()
  await expect(page.getByTestId('text-size')).toHaveText('17px')
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(page.getByTestId('text-size')).toHaveText('16px')
})
