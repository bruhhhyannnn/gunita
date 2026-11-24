import { test, expect, login, createTodoList, cursorAtEnd, checkbox, dayTasks } from './fixtures'

test('carries unfinished tasks over to the next days', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-19T08:00:00') })
  await login(page, 'todo')
  await createTodoList(page)

  // Day 1: the daily template is there; finish one task and add a project with sub-tasks.
  await expect(page.locator('.todo-day.is-today li p').first()).toContainText('check emails')
  await checkbox(page, 'check emails').click()
  await cursorAtEnd(page, 'add things on CWA')
  await page.keyboard.press('Enter')
  await page.keyboard.type('finish the website')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await page.keyboard.type('record the demo video')
  await page.keyboard.press('Enter')
  await page.keyboard.type('fix the login bug')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Shift+Tab')
  // A blank task is left at the end: it must not be carried over.
  await checkbox(page, 'record the demo video').click()
  await page.waitForTimeout(1500)

  // Day 2: open the list the next morning.
  await page.clock.setSystemTime(new Date('2026-11-20T08:00:00'))
  await page.reload()
  await expect(page.locator('.todo-day.is-today')).toHaveAttribute('data-date', '2026-11-20')
  await page.waitForTimeout(1000)

  const today = await dayTasks(page)
  expect(today).toContain('open|finish the website')
  expect(today).toContain('  open|fix the login bug')
  expect(today).not.toContain('  open|record the demo video') // done yesterday
  expect(today.filter((t) => t.endsWith('|'))).toEqual([]) // no blank tasks
  // The template's daily tasks come back fresh; "check emails" is open again.
  expect(today).toContain('open|check emails')

  // Yesterday keeps its history: unfinished tasks are marked as moved.
  const yesterday = await dayTasks(page, '2026-11-19')
  expect(yesterday).toContain('done|check emails')
  expect(yesterday).toContain('moved|finish the website')
  await expect(page.locator('.todo-day.is-today li', { hasText: 'fix the login bug' }).first()).toContainText('since Nov 19')

  // Day 4 (a day skipped): still carried, counting how many times.
  await page.clock.setSystemTime(new Date('2026-11-22T08:00:00'))
  await page.reload()
  await expect(page.locator('.todo-day.is-today')).toHaveAttribute('data-date', '2026-11-22')
  await expect(page.locator('.todo-day.is-today li', { hasText: 'fix the login bug' }).first()).toContainText('carried 2×')
})

test('quick capture sends tasks to the inbox, then to today', async ({ page }) => {
  await login(page, 'capture')
  await createTodoList(page)
  await page.keyboard.press('Control+Shift+E')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.locator('textarea').fill('call the registrar\nbuy printer ink')
  await dialog.getByRole('button', { name: 'Add as tasks' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('2 tasks added to your inbox')).toBeVisible()
  await expect(page.getByText('2 tasks waiting')).toBeVisible()
  await page.getByRole('button', { name: 'Add to today' }).click()
  const today = page.locator('.todo-day.is-today')
  await expect(today).toContainText('call the registrar')
  await expect(today).toContainText('buy printer ink')
  await expect(page.getByText('2 tasks waiting')).toBeHidden()
})

test('Ctrl+→ to the end of a task keeps the caret in the text', async ({ page }) => {
  await login(page, 'wordnav')
  await createTodoList(page)
  await cursorAtEnd(page, 'add things on CWA')
  await page.keyboard.press('Enter')
  await page.keyboard.type('the quick fox jumps')
  await page.keyboard.press('Control+ArrowLeft')
  await page.keyboard.press('Control+ArrowLeft')
  await page.keyboard.type('brown ')
  // Word jumps differ by OS (Linux stops at word ends, Windows at word starts),
  // so jump until the caret reaches the end of the line.
  const atEnd = () => page.evaluate(() => {
    const s = window.getSelection()!
    return s.anchorNode?.nodeType === Node.TEXT_NODE && s.anchorOffset === s.anchorNode.textContent?.length && s.anchorNode.textContent?.endsWith('jumps')
  })
  for (let i = 0; i < 4 && !(await atEnd()); i++) await page.keyboard.press('Control+ArrowRight')
  expect(await atEnd()).toBe(true)
  await page.keyboard.type(' high')
  expect(await dayTasks(page)).toContain('open|the quick brown fox jumps high')
})

test('the drag handle stays on a task while the mouse moves to it', async ({ page }) => {
  await login(page, 'handle')
  await createTodoList(page)
  await cursorAtEnd(page, 'add things on CWA')
  await page.keyboard.press('Enter')
  await page.keyboard.type('parent task')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await page.keyboard.type('child task')
  await page.waitForTimeout(1500) // let "Suggested for today" settle so nothing moves

  for (const scope of ['.todo-day.is-today li li', '.todo-day.is-today li']) {
    const item = page.locator(scope).filter({ hasText: scope.includes('li li') ? 'child task' : 'check new potential' }).first()
    const text = (await item.locator('p').first().boundingBox())!
    await page.mouse.move(text.x + 40, text.y + text.height / 2)
    const handle = page.locator('.drag-handle').filter({ visible: true })
    await expect(handle).toBeVisible()
    const start = (await handle.boundingBox())!
    // Walk left across the checkbox to the handle.
    for (let i = 1; i <= 15; i++) {
      await page.mouse.move(text.x + 40 + (start.x + start.width / 2 - text.x - 40) * (i / 15), start.y + start.height / 2)
    }
    await page.waitForTimeout(200)
    const end = (await handle.boundingBox())!
    const li = (await item.boundingBox())!
    expect(Math.abs(end.y - li.y), `handle stays on ${scope}`).toBeLessThan(8)
    expect(end.x).toBeCloseTo(start.x, 0)
  }
})
