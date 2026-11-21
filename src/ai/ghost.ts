import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { getApp } from '#/lib/app'
import { isoDate } from '#/lib/dates'
import { nextPlanSuggestion, takePlanSuggestion } from './planStore'
import { postJson } from './client'

interface GhostState {
  text: string | null
  pos: number
  /** 'plan' suggestions come from the daily plan; 'complete' from the autocomplete API. */
  from: 'plan' | 'complete' | null
}

const key = new PluginKey<GhostState>('ghostText')
const EMPTY: GhostState = { text: null, pos: 0, from: null }

function ghostEnabled(pageId: string, kind: string) {
  const { ws, config } = getApp()
  const s = ws.getSnapshot().settings
  if (s.ghostText === false) return false
  if (kind === 'todo' && s.ghostTextInTodo === false) return false
  if (!ws.aiVisible(pageId)) return false
  const model = s.completionModel ?? 'claude-opus-5-5'
  if (config && model !== 'workers-ai' && !config.claudeConfigured) return false
  if (config && model === 'workers-ai' && !config.workersAiConfigured) return false
  return navigator.onLine
}

/** If the cursor sits in an empty task inside today's section of a TODO list, returns true. */
function inEmptyTodayTask(state: EditorState): boolean {
  const { $from } = state.selection
  if ($from.parent.textContent.length) return false
  let task = false
  let today = false
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d)
    if (n.type.name === 'taskItem') task = true
    if (n.type.name === 'todoDay') today = n.attrs.date === isoDate()
  }
  return task && today
}

function context(state: EditorState) {
  const { from } = state.selection
  const before = state.doc.textBetween(Math.max(0, from - 3000), from, '\n', ' ')
  const after = state.doc.textBetween(from, Math.min(state.doc.content.size, from + 400), '\n', ' ')
  return { before, after }
}

/**
 * Gray "ghost" suggestions while typing. Tab accepts (only when a suggestion
 * is showing, otherwise Tab still indents), Esc dismisses.
 */
export const GhostText = Extension.create<{ pageId: string; kind: string }>({
  name: 'ghostText',
  priority: 1000,
  addOptions() {
    return { pageId: '', kind: 'page' }
  },

  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        const g = key.getState(editor.state)
        if (!g?.text || editor.state.selection.from !== g.pos) return false
        const text = g.text
        if (g.from === 'plan') takePlanSuggestion(this.options.pageId)
        editor.view.dispatch(editor.state.tr.insertText(text, g.pos).setMeta(key, EMPTY))
        return true
      },
      Escape: ({ editor }) => {
        const g = key.getState(editor.state)
        if (!g?.text) return false
        editor.view.dispatch(editor.state.tr.setMeta(key, { ...EMPTY }))
        return true
      },
    }
  },

  addProseMirrorPlugins() {
    const { pageId, kind } = this.options
    let timer: ReturnType<typeof setTimeout> | null = null
    let ctrl: AbortController | null = null

    return [
      new Plugin<GhostState>({
        key,
        state: {
          init: () => EMPTY,
          apply(tr, old) {
            const meta = tr.getMeta(key) as GhostState | undefined
            if (meta) return meta
            if (tr.docChanged || tr.selectionSet) return EMPTY
            return old
          },
        },
        props: {
          decorations(state) {
            const g = key.getState(state)
            if (!g?.text) return null
            const span = document.createElement('span')
            span.className = 'ghost-text'
            span.textContent = g.text
            const kbd = document.createElement('kbd')
            kbd.textContent = 'Tab'
            span.appendChild(kbd)
            return DecorationSet.create(state.doc, [Decoration.widget(g.pos, span, { side: 1, ignoreSelection: true })])
          },
          handleDOMEvents: {
            blur: (view) => {
              if (key.getState(view.state)?.text) view.dispatch(view.state.tr.setMeta(key, EMPTY))
              return false
            },
          },
        },
        view() {
          return {
            update(view, prev) {
              const state = view.state
              if (prev.doc.eq(state.doc) && prev.selection.eq(state.selection)) return
              if (timer) clearTimeout(timer)
              ctrl?.abort()
              const sel = state.selection
              if (!sel.empty || !view.hasFocus()) return
              const $from = sel.$from
              if (!$from.parent.isTextblock || $from.parent.type.name === 'codeBlock') return
              // Only suggest at the end of a block.
              if ($from.parentOffset !== $from.parent.content.size) return
              if (!ghostEnabled(pageId, kind)) return

              // TODO lists: an empty task in today's section shows the next planned task.
              if (kind === 'todo' && inEmptyTodayTask(state)) {
                const next = nextPlanSuggestion(pageId)
                if (next) {
                  const pos = sel.from
                  setTimeout(() => {
                    if (view.state.selection.from === pos && !key.getState(view.state)?.text)
                      view.dispatch(view.state.tr.setMeta(key, { text: next, pos, from: 'plan' }))
                  }, 120)
                }
                return
              }

              if ($from.parent.textContent.trim().length < 3) return
              const pos = sel.from
              const docAtRequest = state.doc
              timer = setTimeout(async () => {
                ctrl = new AbortController()
                const page = getApp().ws.page(pageId)
                const s = getApp().ws.getSnapshot().settings
                try {
                  const { before, after } = context(view.state)
                  const r = await postJson<{ text: string }>(
                    '/api/ai/complete',
                    {
                      before,
                      after,
                      title: page?.title,
                      kind,
                      model: s.completionModel ?? 'claude-opus-5-5',
                      workersAiModel: s.workersAiModel,
                    },
                    ctrl.signal,
                  )
                  if (!r.text || !view.hasFocus() || view.state.doc !== docAtRequest || view.state.selection.from !== pos) return
                  view.dispatch(view.state.tr.setMeta(key, { text: r.text, pos, from: 'complete' }))
                } catch {
                  /* aborted or offline: no suggestion */
                }
              }, 750)
            },
            destroy() {
              if (timer) clearTimeout(timer)
              ctrl?.abort()
            },
          }
        },
      }),
    ]
  },
})
