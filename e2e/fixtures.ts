import { test as base, expect, type Page } from '@playwright/test'

export { expect }

type Fixtures = {
  /** Set to true in tests that expect an uncaught error (like the error page test). */
  allowPageErrors: boolean
  pageErrors: string[]
}

export const test = base.extend<Fixtures>({
  allowPageErrors: [false, { option: true }],
  // Fails the test if the page threw an uncaught error.
  pageErrors: [
    async ({ page, allowPageErrors }, use) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      await use(errors)
      if (!allowPageErrors) expect(errors, 'uncaught errors in the page').toEqual([])
    },
    { auto: true },
  ],
})

/** Signs in as a brand-new local user (needs DEV_LOGIN=true) and opens Home. */
export async function login(page: Page, prefix = 'user') {
  const user = `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  await page.goto('/login')
  await expect(page.getByText('Local dev login')).toBeVisible()
  await page.evaluate(async (u) => {
    await fetch('/api/auth/dev?u=' + u, { method: 'POST', redirect: 'manual' })
  }, user)
  await page.goto('/')
  await expect(page.getByText('Recently visited')).toBeVisible()
  return user
}

/** Creates the Work TODO list from Home and waits for today's section. */
export async function createTodoList(page: Page) {
  await page.getByText('Create your Work TODO list').click()
  await expect(page.locator('.todo-day.is-today')).toBeVisible()
}

/** Creates a page from the sidebar and types its title. */
export async function newPage(page: Page, title: string) {
  await page.locator('aside').getByText('New page').click()
  await expect(page.locator('main textarea')).toBeFocused()
  await page.keyboard.type(title)
}

/** A task's own text paragraph (not its parent's), found by its text. */
export function taskText(page: Page, task: string, scope = '.todo-day.is-today') {
  return page.locator(`${scope} li > div > p`).filter({ hasText: task }).first()
}

/** Puts the cursor at the end of a task's text. */
export async function cursorAtEnd(page: Page, task: string, scope = '.todo-day.is-today') {
  await taskText(page, task, scope).click({ position: { x: 4, y: 8 } })
  await page.keyboard.press('End')
}

/** The checkbox of a task. */
export function checkbox(page: Page, task: string, scope = '.todo-day.is-today') {
  return taskText(page, task, scope).locator('xpath=../../label/input')
}

/** Each task in a day as "state|text", in order (nested tasks included). */
export async function dayTasks(page: Page, date?: string) {
  const sel = date ? `.todo-day[data-date="${date}"]` : '.todo-day.is-today'
  return page.locator(`${sel} li`).evaluateAll((lis) =>
    lis.map((li) => {
      const state = (li.className.match(/task-(\w+)/) ?? [])[1] ?? 'open'
      const depth = li.parentElement?.closest('li') ? '  ' : ''
      // Skip the badges and buttons the TODO plugin adds (they aren't editable).
      const p = li.querySelector('p')
      const text = p ? [...p.childNodes].filter((n) => !(n instanceof HTMLElement && n.contentEditable === 'false')).map((n) => n.textContent).join('') : ''
      return `${depth}${state}|${text.trim()}`
    }),
  )
}
