import { zipSync, strToU8 } from 'fflate'
import { test, expect, login, dayTasks } from './fixtures'

const id = (c: string) => c.repeat(32)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

/** A small export shaped like Notion's "Markdown & CSV" zip. */
function notionExport() {
  const root = 'Export-0f1e2d3c/'
  const files: Record<string, Uint8Array> = {
    [`${root}Projects ${id('a')}.md`]: strToU8(
      [
        '# Projects',
        '',
        'Intro with **bold** text and a [link](https://example.com).',
        '',
        '![slide.png](attachments/1111/slide.png)',
        '',
        `[Sub page](Projects/Sub%20page%20${id('b')}.md)`,
        '',
        `[Reading list](Projects/Reading%20list%20${id('c')}.csv)`,
        '',
        '```js',
        'const x = 1',
        '```',
        '',
        '```',
        '```',
      ].join('\n'),
    ),
    [`${root}Projects/Sub page ${id('b')}.md`]: strToU8('# Sub page\n\n- [ ]  first\n- [x]  second\n'),
    [`${root}Projects/Reading list ${id('c')}.csv`]: strToU8('Name,Done\nBook A,Yes\n'),
    [`${root}Projects/Reading list ${id('c')}_all.csv`]: strToU8(
      'Name,Done,Date,Tags\nBook A,Yes,"November 1, 2026","x, y"\nBook B,No,"November 3, 2026",z\n',
    ),
    [`${root}attachments/1111/slide.png`]: PNG,
    [`${root}Work TODO ${id('d')}.md`]: strToU8(
      [
        '# Work TODO',
        '',
        'November 20, 2026',
        '',
        '- [x]  check emails',
        '- [ ]  finish the website',
        '    - [ ]  fix the login bug',
        '- [ ]  an old idea',
        '',
        'November 21, 2026',
        '',
        '- [ ]  check emails',
        '- [ ]  finish the website',
        '- [ ]  write the tests',
        '- [ ]  ',
      ].join('\n'),
    ),
  }
  return Buffer.from(zipSync(files))
}

test('imports a Notion export: pages, databases, files and TODO lists', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-24T08:00:00') })
  await login(page, 'import')
  await page.locator('aside').getByText('Settings', { exact: true }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Choose zip' }).click()
  await (await chooser).setFiles({ name: 'Export.zip', mimeType: 'application/zip', buffer: notionExport() })

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Turn into TODO lists')).toBeVisible()
  await expect(dialog.getByRole('checkbox', { name: /Work TODO/ })).toHaveAttribute('data-state', 'checked')
  await dialog.getByRole('button', { name: 'Import', exact: true }).click()
  await expect(dialog).toContainText('pages and rows')
  await dialog.getByRole('button', { name: 'Open TODO list' }).click()

  // The TODO page became a TODO list: one section per date, today started.
  await expect(page.locator('.todo-day.is-today')).toHaveAttribute('data-date', '2026-11-24')
  await expect(page.locator('.todo-day[data-date="2026-11-21"]')).toBeVisible()
  await expect(page.locator('.todo-day[data-date="2026-11-20"]')).toBeVisible()
  const today = await dayTasks(page)
  expect(today).toEqual(expect.arrayContaining(['open|check emails', 'open|finish the website', 'open|write the tests']))
  expect(today.filter((t) => t.endsWith('|'))).toEqual([]) // the blank checkbox was dropped
  // Older unfinished tasks stay where they were, marked as not carried over.
  expect(await dayTasks(page, '2026-11-20')).toContain('archived|an old idea')

  // The daily template was worked out from tasks that repeat.
  await page.getByRole('button', { name: 'Template', exact: true }).click()
  await expect(page.locator('.template-editor li')).toHaveCount(2)
  await expect(page.locator('.template-editor')).toContainText('check emails')
  await expect(page.locator('.template-editor')).toContainText('finish the website')
  await page.keyboard.press('Escape')

  // Pages go into an "Imported from Notion" page, and keep their formatting,
  // images, sub-pages and databases.
  await expect(page.locator('aside').getByText('Imported from Notion')).toBeVisible()
  await page.keyboard.press('Control+k')
  await page.keyboard.type('Projects')
  await expect(page.getByRole('option', { name: /Projects/ }).first()).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page).toHaveTitle('Projects – Gunita')
  const body = page.locator('.gunita-editor')
  await expect(body.locator('strong')).toHaveText('bold')
  await expect(body.locator('a[href="https://example.com"]')).toHaveText('link')
  await expect(body.locator('pre')).toHaveCount(2)
  await expect.poll(() => body.locator('img').first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(1)
  await expect(body.getByText('Sub page')).toBeVisible()
  await expect(body.getByText('Book B')).toBeVisible() // the database, embedded with all its rows
  await expect(body.getByText('Book A')).toBeVisible()
})
