import type { JSONContent } from '@tiptap/core'
import { getApp } from './app'
import { isoDate, parseIso, addDays } from './dates'
import { writePageDoc } from './editorSchema'
import type { PageMeta, ReportSettings } from './types'
import { postJson } from '#/ai/client'

export const DEFAULT_REPORT: ReportSettings = {
  auto: true,
  heading: 'CERTIFICATE OF WORK ACCOMPLISHMENT',
  intro:
    'This is to certify that I have performed the following tasks stipulated in my contract of services as [your position] for the period {period}, except on the following day/s: {absences}',
  skipRoutine: true,
  grouping: 'ai',
}

export function reportSettings(page: PageMeta | undefined): ReportSettings {
  return { ...DEFAULT_REPORT, ...(page?.report ?? {}) }
}

// ---------- Periods (1–15 and 16–end of month, like CWA cut-offs) ----------

export interface Period {
  from: string
  to: string
  label: string // "November 1-15, 2026"
  short: string // "Nov 1–15, 2026"
}

function lastDayOfMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate()
}

export function makePeriod(from: string, to: string): Period {
  const a = parseIso(from)
  const b = parseIso(to)
  const month = (d: Date, style: 'long' | 'short') => d.toLocaleDateString('en-US', { month: style })
  const sameMonth = a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
  const label = sameMonth
    ? `${month(a, 'long')} ${a.getDate()}-${b.getDate()}, ${b.getFullYear()}`
    : `${month(a, 'long')} ${a.getDate()}, ${a.getFullYear()} - ${month(b, 'long')} ${b.getDate()}, ${b.getFullYear()}`
  const short = sameMonth
    ? `${month(a, 'short')} ${a.getDate()}–${b.getDate()}, ${b.getFullYear()}`
    : `${month(a, 'short')} ${a.getDate()} – ${month(b, 'short')} ${b.getDate()}, ${b.getFullYear()}`
  return { from, to, label, short }
}

/** The half-month period that contains `date`. */
export function periodOf(date: string): Period {
  const d = parseIso(date)
  const y = d.getFullYear()
  const m = d.getMonth()
  if (d.getDate() <= 15) return makePeriod(isoDate(new Date(y, m, 1)), isoDate(new Date(y, m, 15)))
  return makePeriod(isoDate(new Date(y, m, 16)), isoDate(new Date(y, m, lastDayOfMonth(y, m))))
}

export function previousPeriod(p: Period): Period {
  return periodOf(addDays(p.from, -1))
}

/** The period whose report is due: today's if today is the 15th or month end, else the last finished one. */
export function duePeriod(today = isoDate()): Period {
  const cur = periodOf(today)
  return today === cur.to ? cur : previousPeriod(cur)
}

export function monthPeriod(date: string): Period {
  const d = parseIso(date)
  return makePeriod(isoDate(new Date(d.getFullYear(), d.getMonth(), 1)), isoDate(new Date(d.getFullYear(), d.getMonth(), lastDayOfMonth(d.getFullYear(), d.getMonth()))))
}

// ---------- Collecting finished work ----------

export interface DoneItem {
  day: string
  text: string
  parent: string | null
  routine: boolean
}

/** Checked tasks in the period, with the task they're nested under (their project). */
export async function collectDone(listId: string, period: Period, skipRoutine: boolean): Promise<DoneItem[]> {
  const { index } = getApp()
  await index.reindex(listId)
  const tasks = index.get(listId)?.tasks ?? []
  const out: DoneItem[] = []
  const stack: string[] = []
  for (const t of tasks) {
    stack.length = Math.min(stack.length, t.depth)
    stack[t.depth] = t.text
    if (!t.day || t.day < period.from || t.day > period.to) continue
    if (!t.checked || t.status === 'moved' || !t.text.trim()) continue
    const routine = !!t.templateId
    if (routine && skipRoutine) continue
    out.push({ day: t.day, text: t.text.trim(), parent: t.depth > 0 ? (stack[t.depth - 1] ?? null) : null, routine })
  }
  return out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
}

/** Weekdays in the period (up to today) with no finished work, e.g. "November 3 and 10". */
export function absences(listId: string, period: Period): string {
  const { index } = getApp()
  const tasks = index.get(listId)?.tasks ?? []
  const worked = new Set(tasks.filter((t) => t.checked && t.day).map((t) => t.day!))
  const last = period.to < isoDate() ? period.to : isoDate()
  // Don't count days before you started using this list.
  const firstDay = [...(index.get(listId)?.days ?? [])].filter((d) => /^\d{4}-/.test(d)).sort()[0]
  const start = firstDay && firstDay > period.from ? firstDay : period.from
  const missing: string[] = []
  for (let d = start; d <= last; d = addDays(d, 1)) {
    const dow = parseIso(d).getDay()
    if (dow !== 0 && dow !== 6 && !worked.has(d)) missing.push(d)
  }
  if (!missing.length) return 'N/A'
  const days = missing.map((d) => parseIso(d))
  const month = days[0].toLocaleDateString('en-US', { month: 'long' })
  const allSameMonth = days.every((d) => d.getMonth() === days[0].getMonth())
  if (allSameMonth) {
    const nums = days.map((d) => String(d.getDate()))
    return `${month} ${nums.length > 1 ? nums.slice(0, -1).join(', ') + ' and ' + nums.at(-1) : nums[0]}`
  }
  return days.map((d) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })).join(', ')
}

export interface ReportGroup {
  title: string
  items: string[]
}

/** Groups by the task each item is nested under; standalone tasks go under "Other tasks". */
export function groupByParent(items: DoneItem[]): ReportGroup[] {
  const groups = new Map<string, Set<string>>()
  const add = (k: string, v: string) => {
    if (!groups.has(k)) groups.set(k, new Set())
    groups.get(k)!.add(v)
  }
  const parents = new Set(items.map((i) => i.parent).filter(Boolean) as string[])
  for (const i of items) {
    if (i.parent) add(i.parent, i.text)
    else if (!parents.has(i.text)) add('Other tasks', i.text)
  }
  const out = [...groups.entries()].map(([title, set]) => ({ title, items: [...set] }))
  return out.sort((a, b) => (a.title === 'Other tasks' ? 1 : b.title === 'Other tasks' ? -1 : 0))
}

export function groupByDay(items: DoneItem[]): ReportGroup[] {
  const groups = new Map<string, string[]>()
  for (const i of items) {
    const label = parseIso(i.day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    if (!groups.has(label)) groups.set(label, [])
    if (!groups.get(label)!.includes(i.text)) groups.get(label)!.push(i.text)
  }
  return [...groups.entries()].map(([title, its]) => ({ title, items: its }))
}

// ---------- The report page ----------

function introContent(intro: string, period: Period, absent: string): JSONContent[] {
  const parts = intro.split(/(\{period\}|\{absences\})/)
  return parts
    .filter(Boolean)
    .map((p) =>
      p === '{period}'
        ? { type: 'text', text: period.label, marks: [{ type: 'bold' }] }
        : p === '{absences}'
          ? { type: 'text', text: absent }
          : { type: 'text', text: p },
    )
}

export function reportDoc(settings: ReportSettings, period: Period, absent: string, groups: ReportGroup[]): JSONContent {
  const content: JSONContent[] = [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: settings.heading || 'Accomplishment report' }] },
    { type: 'paragraph', content: introContent(settings.intro, period, absent) },
  ]
  if (!groups.length) content.push({ type: 'paragraph', content: [{ type: 'text', text: 'No completed tasks in this period yet.', marks: [{ type: 'italic' }] }] })
  for (const g of groups) {
    content.push({ type: 'paragraph', content: [{ type: 'text', text: g.title, marks: [{ type: 'bold' }] }] })
    content.push({
      type: 'bulletList',
      content: g.items.map((t) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })),
    })
  }
  return { type: 'doc', content }
}

function reportsFolder(list: PageMeta): string {
  const { ws } = getApp()
  const existing = ws.children(list.id).find((p) => p.title === 'Accomplishment reports')
  return existing?.id ?? ws.createPage({ parentId: list.id, title: 'Accomplishment reports', icon: '🗂️' })
}

export function findReportPage(listId: string, period: Period): PageMeta | undefined {
  return Object.values(getApp().ws.getSnapshot().pages).find(
    (p) => !p.trashedAt && p.reportFor?.listId === listId && p.reportFor.from === period.from && p.reportFor.to === period.to,
  )
}

/**
 * Builds (or rebuilds) the report page for a list and period. With AI grouping,
 * Claude rewrites the tasks as accomplishments grouped by project.
 */
export async function generateReport(listId: string, period: Period, opts: { useAi?: boolean } = {}): Promise<{ pageId: string; count: number; usedAi: boolean }> {
  const { ws, config } = getApp()
  const list = ws.page(listId)
  if (!list) throw new Error('That TODO list no longer exists.')
  const settings = reportSettings(list)
  const done = await collectDone(listId, period, settings.skipRoutine)
  const absent = absences(listId, period)
  let groups: ReportGroup[]
  let usedAi = false
  const wantAi = (opts.useAi ?? true) && settings.grouping === 'ai' && config?.claudeConfigured && navigator.onLine && done.length > 0
  if (wantAi) {
    try {
      const r = await postJson<{ groups: ReportGroup[] }>('/api/ai/report', {
        period: period.label,
        tasks: done.map((d) => ({ day: d.day, text: d.text, parent: d.parent })),
      })
      groups = r.groups.filter((g) => g.items.length)
      usedAi = true
    } catch {
      groups = groupByParent(done)
    }
  } else groups = settings.grouping === 'day' ? groupByDay(done) : groupByParent(done)

  const existing = findReportPage(listId, period)
  const pageId =
    existing?.id ??
    ws.createPage({
      parentId: reportsFolder(list),
      title: period.short,
      icon: '📝',
      reportFor: { listId, from: period.from, to: period.to },
    })
  await writePageDoc(pageId, reportDoc(settings, period, absent, groups))
  ws.touch(pageId)
  return { pageId, count: done.length, usedAi }
}

let running = false

/**
 * On the 15th and the last day of the month (or the first time Gunita opens
 * after), drafts each TODO list's report once. Returns drafts made.
 */
export async function autoDraftReports(): Promise<{ listId: string; pageId: string; period: Period }[]> {
  if (running) return []
  running = true
  try {
    const { ws, index } = getApp()
    await index.ready
    const period = duePeriod()
    const made: { listId: string; pageId: string; period: Period }[] = []
    const lists = Object.values(ws.getSnapshot().pages).filter((p) => p.kind === 'todo' && !p.trashedAt)
    for (const list of lists) {
      const settings = reportSettings(list)
      if (!settings.auto || settings.lastAuto === period.from || findReportPage(list.id, period)) continue
      // Only lists that were actually used during the period.
      const days = index.get(list.id)?.days ?? []
      if (!days.some((d) => d >= period.from && d <= period.to)) continue
      const r = await generateReport(list.id, period)
      ws.updatePage(list.id, { report: { ...settings, lastAuto: period.from } })
      made.push({ listId: list.id, pageId: r.pageId, period })
    }
    return made
  } finally {
    running = false
  }
}

// ---------- Copying into Google Docs ----------

/** Copies the report as rich text (bold, bullets) for Google Docs/Word, plus a plain-text version. */
export async function copyRich(html: string, text: string) {
  const clean = html.replace(/ data-[a-z-]+="[^"]*"/g, '').replace(/ class="[^"]*"/g, '')
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([`<div style="font-family: Arial, sans-serif">${clean}</div>`], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      }),
    ])
  } else await navigator.clipboard.writeText(text)
}
