import { Extension } from '@tiptap/core'
import { TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'

/** Moves the current list item (or top-level block) up or down, like Notion's Ctrl+Shift+↑/↓. */
export function moveBlock(state: EditorState, dispatch: ((tr: Transaction) => void) | undefined, dir: -1 | 1): boolean {
  const { $from } = state.selection
  let depth = -1
  for (let d = $from.depth; d > 0; d--) {
    const name = $from.node(d).type.name
    if (name === 'taskItem' || name === 'listItem') {
      depth = d
      break
    }
  }
  if (depth < 0) depth = 1
  if ($from.depth < depth) return false
  const node = $from.node(depth)
  const parent = $from.node(depth - 1)
  const index = $from.index(depth - 1)
  const target = index + dir
  if (target < 0 || target >= parent.childCount) return false
  if (!dispatch) return true
  const pos = $from.before(depth)
  const offset = state.selection.from - pos
  const sibling = parent.child(target)
  const tr = state.tr
  let newPos: number
  if (dir === -1) {
    newPos = pos - sibling.nodeSize
    tr.delete(pos, pos + node.nodeSize)
    tr.insert(newPos, node)
  } else {
    const afterSibling = pos + node.nodeSize + sibling.nodeSize
    tr.insert(afterSibling, node)
    tr.delete(pos, pos + node.nodeSize)
    newPos = afterSibling - node.nodeSize
  }
  tr.setSelection(TextSelection.create(tr.doc, Math.min(newPos + offset, tr.doc.content.size)))
  dispatch(tr.scrollIntoView())
  return true
}

export const MoveBlock = Extension.create({
  name: 'moveBlock',
  addKeyboardShortcuts() {
    return {
      'Mod-Shift-ArrowUp': ({ editor }) => moveBlock(editor.state, editor.view.dispatch, -1),
      'Mod-Shift-ArrowDown': ({ editor }) => moveBlock(editor.state, editor.view.dispatch, 1),
      'Alt-ArrowUp': ({ editor }) => moveBlock(editor.state, editor.view.dispatch, -1),
      'Alt-ArrowDown': ({ editor }) => moveBlock(editor.state, editor.view.dispatch, 1),
    }
  },
})
