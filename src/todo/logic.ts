import type { Editor, JSONContent } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Selection, type Transaction } from '@tiptap/pm/state'
import { getApp } from '#/lib/app'
import { newId } from '#/lib/ids'
import { isoDate, parseIso } from '#/lib/dates'
import type { PageMeta, Recurrence, TemplateItem, TodoSectionDef } from '#/lib/types'

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

/** A task for today's section, and which section of the day it goes in (null: no section). */
export interface Placed {
  item: JSONContent
  section: string | null
}

export interface CarryPlan {
  today: string
  alreadyStarted: boolean
  carried: Placed[]
  template: Placed[]
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
  const carried: Placed[] = []
  const seenTaskIds = new Map<string, string>()
  const known = new Set((page.sections ?? []).map((x) => x.id))
  const sectionOrNull = (id: unknown) => (typeof id === 'string' && known.has(id) ? id : null)

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

  // Finds the top-level task lists in a block (inside sections, callouts, …) and carries their tasks.
  const collect = (node: PMNode, contentStart: number, dayDate: string | null, section: string | null) => {
    node.forEach((child, off) => {
      const p = contentStart + off
      if (child.type.name === 'taskList') {
        child.forEach((item, ioff) => {
          if (item.type.name !== 'taskItem') return
          const j = carryItem(item, p + 1 + ioff, dayDate)
          if (j) carried.push({ item: j, section: sectionOrNull(section) })
        })
      } else if (child.type.name === 'todoSection') {
        collect(child, p + 1, dayDate, child.attrs.sectionId as string)
      } else if (!child.isTextblock && !child.isLeaf && child.type.name !== 'taskItem') {
        collect(child, p + 1, dayDate, section)
      }
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
      collect(node, pos + 1, date, null)
    } else if (node.type.name === 'taskList') {
      // Tasks outside any day (e.g. imported from Notion) are carried too.
      node.forEach((item, off) => {
        if (item.type.name !== 'taskItem') return
        const j = carryItem(item, pos + 1 + off, null)
        if (j) carried.push({ item: j, section: null })
      })
    } else if (!node.isTextblock && !node.isLeaf) {
      collect(node, pos + 1, null, node.type.name === 'todoSection' ? (node.attrs.sectionId as string) : null)
    }
  })
  if (insertPos < 0) insertPos = 0

  // Template items due today. If yesterday's copy is still open, it carries
  // over in the template's slot (keeping its "carried N×" count) instead of duplicating.
  const template: Placed[] = []
  const build = (items: TemplateItem[]): JSONContent[] =>
    items
      .filter((t) => dueOn(t.repeat, today) && t.text.trim())
      .map((t) => {
        const idx = carried.findIndex((c) => c.item.attrs?.templateId === t.id)
        if (idx >= 0) return carried.splice(idx, 1)[0].item
        return taskJson(t.text, { taskId: newId(), since: today, templateId: t.id }, build(t.children ?? []))
      })
  for (const t of page.template ?? []) {
    const [item] = build([t])
    if (item) template.push({ item, section: sectionOrNull(t.section) })
  }

  const inboxCount = getApp().ws.getSnapshot().inbox.filter((i) => i.listId === page.id || !i.listId).length
  return { today, alreadyStarted, carried, template, inboxCount, marks, insertPos }
}

export function isFirstList(pageId: string) {
  const lists = Object.values(getApp().ws.getSnapshot().pages)
    .filter((p) => p.kind === 'todo' && !p.trashedAt)
    .sort((a, b) => a.createdAt - b.createdAt)
  return lists[0]?.id === pageId
}

function emptyTask(today: string): JSONContent {
  return taskJson('', { taskId: newId(), since: today })
}

function sectionJson(def: Pick<TodoSectionDef, 'id' | 'name' | 'icon'>, content: JSONContent[]): JSONContent {
  return { type: 'todoSection', attrs: { sectionId: def.id, name: def.name, icon: def.icon }, content }
}

/** Today's content: tasks without a section first, then each section in the list's order. */
export function dayContent(placed: Placed[], sections: TodoSectionDef[], today: string): JSONContent[] {
  const out: JSONContent[] = []
  const loose = placed.filter((p) => !p.section).map((p) => p.item)
  if (loose.length) out.push({ type: 'taskList', content: loose })
  for (const def of sections) {
    const items = placed.filter((p) => p.section === def.id).map((p) => p.item)
    out.push(sectionJson(def, [{ type: 'taskList', content: items.length ? items : [emptyTask(today)] }]))
  }
  return out.length ? out : [{ type: 'paragraph' }]
}

/** The first section that counts for the report (where meeting action items go). */
export function workSection(page: PageMeta): string | null {
  return page.sections?.find((x) => x.report)?.id ?? null
}

/** Adds today's section: template items, everything unfinished from earlier days, and inbox items. */
export function startToday(editor: Editor, page: PageMeta): { started: boolean; carried: number; template: number; inbox: number } {
  repairDays(editor)
  const plan = planToday(editor, page)
  if (plan.alreadyStarted) return { started: false, carried: 0, template: 0, inbox: 0 }
  const inbox = getApp().ws.takeInbox(page.id, isFirstList(page.id))
  const inboxItems: Placed[] = inbox.map((i) => ({
    item: taskJson(i.text, { taskId: newId(), since: plan.today, source: i.sourceId ?? null }),
    // Action items from meetings are work; quick captures stay outside the sections.
    section: i.sourceId ? workSection(page) : null,
  }))
  const day: JSONContent = {
    type: 'todoDay',
    attrs: { date: plan.today },
    content: dayContent([...plan.template, ...plan.carried, ...inboxItems], page.sections ?? [], plan.today),
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

/** The id of the section a position is in, if any. */
export function sectionAt(doc: PMNode, pos: number): string | null {
  const $pos = doc.resolve(Math.min(pos, doc.content.size))
  for (let d = $pos.depth; d > 0; d--) if ($pos.node(d).type.name === 'todoSection') return $pos.node(d).attrs.sectionId as string
  return null
}

/** The day section a position is in. */
function dayAt(doc: PMNode, pos: number): { node: PMNode; pos: number } | null {
  const $pos = doc.resolve(Math.min(pos, doc.content.size))
  for (let d = $pos.depth; d > 0; d--) if ($pos.node(d).type.name === 'todoDay') return { node: $pos.node(d), pos: $pos.before(d) }
  return null
}

/** Where a task goes in a day: the end of a section's last list, or of the list outside sections. */
function listSlot(day: { node: PMNode; pos: number }, section: string | null): { pos: number; wrap: boolean } | null {
  let found: { pos: number; wrap: boolean } | null = null
  day.node.forEach((child, off) => {
    const p = day.pos + 1 + off
    if (section && child.type.name === 'todoSection' && child.attrs.sectionId === section) {
      found = { pos: p + child.nodeSize - 1, wrap: true }
      child.forEach((gc, goff) => {
        if (gc.type.name === 'taskList') found = { pos: p + 1 + goff + gc.nodeSize - 1, wrap: false }
      })
    } else if (!section && child.type.name === 'taskList') found = { pos: p + child.nodeSize - 1, wrap: false }
  })
  return found
}

/** Removes a task, and its list if it was the only task (leaving a blank line if the list was alone). */
function removeItem(tr: Transaction, pos: number, size: number) {
  const $pos = tr.doc.resolve(pos)
  const list = $pos.parent
  if (list.type.name === 'taskList' && list.childCount === 1) {
    const container = $pos.node($pos.depth - 1)
    if (container.childCount === 1) tr.replaceWith($pos.before(), $pos.after(), tr.doc.type.schema.nodes.paragraph.create())
    else tr.delete($pos.before(), $pos.after())
  } else tr.delete(pos, pos + size)
}

/** Puts a task at the end of a section (or outside sections) of a day, making the section if needed. */
function insertInDay(tr: Transaction, dayPos: number, item: PMNode, section: string | null, def?: Pick<TodoSectionDef, 'id' | 'name' | 'icon'>) {
  const schema = tr.doc.type.schema
  const day = { node: tr.doc.nodeAt(dayPos)!, pos: dayPos }
  const slot = listSlot(day, section)
  if (slot) {
    tr.insert(slot.pos, slot.wrap ? schema.nodes.taskList.create(null, item) : item)
    return
  }
  const list = schema.nodes.taskList.create(null, item)
  if (section) {
    const node = schema.nodes.todoSection.create({ sectionId: section, name: def?.name ?? '', icon: def?.icon ?? '' }, list)
    tr.insert(dayPos + day.node.nodeSize - 1, node)
  } else {
    // Tasks outside sections come first in the day.
    let hasSections = false
    day.node.forEach((c) => (hasSections ||= c.type.name === 'todoSection'))
    tr.insert(hasSections ? dayPos + 1 : dayPos + day.node.nodeSize - 1, list)
  }
}

/** Moves a task (with its sub-tasks) to another section of the same day. */
export function moveTaskToSection(editor: Editor, pos: number, section: string | null, page: PageMeta) {
  const node = itemAt(editor, pos)
  if (!node) return
  const day = dayAt(editor.state.doc, pos)
  if (!day) return
  const tr = editor.state.tr
  removeItem(tr, pos, node.nodeSize)
  const dayPos = tr.mapping.map(day.pos)
  insertInDay(tr, dayPos, node, section, page.sections?.find((x) => x.id === section))
  editor.view.dispatch(tr.scrollIntoView())
}

/**
 * Brings today's day in line with the list's sections: adds missing ones,
 * puts them in order, and unwraps removed ones. Optionally moves today's tasks
 * that aren't in a section into one.
 */
export function applySections(editor: Editor, sections: TodoSectionDef[], moveLooseTo: string | null = null) {
  const day = findDay(editor, isoDate())
  if (!day) return
  const json = day.node.toJSON() as JSONContent
  const keep: JSONContent[] = []
  const existing = new Map<string, JSONContent>()
  const loose: JSONContent[] = []
  const known = new Set(sections.map((x) => x.id))
  for (const child of json.content ?? []) {
    if (child.type === 'todoSection') {
      const id = child.attrs?.sectionId as string
      if (known.has(id) && !existing.has(id)) existing.set(id, child)
      else keep.push(...(child.content ?? [])) // removed (or duplicate) section: keep its tasks
    } else if (moveLooseTo && child.type === 'taskList') loose.push(...(child.content ?? []))
    else keep.push(child)
  }
  const out = moveLooseTo ? keep.filter((c) => !(c.type === 'paragraph' && !c.content?.length)) : keep
  for (const def of sections) {
    const node = existing.get(def.id) ?? sectionJson(def, [{ type: 'taskList', content: [emptyTask(day.node.attrs.date as string)] }])
    node.attrs = { ...node.attrs, name: def.name, icon: def.icon }
    if (def.id === moveLooseTo && loose.length) {
      const content = node.content ?? []
      const first = content.findIndex((c) => c.type === 'taskList')
      // Replace a lone blank task, else put the moved tasks first.
      const blank = first >= 0 && content[first].content?.length === 1 && !content[first].content?.[0].content?.[0]?.content?.length
      if (first >= 0) content[first] = { ...content[first], content: blank ? loose : [...loose, ...(content[first].content ?? [])] }
      else content.unshift({ type: 'taskList', content: loose })
      node.content = content
    }
    out.push(node)
  }
  const next = editor.state.schema.nodeFromJSON({ ...json, content: out.length ? out : [{ type: 'paragraph' }] })
  editor.view.dispatch(editor.state.tr.replaceWith(day.pos, day.pos + day.node.nodeSize, next))
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

/** Moves a task (with its sub-tasks) into another day, in the same section, creating the day if needed. */
export function moveTaskToDay(editor: Editor, pos: number, date: string) {
  const node = itemAt(editor, pos)
  if (!node) return
  const { schema } = editor.state
  const moved = node.type.create(
    { ...node.attrs, status: null, movedTo: null, snoozeUntil: null, since: node.attrs.since || isoDate() },
    node.content,
  )
  const section = sectionAt(editor.state.doc, pos)
  let def: { id: string; name: string; icon: string } | undefined
  if (section) {
    const $pos = editor.state.doc.resolve(pos)
    for (let d = $pos.depth; d > 0; d--) {
      const n = $pos.node(d)
      if (n.type.name === 'todoSection') def = { id: section, name: n.attrs.name as string, icon: n.attrs.icon as string }
    }
  }
  const tr = editor.state.tr
  removeItem(tr, pos, node.nodeSize)

  let dayPos = -1
  tr.doc.forEach((n, p) => {
    if (dayPos < 0 && n.type.name === 'todoDay' && n.attrs.date === date) dayPos = p
  })
  if (dayPos < 0) {
    const list = schema.nodes.taskList.create(null, [moved])
    const content = section ? schema.nodes.todoSection.create({ sectionId: section, name: def?.name ?? '', icon: def?.icon ?? '' }, list) : list
    const created = schema.nodes.todoDay.create({ date }, [content])
    if (date === SOMEDAY) tr.insert(tr.doc.content.size, created)
    else {
      let at = -1
      tr.doc.forEach((n, p) => {
        if (at < 0 && n.type.name === 'todoDay' && n.attrs.date !== SOMEDAY && n.attrs.date < date) at = p
      })
      if (at < 0) at = 0
      tr.insert(at, created)
    }
  } else insertInDay(tr, dayPos, moved, section, def)
  editor.view.dispatch(tr)
}

/**
 * Adds a task at the end of today's list (used for AI suggestions and inbox items).
 * It goes in `section` if given, else the section the cursor is in, else the list outside sections.
 */
export function appendTaskToday(editor: Editor, text: string, attrs: Record<string, unknown> = {}, section?: string | null) {
  const day = findDay(editor, isoDate())
  if (!day) return false
  const { schema } = editor.state
  const item = schema.nodes.taskItem.create(
    { checked: false, taskId: newId(), since: isoDate(), ...attrs },
    schema.nodes.paragraph.create(null, text ? schema.text(text) : null),
  )
  const sel = editor.state.selection.from
  const inToday = sel > day.pos && sel < day.pos + day.node.nodeSize
  let target = section !== undefined ? section : inToday ? sectionAt(editor.state.doc, sel) : null
  // No list outside sections: use the first section.
  if (!target && !listSlot(day, null)) {
    day.node.forEach((c) => {
      if (!target && c.type.name === 'todoSection') target = c.attrs.sectionId as string
    })
  }
  const slot = listSlot(day, target)
  const tr = editor.state.tr
  if (slot && !slot.wrap) {
    // Reuse a trailing empty task instead of leaving a blank line above the new one.
    const $end = tr.doc.resolve(slot.pos)
    const last = $end.parent.lastChild
    if (last && last.textContent === '' && last.childCount === 1) tr.replaceWith(slot.pos - last.nodeSize, slot.pos, item)
    else tr.insert(slot.pos, item)
  } else insertInDay(tr, day.pos, item, target)
  editor.view.dispatch(tr)
  return true
}
