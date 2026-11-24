import { test, expect, login, newPage } from './fixtures'

test('typing is pushed in a few debounced requests, and reaches another device', async ({ page, browser }) => {
  await login(page, 'sync')
  await newPage(page, 'Sync test')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(3000) // let the first sync after creating the page finish

  const pushes: number[] = []
  page.on('request', (r) => {
    if (r.url().endsWith('/api/sync') && r.method() === 'POST' && (r.postData() ?? '').includes('"update"')) pushes.push(Date.now())
  })
  // About 12 seconds of steady typing.
  const words = 'the quick brown fox jumps over the lazy dog '.repeat(5)
  const t0 = Date.now()
  await page.keyboard.type(words, { delay: 55 })
  const typingMs = Date.now() - t0
  await page.waitForTimeout(3000) // the push after typing stops
  // Without debouncing this was one push every ~1.5 s; now at most one per 10 s while typing, plus one at the end.
  expect(pushes.length, `${pushes.length} pushes in ${Math.round(typingMs / 1000)} s`).toBeLessThanOrEqual(Math.ceil(typingMs / 10_000) + 2)
  expect(pushes.length).toBeGreaterThanOrEqual(1)

  // Another device (same account) gets everything.
  const other = await browser.newContext()
  await other.addCookies(await page.context().cookies())
  const p2 = await other.newPage()
  await p2.goto('/')
  await p2.locator('aside').getByText('Sync test').click()
  await expect(p2.locator('.gunita-editor')).toContainText(words.trim())

  // And edits from there come back here (the server's shortcut must not skip them).
  await p2.locator('.gunita-editor p').last().click()
  await p2.keyboard.press('End')
  await p2.keyboard.type(' from the laptop')
  await p2.waitForTimeout(2500)
  await page.keyboard.type(' and the phone')
  await page.waitForTimeout(2500)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(page.locator('.gunita-editor')).toContainText('from the laptop', { timeout: 30_000 })
  await p2.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(p2.locator('.gunita-editor')).toContainText('and the phone', { timeout: 30_000 })
  await other.close()
})
