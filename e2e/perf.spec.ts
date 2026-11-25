import { zipSync, strToU8 } from 'fflate'
import { test, expect, login } from './fixtures'

/** A Notion-style TODO page with `days` dated sections of 9 tasks each. */
function longTodoExport(days: number) {
  const lines = ['# Long TODO', '']
  const start = new Date('2026-11-24T12:00:00')
  for (let i = 1; i <= days; i++) {
    const d = new Date(start.getTime() - i * 86400_000)
    lines.push(d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), '')
    for (let t = 0; t < 8; t++) lines.push(`- [${t % 3 ? 'x' : ' '}]  task ${t} of day ${i} with some words in it`)
    lines.push('    - [x]  a sub task here', '')
  }
  return Buffer.from(zipSync({ [`Export-1/Long TODO ${'e'.repeat(32)}.md`]: strToU8(lines.join('\n')) }))
}

// Typing in a TODO list with months of days used to take seconds per key:
// every task's badges were redrawn on each keystroke.
test('typing stays fast in a TODO list with 150 days', async ({ page }) => {
  test.setTimeout(180_000)
  await page.clock.install({ time: new Date('2026-11-24T09:00:00') })
  await login(page, 'perf')
  await page.locator('aside').getByText('Settings', { exact: true }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Choose zip' }).click()
  await (await chooser).setFiles({ name: 'Export.zip', mimeType: 'application/zip', buffer: longTodoExport(150) })
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Import', exact: true }).click()
  await expect(dialog).toContainText('pages and rows', { timeout: 120_000 })
  await dialog.getByRole('button', { name: 'Open TODO list' }).click()
  await expect(page.locator('.todo-day.is-today')).toBeVisible({ timeout: 60_000 })
  expect(await page.locator('.todo-day').count()).toBeGreaterThan(150)
  await page.waitForTimeout(6000) // let syncing and indexing after the import settle

  await page.locator('.todo-day.is-today li > div > p').last().click({ position: { x: 4, y: 8 } })
  await page.keyboard.press('End')
  await page.evaluate(() => {
    const w = window as unknown as { __lat: number[] }
    w.__lat = []
    document.addEventListener(
      'keydown',
      () => {
        const t0 = performance.now()
        requestAnimationFrame(() => setTimeout(() => w.__lat.push(performance.now() - t0), 0))
      },
      true,
    )
  })
  await page.keyboard.type(' the quick brown fox jumps over the lazy dog', { delay: 30 })
  const lat = (await page.evaluate(() => (window as unknown as { __lat: number[] }).__lat)).sort((a, b) => a - b)
  const median = lat[Math.floor(lat.length / 2)]
  // ~25 ms here; generous for slower CI machines, far below the old seconds per key.
  expect(median, `median keystroke ${Math.round(median)} ms`).toBeLessThan(250)
  await expect(page.locator('.todo-day.is-today')).toContainText('the quick brown fox jumps over the lazy dog')
})
