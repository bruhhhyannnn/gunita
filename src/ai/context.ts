import type { Editor } from '@tiptap/react'
import { getApp } from '#/lib/app'
import { addDays, isoDate } from '#/lib/dates'
import type { PlanBody } from '#/routes/api/ai/plan'
import { findDay } from '#/todo/logic'

/** Gathers what the daily planner needs, from this device's copy of your notes. */
export function buildPlanContext(editor: Editor, pageId: string): PlanBody {
  const { ws, index } = getApp()
  const snap = ws.getSnapshot()
  const today = isoDate()
  const weekday = new Date().toLocaleDateString('en-US', { weekday: 'long' })
  const dow = new Date().getDay()

  const todayTasks: string[] = []
  const carried: PlanBody['carried'] = []
  const day = findDay(editor, today)
  day?.node.descendants((n) => {
    if (n.type.name === 'taskItem') {
      const text = n.firstChild?.textContent.trim() ?? ''
      if (text) todayTasks.push(text)
      if (text && !n.attrs.checked && Number(n.attrs.carry) > 0) carried.push({ text, carry: Number(n.attrs.carry), since: n.attrs.since ?? undefined })
    }
    return true
  })

  const twoWeeksAgo = addDays(today, -14)
  const recentDone: PlanBody['recentDone'] = []
  const habitCount = new Map<string, { text: string; count: number; onThisWeekday: number }>()
  const deadlines: PlanBody['deadlines'] = []
  const actionItems: PlanBody['actionItems'] = []
  const horizon = addDays(today, 10)

  for (const entry of index.all()) {
    const page = snap.pages[entry.id]
    if (!page || !ws.aiVisible(entry.id)) continue
    if (page.kind === 'todo') {
      for (const t of entry.tasks) {
        if (!t.day || !t.text || t.status === 'moved') continue
        if (t.checked && t.day >= twoWeeksAgo && t.day < today && entry.id === pageId) recentDone.push({ day: t.day, text: t.text })
        const k = t.text.toLowerCase()
        const h = habitCount.get(k) ?? { text: t.text, count: 0, onThisWeekday: 0 }
        h.count++
        if (new Date(t.day + 'T12:00:00').getDay() === dow) h.onThisWeekday++
        habitCount.set(k, h)
      }
    }
    if (page.kind === 'meeting') {
      for (const t of entry.tasks) if (!t.checked && !t.status && t.text) actionItems.push({ text: t.text, source: page.title || 'Meeting' })
    }
    for (const d of entry.dates) {
      if (d < today || d > horizon) continue
      const line = entry.text.split('\n').find((l) => l.includes(d))
      if (line) deadlines.push({ date: d, text: line.replace(d, '').trim().slice(0, 200), page: page.title || 'Untitled' })
    }
  }
  const habits = [...habitCount.values()].filter((h) => h.count >= 2).sort((a, b) => b.onThisWeekday - a.onThisWeekday || b.count - a.count).slice(0, 20)
  const memory = Object.values(snap.memory)
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt)
    .slice(0, 30)
    .map((m) => m.text)

  return {
    date: today,
    weekday,
    listTitle: snap.pages[pageId]?.title || 'TODO',
    todayTasks,
    carried,
    recentDone: recentDone.sort((a, b) => (a.day < b.day ? -1 : 1)),
    habits,
    deadlines: deadlines.slice(0, 30),
    actionItems: actionItems.slice(0, 30),
    memory,
    tzOffset: new Date().getTimezoneOffset(),
  }
}
