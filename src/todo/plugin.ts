import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import { daysBetween, isoDate, shortDate } from '#/lib/dates'

export interface TaskMenuEvent {
  pageId: string
  pos: number
  rect: DOMRect
  attrs: Record<string, unknown>
  day: string | null
}

export const TASK_MENU_EVENT = 'gunita:task-menu'

function urgency(carry: number, since: string | null, today: string) {
  const age = since ? daysBetween(since, today) : carry
  const n = Math.max(carry, age)
  return n >= 7 ? 'u-red' : n >= 5 ? 'u-orange' : n >= 3 ? 'u-yellow' : 'u-gray'
}

/** A badge after a task's text ("carried 2×", "→ moved to Nov 21"…). Built only when drawn. */
function note(text: string, cls: string) {
  return {
    label: text,
    make: () => {
      const el = document.createElement('span')
      el.className = `task-note ${cls}`
      el.contentEditable = 'false'
      el.textContent = text
      // Clicking a badge keeps the caret in the text instead of moving it into the badge.
      el.addEventListener('mousedown', (e) => e.preventDefault())
      return el
    },
  }
}

/** Finds a task by id (or, without one, the task at `fallback`). */
function findTask(doc: PMNode, taskId: string | null, fallback: number): { node: PMNode; pos: number } | null {
  if (!taskId) {
    const node = doc.nodeAt(fallback)
    return node?.type.name === 'taskItem' ? { node, pos: fallback } : null
  }
  let found: { node: PMNode; pos: number } | null = null
  doc.descendants((node, pos) => {
    if (found) return false
    if (node.type.name === 'taskItem' && node.attrs.taskId === taskId) {
      found = { node, pos }
      return false
    }
    return true
  })
  return found
}

function dayOf(doc: PMNode, pos: number): string | null {
  const $pos = doc.resolve(pos)
  for (let d = $pos.depth; d > 0; d--) if ($pos.node(d).type.name === 'todoDay') return $pos.node(d).attrs.date as string
  return null
}

function build(doc: PMNode, pageId: string, getView: () => EditorView | null): DecorationSet {
  const today = isoDate()
  const decos: Decoration[] = []
  const walk = (node: PMNode, pos: number, day: string | null) => {
    node.forEach((child, off) => {
      const p = pos + off
      if (child.type.name === 'todoDay') {
        walk(child, p + 1, child.attrs.date as string)
        return
      }
      if (child.type.name === 'taskItem') {
        const a = child.attrs
        const status = a.status as string | null
        const cls = status ? `task-${status}` : a.checked ? 'task-done' : 'task-open'
        decos.push(Decoration.node(p, p + child.nodeSize, { class: cls }))
        const para = child.firstChild
        if (para) {
          const end = p + 1 + para.nodeSize - 1
          const widgets: { label: string; make: () => HTMLElement }[] = []
          if (status === 'moved' && a.movedTo) widgets.push(note(`→ moved to ${shortDate(a.movedTo as string)}`, 'n-moved'))
          else if (status === 'dropped') widgets.push(note('dropped', 'n-dropped'))
          else if (status === 'archived') widgets.push(note('not carried over', 'n-dropped'))
          else if (status === 'snoozed' && a.snoozeUntil) widgets.push(note(`snoozed until ${shortDate(a.snoozeUntil as string)}`, 'n-snoozed'))
          else if (!a.checked && Number(a.carry) > 0) {
            const since = (a.since as string) || null
            widgets.push(
              note(`carried ${a.carry}×${since ? ` · since ${shortDate(since)}` : ''}`, `n-carry ${urgency(Number(a.carry), since, today)}`),
            )
          }
          if (status !== 'moved') {
            widgets.push({
              label: '⋯',
              make: () => {
                const btn = document.createElement('button')
                btn.className = 'task-menu-btn'
                btn.contentEditable = 'false'
                btn.type = 'button'
                btn.setAttribute('aria-label', 'Task options')
                btn.textContent = '⋯'
                btn.addEventListener('mousedown', (e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  // Look the task up when clicked: its position and attributes may have changed since.
                  const view = getView()
                  const at = view ? findTask(view.state.doc, a.taskId as string | null, p) : null
                  if (!view || !at) return
                  window.dispatchEvent(
                    new CustomEvent<TaskMenuEvent>(TASK_MENU_EVENT, {
                      detail: { pageId, pos: at.pos, rect: btn.getBoundingClientRect(), attrs: { ...at.node.attrs }, day: dayOf(view.state.doc, at.pos) },
                    }),
                  )
                })
                return btn
              },
            })
          }
          // Keys don't include the position: typing above a task shifts it, and a
          // changed key would make the editor redraw every badge on the page.
          const id = (a.taskId as string) || `p${p}`
          widgets.forEach((w, i) =>
            decos.push(Decoration.widget(end, w.make, { side: 1 + i, ignoreSelection: true, key: `${id}:${i}:${w.label}` })),
          )
        }
        // Nested task lists inside the item
        child.forEach((gc, goff) => {
          if (gc.type.name === 'taskList') walk(gc, p + 1 + goff + 1, day)
        })
        return
      }
      if (!child.isTextblock && !child.isLeaf) walk(child, p + 1, day)
    })
  }
  walk(doc, 0, null)
  return DecorationSet.create(doc, decos)
}

/** Shows carry-over badges, moved/dropped/snoozed labels and the task "⋯" menu in TODO lists. */
export const TodoDecorations = Extension.create<{ pageId: string }>({
  name: 'todoDecorations',
  addOptions() {
    return { pageId: '' }
  },
  addProseMirrorPlugins() {
    const pageId = this.options.pageId
    const key = new PluginKey<DecorationSet>('todoDecorations')
    let current: EditorView | null = null
    const getView = () => current
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: (_, state) => build(state.doc, pageId, getView),
          apply: (tr, old) => (tr.docChanged ? build(tr.doc, pageId, getView) : old),
        },
        props: {
          decorations: (state) => key.getState(state),
        },
        view: (view) => {
          current = view
          return {
            destroy: () => {
              if (current === view) current = null
            },
          }
        },
      }),
    ]
  },
})
