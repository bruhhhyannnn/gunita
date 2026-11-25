import { test, expect, login, createTodoList, cursorAtEnd, checkbox, taskText } from './fixtures'

const inSection = (name: string) => `.todo-day.is-today .todo-section:has(.todo-section-title:text("${name}"))`

test('Work and Personal sections: carry-over keeps them, the report only uses Work', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-10T08:00:00') })
  await login(page, 'sections')
  await createTodoList(page)

  // Set up the two sections from the "/" menu (there's no toolbar button);
  // today's tasks and the template go into Work.
  await expect(page.getByRole('button', { name: 'Sections', exact: true })).toHaveCount(0)
  await cursorAtEnd(page, 'add things on CWA')
  await page.keyboard.press('Enter')
  await page.keyboard.type('/sections')
  await expect(page.getByText('Split days into Work, Personal')).toBeVisible()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: /Add 💼 Work and 🏠 Personal/ }).click()
  await expect(dialog.getByTestId('section-row')).toHaveCount(2)
  await expect(dialog.getByRole('checkbox', { name: /Put today's tasks/ })).toHaveAttribute('data-state', 'checked')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()

  const work = page.locator(inSection('Work'))
  const personal = page.locator(inSection('Personal'))
  await expect(work.locator('.todo-section-badge')).toHaveText(/In report/)
  await expect(work).toContainText('check emails')
  await expect(personal.locator('li')).toHaveCount(1) // one blank task to type in

  // The blank line "/sections" was typed on is gone.
  await expect(work.locator('li')).toHaveCount(3)

  // Work task, then a personal one moved down into Personal with Alt+↓.
  await checkbox(page, 'check emails').click()
  await cursorAtEnd(page, 'add things on CWA')
  await page.keyboard.press('Enter')
  await page.keyboard.type('finish the website')
  await checkbox(page, 'finish the website').click()
  await cursorAtEnd(page, 'finish the website')
  await page.keyboard.press('Enter')
  await page.keyboard.type('buy groceries')
  await page.keyboard.press('Alt+ArrowDown')
  await expect(personal).toContainText('buy groceries')
  await expect(work).not.toContainText('buy groceries')
  await page.keyboard.type(' and milk') // the caret moved with the task
  await expect(taskText(page, 'buy groceries and milk')).toBeVisible()
  await checkbox(page, 'buy groceries and milk').click()

  // An unfinished personal task, sent to Work and back with the task menu.
  await cursorAtEnd(page, 'buy groceries and milk')
  await page.keyboard.press('Enter')
  await page.keyboard.type('call mom')
  await taskText(page, 'call mom').hover()
  await taskText(page, 'call mom').locator('.task-menu-btn').dispatchEvent('mousedown')
  await page.getByRole('menuitem', { name: 'Work' }).click()
  await expect(work).toContainText('call mom')
  await taskText(page, 'call mom').locator('.task-menu-btn').dispatchEvent('mousedown')
  await page.getByRole('menuitem', { name: 'Personal' }).click()
  await expect(personal).toContainText('call mom')
  await page.waitForTimeout(1500)

  // Next day: unfinished tasks come back in their own sections.
  await page.clock.setSystemTime(new Date('2026-11-11T08:00:00'))
  await page.reload()
  await expect(page.locator('.todo-day.is-today')).toHaveAttribute('data-date', '2026-11-11')
  await expect(work).toContainText('check emails') // template, in Work
  await expect(work).toContainText('add things on CWA')
  await expect(personal).toContainText('call mom')
  await expect(work).not.toContainText('call mom')

  // The template shows which section each task goes in.
  await page.getByRole('button', { name: 'Template', exact: true }).click()
  await expect(page.locator('.template-editor .section-chip').first()).toHaveText('💼 Work')
  await page.keyboard.press('Escape')

  // The report counts Work only.
  await page.getByRole('button', { name: 'Report', exact: true }).click()
  const report = page.getByRole('dialog')
  await expect(report.getByTestId('report-sections')).toContainText('💼 Work only')
  await report.getByRole('combobox', { name: 'Grouping' }).click()
  await page.getByRole('option', { name: 'By day (no AI)' }).click()
  await report.getByRole('combobox', { name: 'Period' }).click()
  await page.getByRole('option', { name: /This period/ }).click()
  await report.getByRole('button', { name: /Create report|Update report/ }).click()
  const body = page.locator('.gunita-editor')
  await expect(body).toContainText('finish the website')
  await expect(body).not.toContainText('buy groceries')
})

test('Alt+↑/↓ moves tasks and blocks without moving the whole day', async ({ page }) => {
  await login(page, 'altmove')
  await createTodoList(page)
  await cursorAtEnd(page, 'check new potential jobs')
  await page.keyboard.press('Alt+ArrowUp')
  await expect(page.locator('.todo-day.is-today li > div > p').first()).toContainText('check new potential jobs')
  await page.keyboard.press('Alt+ArrowDown')
  await page.keyboard.press('Alt+ArrowDown')
  await expect(page.locator('.todo-day.is-today li > div > p').last()).toContainText('check new potential jobs')
  // At the edge nothing happens (the day stays put).
  await page.keyboard.press('Alt+ArrowDown')
  await expect(page.locator('.todo-day')).toHaveCount(1)
  await expect(page.locator('.todo-day.is-today li > div > p').last()).toContainText('check new potential jobs')
})
