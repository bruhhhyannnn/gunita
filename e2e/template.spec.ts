import { test, expect, login, createTodoList, dayTasks } from './fixtures'

test('edits the daily template like a page: type, indent, reorder, repeat', async ({ page }) => {
  await login(page, 'template')
  await createTodoList(page)
  await page.getByRole('button', { name: 'Template', exact: true }).click()
  const editor = page.locator('.template-editor')
  await expect(editor).toBeVisible()

  const items = () =>
    editor.locator('li').evaluateAll((lis) =>
      lis.map((li) => {
        const p = li.querySelector('p')!
        const text = [...p.childNodes].filter((n) => !(n instanceof HTMLElement && n.contentEditable === 'false')).map((n) => n.textContent).join('').trim()
        return (li.parentElement?.closest('li') ? '  ' : '') + text
      }),
    )
  await expect.poll(items).toEqual(['check emails', 'check new potential jobs on csc', 'add things on CWA work accomplishment'])

  // Type a new task after the last one; Tab nests it, Shift+Tab brings it back.
  await editor.locator('li p').last().click({ position: { x: 4, y: 8 } })
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('update the timesheet')
  await page.keyboard.press('Tab')
  await expect.poll(items).toContain('  update the timesheet')
  await page.keyboard.press('Shift+Tab')
  await expect.poll(items).toContain('update the timesheet')

  // Move it to the top with the keyboard.
  for (let i = 0; i < 3; i++) await page.keyboard.press('Control+Shift+ArrowUp')
  await expect.poll(items).toEqual(['update the timesheet', 'check emails', 'check new potential jobs on csc', 'add things on CWA work accomplishment'])

  // Change how often it repeats.
  await editor.locator('.repeat-chip').first().dispatchEvent('mousedown')
  await page.getByRole('button', { name: 'Weekdays (Mon–Fri)' }).click()
  await page.keyboard.press('Escape')
  await expect(editor.locator('.repeat-chip').first()).toHaveText('Weekdays')

  // The auto-start option uses the shared checkbox.
  const autoStart = page.getByRole('dialog').getByRole('checkbox', { name: /Start the day automatically/ })
  await expect(autoStart).toHaveAttribute('data-state', 'checked')
  expect(await autoStart.evaluate((el) => el.tagName)).toBe('BUTTON')

  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()

  // Reopen: the changes were saved.
  await page.getByRole('button', { name: 'Template', exact: true }).click()
  await expect.poll(items).toEqual(['update the timesheet', 'check emails', 'check new potential jobs on csc', 'add things on CWA work accomplishment'])
  await expect(editor.locator('.repeat-chip').first()).toHaveText('Weekdays')
  await page.keyboard.press('Escape')
  expect(await dayTasks(page)).toHaveLength(3) // today is unchanged until tomorrow
})
