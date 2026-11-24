import type { Editor, JSONContent } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Selection } from '@tiptap/pm/state'
import { getApp } from '#/lib/app'
import { newId } from '#/lib/ids'
import { isoDate, parseIso } from '#/lib/dates'
import type { PageMeta, Recurrence, TemplateItem } from '#/lib/types'

export const SOMEDAY = 'someday'

/** Is this template item due on `date`? Daily items repeat every day, weekends included. */
export function dueOn(rec: Recurrence, date: string): boolean {
  const d = parseIso(date)
  if (rec.kind === 'daily') return true
  if (rec.kind === 'weekdays') return rec.days.includes(d.getDay())
  if (rec.kind === 'monthly') return d.getDate() === rec.day
  return false
}

interface Mark {
  pos: number
  attrs: Record<string, unknown>
}

export interface CarryPlan {
  today: string
  alreadyStarted: boolean
  carried: JSONContent[]
  template: JSONContent[]
  inboxCount: number
  marks: Mark[]
  insertPos: number
}

function isOpen(item: PMNode, today: string) {
  if (item.attrs.checked) return false
  const s = item.attrs.status as string | null
  if (s === 'moved' || s === 'dropped' || s === 'someday' || s === 'archived') return false
  if (s === 'snoozed' && item.attrs.snoozeUntil && String(item.attrs.snoozeUntil) > today) return false
  return true
}

function taskJson(text: string, attrs: Record<string, unknown>, children: JSONContent[] = []): JSONContent {
  return {
    type: 'taskItem',
    attrs: { checked: false, ...attrs },
    content: [
      { type: 'paragraph', content: text ? [{ type: 'text', text }] : [] },
      ...(children.length ? [{ type: 'taskList', content: children }] : []),
    ],
  }
}

/**
 * Works out what Start Today would do without changing anything:
 * which unfinished tasks get carried (from every previous day, not just yesterday),
 * which template items are due, and where the new day goes.
 */
export function planToday(editor: Editor, page: PageMeta): CarryPlan {
  const today = isoDate()
  const doc = editor.state.doc
  let alreadyStarted = false
  let insertPos = -1
  const marks: Mark[] = []
  const carried: JSONContent[] = []
  const seenTaskIds = new Map<string, string>()

  const carryItem = (item: PMNode, pos: number, dayDate: string | null): JSONContent | null => {
    if (!isOpen(item, today)) return null
    const text = item.firstChild?.textContent.trim() ?? ''
    let taskId = (item.attrs.taskId as string) || newId()
    // The same task open on two days (e.g. after an offline merge) is carried once.
    // A different task that happens to share an id (pasted) gets its own id.
    if (seenTaskIds.has(taskId)) {
      if (seenTaskIds.get(taskId) === text) {
        marks.push({ pos, attrs: { ...item.attrs, status: 'moved', movedTo: today, snoozeUntil: null } })
        return null
      }
      taskId = newId()
    }
    seenTaskIds.set(taskId, text)
    const markIndex = marks.length
    marks.push({ pos, attrs: { ...item.attrs, taskId, status: 'moved', movedTo: today, snoozeUntil: null } })
    const content: JSONContent[] = []
    item.forEach((child, off) => {
      if (child.type.name === 'taskList') {
        const kids: JSONContent[] = []
        child.forEach((gc, goff) => {
          const j = gc.type.name === 'taskItem' ? carryItem(gc, pos + 1 + off + 1 + goff, dayDate) : null
          if (j) kids.push(j)
        })
        if (kids.length) content.push({ type: 'taskList', content: kids })
      } else {
        content.push(child.toJSON())
      }
    })
    // An empty task (a leftover blank checkbox) with nothing open under it isn't worth carrying.
    if (!text && !content.some((c) => c.type === 'taskList')) {
      marks.splice(markIndex, 1)
      seenTaskIds.delete(taskId)
      return null
    }
    return {
      type: 'taskItem',
      attrs: {
        checked: false,
        taskId,
        since: (item.attrs.since as string) || dayDate || today,
        carry: (Number(item.attrs.carry) || 0) + 1,
        templateId: item.attrs.templateId ?? null,
        source: item.attrs.source ?? null,
      },
      content,
    }
  }

  const collectLists = (node: PMNode, nodePos: number, dayDate: string | null) => {
    node.descendants((child, rel, parent) => {
      if (child.type.name === 'taskList' && parent?.type.name !== 'taskItem') {
        const listPos = nodePos + 1 + rel
        child.forEach((item, off) => {
          if (item.type.name !== 'taskItem') return
          const j = carryItem(item, listPos + 1 + off, dayDate)
          if (j) carried.push(j)
        })
        return false
      }
      return child.type.name !== 'taskItem'
    })
  }

  doc.forEach((node, pos) => {
    if (node.type.name === 'todoDay') {
      const date = node.attrs.date as string
      if (insertPos < 0 && date !== SOMEDAY) insertPos = pos
      if (date === today) {
        alreadyStarted = true
        return
      }
      if (date === SOMEDAY || date > today) return
      collectLists(node, pos, date)
    } else if (node.type.name === 'taskList') {
      // Tasks outside any day (e.g. imported from Notion) are carried too.
      node.forEach((item, off) => {
        if (item.type.name !== 'taskItem') return
        const j = carryItem(item, pos + 1 + off, null)
        if (j) carried.push(j)
      })
    } else if (node.type.name !== 'todoDay') {
      collectLists(node, pos, null)
    }
  })
  if (insertPos < 0) insertPos = 0

  // Template items due today. If yesterday's copy is still open, it carries
  // over in the template's slot (keeping its "carried N×" count) instead of duplicating.
  const template: JSONContent[] = []
  const build = (items: TemplateItem[]): JSONContent[] =>
    items
      .filter((t) => dueOn(t.repeat, today) && t.text.trim())
      .map((t) => {
        const idx = carried.findIndex((c) => c.attrs?.templateId === t.id)
        if (idx >= 0) return carried.splice(idx, 1)[0]
        return taskJson(t.text, { taskId: newId(), since: today, templateId: t.id }, build(t.children ?? []))
      })
  template.push(...build(page.template ?? []))

  const inboxCount = getApp().ws.getSnapshot().inbox.filter((i) => i.listId === page.id || !i.listId).length
  return { today, alreadyStarted, carried, template, inboxCount, marks, insertPos }
}

export function isFirstList(pageId: string) {
  const lists = Object.values(getApp().ws.getSnapshot().pages)
    .filter((p) => p.kind === 'todo' && !p.trashedAt)
    .sort((a, b) => a.createdAt - b.createdAt)
  return lists[0]?.id === pageId
}

/** Adds today's section: template items, everything unfinished from earlier days, and inbox items. */
export function startToday(editor: Editor, page: PageMeta): { started: boolean; carried: number; template: number; inbox: number } {
  repairDays(editor)
  const plan = planToday(editor, page)
  if (plan.alreadyStarted) return { started: false, carried: 0, template: 0, inbox: 0 }
  const inbox = getApp().ws.takeInbox(page.id, isFirstList(page.id))
  const inboxItems = inbox.map((i) => taskJson(i.text, { taskId: newId(), since: plan.today, source: i.sourceId ?? null }))
  const items = [...plan.template, ...plan.carried, ...inboxItems]
  const day: JSONContent = {
    type: 'todoDay',
    attrs: { date: plan.today },
    content: items.length ? [{ type: 'taskList', content: items }] : [{ type: 'paragraph' }],
  }
  const { state, view } = editor
  const tr = state.tr
  for (const m of plan.marks) tr.setNodeMarkup(m.pos, undefined, m.attrs)
  tr.insert(plan.insertPos, state.schema.nodeFromJSON(day))
  tr.setMeta('addToHistory', true)
  view.dispatch(tr)
  getApp().ws.touch(page.id)
  // Put the cursor at the end of today's list so you can keep typing tasks.
  requestAnimationFrame(() => focusToday(editor))
  return { started: true, carried: plan.carried.length, template: plan.template.length, inbox: inboxItems.length }
}

export function findDay(editor: Editor, date: string): { node: PMNode; pos: number } | null {
  let found: { node: PMNode; pos: number } | null = null
  editor.state.doc.forEach((node, pos) => {
    if (!found && node.type.name === 'todoDay' && node.attrs.date === date) found = { node, pos }
  })
  return found
}

export function focusToday(editor: Editor) {
  const day = findDay(editor, isoDate())
  if (!day) return
  const $end = editor.state.doc.resolve(day.pos + day.node.nodeSize - 1)
  editor.view.dispatch(editor.state.tr.setSelection(Selection.near($end, -1)))
  editor.view.focus()
  const dom = editor.view.nodeDOM(day.pos) as HTMLElement | null
  dom?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/**
 * Merges duplicate day sections. Two devices can both start the same day while
 * offline; after they sync, the second copy is folded into the first.
 */
export function repairDays(editor: Editor) {
  const seen = new Map<string, { pos: number; node: PMNode }>()
  const dupes: { pos: number; node: PMNode; into: string }[] = []
  editor.state.doc.forEach((node, pos) => {
    if (node.type.name !== 'todoDay') return
    const d = node.attrs.date as string
    if (seen.has(d)) dupes.push({ pos, node, into: d })
    else seen.set(d, { pos, node })
  })
  if (!dupes.length) return
  const tr = editor.state.tr
  // Work from the bottom up so positions stay valid.
  for (const dup of dupes.reverse()) {
    const target = seen.get(dup.into)!
    const existingIds = new Set<string>()
    target.node.descendants((n) => {
      if (n.type.name === 'taskItem' && n.attrs.taskId) existingIds.add(n.attrs.taskId as string)
    })
    const extra: PMNode[] = []
    dup.node.forEach((child) => {
      if (child.type.name === 'taskList') {
        const items: PMNode[] = []
        child.forEach((it) => {
          if (!it.attrs.taskId || !existingIds.has(it.attrs.taskId as string)) items.push(it)
        })
        if (items.length) extra.push(child.type.create(child.attrs, items))
      } else if (child.textContent.trim()) extra.push(child)
    })
    tr.delete(tr.mapping.map(dup.pos), tr.mapping.map(dup.pos + dup.node.nodeSize))
    if (extra.length) tr.insert(tr.mapping.map(target.pos + target.node.nodeSize - 1), extra)
  }
  editor.view.dispatch(tr)
}

// ---------- Task actions ----------

function itemAt(editor: Editor, pos: number): PMNode | null {
  const node = editor.state.doc.nodeAt(pos)
  return node?.type.name === 'taskItem' ? node : null
}

export function setTaskAttrs(editor: Editor, pos: number, patch: Record<string, unknown>) {
  const node = itemAt(editor, pos)
  if (!node) return
  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...patch }))
}

export function dropTask(editor: Editor, pos: number) {
  setTaskAttrs(editor, pos, { status: 'dropped' })
}

export function restoreTask(editor: Editor, pos: number) {
  setTaskAttrs(editor, pos, { status: null, movedTo: null, snoozeUntil: null })
}

export function snoozeTask(editor: Editor, pos: number, until: string) {
  setTaskAttrs(editor, pos, { status: 'snoozed', snoozeUntil: until })
}

/** Moves a task (with its sub-tasks) into another day section, creating the section if needed. */
export function moveTaskToDay(editor: Editor, pos: number, date: string) {
  const node = itemAt(editor, pos)
  if (!node) return
  const { schema } = editor.state
  const moved = node.type.create(
    { ...node.attrs, status: null, movedTo: null, snoozeUntil: null, since: node.attrs.since || isoDate() },
    node.content,
  )
  let tr = editor.state.tr
  // Remove the item; if its list becomes empty, remove the list too.
  const $pos = tr.doc.resolve(pos)
  const list = $pos.parent
  if (list.type.name === 'taskList' && list.childCount === 1) {
    tr = tr.delete($pos.before(), $pos.after())
  } else tr = tr.delete(pos, pos + node.nodeSize)

  let day: { node: PMNode; pos: number } | null = null
  tr.doc.forEach((n, p) => {
    if (!day && n.type.name === 'todoDay' && n.attrs.date === date) day = { node: n, pos: p }
  })
  if (!day) {
    const section = schema.nodes.todoDay.create({ date }, [schema.nodes.taskList.create(null, [moved])])
    if (date === SOMEDAY) tr.insert(tr.doc.content.size, section)
    else {
      let at = -1
      tr.doc.forEach((n, p) => {
        if (at < 0 && n.type.name === 'todoDay' && n.attrs.date !== SOMEDAY && n.attrs.date < date) at = p
      })
      if (at < 0) at = 0
      tr.insert(at, section)
    }
  } else {
    const d = day as { node: PMNode; pos: number }
    let lastList: { node: PMNode; pos: number } | null = null
    d.node.forEach((child, off) => {
      if (child.type.name === 'taskList') lastList = { node: child, pos: d.pos + 1 + off }
    })
    if (lastList) {
      const l = lastList as { node: PMNode; pos: number }
      tr.insert(l.pos + l.node.nodeSize - 1, moved)
    } else tr.insert(d.pos + d.node.nodeSize - 1, schema.nodes.taskList.create(null, [moved]))
  }
  editor.view.dispatch(tr)
}

/** Adds a task at the end of today's list (used when accepting AI suggestions). */
export function appendTaskToday(editor: Editor, text: string, attrs: Record<string, unknown> = {}) {
  const day = findDay(editor, isoDate())
  if (!day) return false
  const { schema } = editor.state
  const item = schema.nodes.taskItem.create(
    { checked: false, taskId: newId(), since: isoDate(), ...attrs },
    schema.nodes.paragraph.create(null, text ? schema.text(text) : null),
  )
  let lastList: { node: PMNode; pos: number } | null = null
  day.node.forEach((child, off) => {
    if (child.type.name === 'taskList') lastList = { node: child, pos: day.pos + 1 + off }
  })
  const tr = editor.state.tr
  if (lastList) {
    const l = lastList as { node: PMNode; pos: number }
    // Reuse a trailing empty task instead of leaving a blank line above the new one.
    const last = l.node.lastChild
    if (last && last.textContent === '' && last.childCount === 1) {
      const lastPos = l.pos + l.node.nodeSize - 1 - last.nodeSize
      tr.replaceWith(lastPos, lastPos + last.nodeSize, item)
    } else tr.insert(l.pos + l.node.nodeSize - 1, item)
  } else tr.insert(day.pos + day.node.nodeSize - 1, schema.nodes.taskList.create(null, [item]))
  editor.view.dispatch(tr)
  return true
}

// ---------- Accomplishment report ----------

export interface DoneTask {
  day: string
  text: string
  depth: number
}

export function doneTasks(editor: Editor, from: string, to: string): DoneTask[] {
  const out: DoneTask[] = []
  editor.state.doc.forEach((node) => {
    if (node.type.name !== 'todoDay') return
    const day = node.attrs.date as string
    if (day === SOMEDAY || day < from || day > to) return
    const walk = (n: PMNode, depth: number) => {
      n.forEach((c) => {
        if (c.type.name === 'taskItem') {
          if (c.attrs.checked) out.push({ day, text: c.firstChild?.textContent.trim() ?? '', depth })
          c.forEach((cc) => cc.type.name === 'taskList' && walk(cc, depth + 1))
        } else if (c.type.name === 'taskList' || !c.isTextblock) walk(c, depth)
      })
    }
    walk(node, 0)
  })
  return out.filter((t) => t.text).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
}
