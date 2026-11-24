import { Extension } from '@tiptap/core'
import { Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/**
 * Ctrl+→ (Alt+→ on Mac) past the last word of a line. The browser would put the
 * caret inside the buttons and badges at the end of a task (they aren't
 * editable), and typing then did nothing. Inside the line the browser's own
 * word jumps are kept; only the jump to the end, and on to the next line, is
 * done here.
 */
export function wordRight(state: EditorState, dispatch: ((tr: Transaction) => void) | undefined, extend: boolean): boolean {
  const sel = state.selection
  const $head = sel.$head
  if (!$head.parent.isTextblock) return false
  const parent = $head.parent
  const rest = parent.textBetween($head.parentOffset, parent.content.size, undefined, '￼')
  let target: number | null = null
  if (rest.length === 0) {
    // At the end: go to the start of the next line.
    const after = $head.after()
    if (after >= state.doc.content.size) return true
    const next = Selection.findFrom(state.doc.resolve(after), 1, true)
    if (!next) return true
    target = next.from
  } else if (/^\s*\S*\s*$/.test(rest)) {
    // Only the last word is left: go to the end of the line.
    target = $head.end()
  } else return false
  if (dispatch) {
    const tr = state.tr.setSelection(extend ? TextSelection.create(state.doc, sel.anchor, target) : TextSelection.create(state.doc, target))
    dispatch(tr.scrollIntoView())
  }
  return true
}

export const WordNav = Extension.create({
  name: 'wordNav',
  addKeyboardShortcuts() {
    const mod = isMac() ? 'Alt' : 'Ctrl'
    return {
      [`${mod}-ArrowRight`]: ({ editor }) => wordRight(editor.state, editor.view.dispatch, false),
      [`${mod}-Shift-ArrowRight`]: ({ editor }) => wordRight(editor.state, editor.view.dispatch, true),
    }
  },
})
