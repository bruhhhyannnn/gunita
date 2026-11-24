import { test, expect, login, createTodoList, cursorAtEnd, checkbox } from './fixtures'

test('drafts the accomplishment report on the 15th', async ({ page, context, baseURL }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL })
  await page.clock.install({ time: new Date('2026-11-10T08:00:00') })
  await login(page, 'report')
  await createTodoList(page)

  // Work done on the 10th: a routine task, and a project with two finished sub-tasks.
  await checkbox(page, 'check emails').click()
  await cursorAtEnd(page, 'add things on CWA')
  await page.keyboard.press('Enter')
  await page.keyboard.type('finish the website')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await page.keyboard.type('fix the login bug')
  await page.keyboard.press('Enter')
  await page.keyboard.type('record the demo video')
  await checkbox(page, 'fix the login bug').click()
  await checkbox(page, 'record the demo video').click()
  await page.waitForTimeout(1500)

  // On the 15th the report for Nov 1–15 is drafted by itself.
  await page.clock.setSystemTime(new Date('2026-11-15T18:00:00'))
  await page.reload()
  await expect(page.getByText(/accomplishment report is drafted/)).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Open' }).click()
  await expect(page.getByRole('button', { name: 'Copy for Google Docs' })).toBeVisible()
  await expect(page).toHaveTitle(/Nov 1–15, 2026/)

  const body = page.locator('.gunita-editor')
  await expect(body).toContainText('November 1-15, 2026')
  await expect(body).toContainText('Website redesign') // grouped by the (fake) Claude
  await expect(body).toContainText('Fixed the login bug on mobile.')
  await expect(body).not.toContainText('check emails') // routine tasks are left out

  // It lives in the list's "Accomplishment reports" folder, and lists the missed weekdays.
  await expect(page.getByText('Accomplishment reports', { exact: true })).toBeVisible()
  await expect(body).toContainText('November 11, 12 and 13')

  // Copy pastes into Google Docs as formatted text.
  await page.getByRole('button', { name: 'Copy for Google Docs' }).click()
  await expect(page.getByText('Copied')).toBeVisible()
  const html = () =>
    page.evaluate(async () => {
      const [item] = await navigator.clipboard.read()
      return item.types.includes('text/html') ? (await item.getType('text/html')).text() : ''
    })
  await expect.poll(html).toContain('<li>Fixed the login bug on mobile.</li>')
})
