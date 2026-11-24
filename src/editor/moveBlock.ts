import { Extension } from '@tiptap/core'
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model'
import { TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'

const ITEM = new Set(['taskItem', 'listItem'])
const LIST = new Set(['taskList', 'bulletList', 'orderedList'])

/** The depth of the block to move: the list item the cursor is in, else the block itself. */
function blockDepth($from: ResolvedPos): number {
  for (let d = $from.depth; d > 0; d--) {
    const name = $from.node(d).type.name
    if (ITEM.has(name)) return d
    // Never move a whole day or section; move the block inside it.
    if (name === 'todoDay' || name === 'todoSection') return d + 1 <= $from.depth ? d + 1 : -1
  }
  // A details summary moves the whole toggle.
  if ($from.parent.type.name === 'detailsSummary') return $from.depth - 1
  return $from.depth >= 1 ? 1 : -1
}

interface Slot {
  /** Where the item goes in the original document. */
  pos: number
  /** True if a new list has to be made around the item. */
  wrap: boolean
}

/**
 * A task at the top or bottom of its list steps into the neighbouring list
 * of the same day: the next section's list, or the list next to the section.
 */
function slotAcross($from: ResolvedPos, depth: number, dir: -1 | 1): Slot | null {
  const listDepth = depth - 1
  const list = $from.node(listDepth)
  const containerDepth = listDepth - 1
  if (containerDepth < 0 || ITEM.has($from.node(containerDepth).type.name)) return null
  let outerDepth = containerDepth
  let index = $from.index(containerDepth)
  let sibling: PMNode | null = $from.node(containerDepth).maybeChild(index + dir)
  // At the edge of a section: look next to the section instead.
  if (!sibling && $from.node(containerDepth).type.name === 'todoSection' && containerDepth > 0) {
    outerDepth = containerDepth - 1
    index = $from.index(outerDepth)
    sibling = $from.node(outerDepth).maybeChild(index + dir)
  }
  if (!sibling) return null
  // Position of the sibling in the original doc.
  let sibPos = $from.start(outerDepth)
  const parent = $from.node(outerDepth)
  for (let i = 0; i < index + dir; i++) sibPos += parent.child(i).nodeSize

  if (sibling.type === list.type) return { pos: dir === 1 ? sibPos + 1 : sibPos + sibling.nodeSize - 1, wrap: false }
  if (sibling.type.name === 'todoSection') {
    // Into the first (going down) or last (going up) list of that section.
    let found: Slot | null = null
    let p = sibPos + 1
    sibling.forEach((child) => {
      if (child.type === list.type && (dir === -1 || !found)) found = { pos: dir === 1 ? p + 1 : p + child.nodeSize - 1, wrap: false }
      p += child.nodeSize
    })
    return found ?? { pos: dir === 1 ? sibPos + 1 : sibPos + sibling.nodeSize - 1, wrap: true }
  }
  return null
}

/** Moves the current list item (or block) up or down, like Notion's Ctrl+Shift+↑/↓. */
export function moveBlock(state: EditorState, dispatch: ((tr: Transaction) => void) | undefined, dir: -1 | 1): boolean {
  const { $from } = state.selection
  const depth = blockDepth($from)
  if (depth < 1 || $from.depth < depth) return false
  const node = $from.node(depth)
  const parent = $from.node(depth - 1)
  const index = $from.index(depth - 1)
  const pos = $from.before(depth)
  const offset = state.selection.from - pos
  const target = index + dir

  if (target < 0 || target >= parent.childCount) {
    if (!ITEM.has(node.type.name) || !LIST.has(parent.type.name)) return false
    const slot = slotAcross($from, depth, dir)
    if (!slot) return true // at the edge: nothing to do, but don't let the browser scroll
    if (!dispatch) return true
    const tr = state.tr
    // Take the item out; an emptied list goes too (or becomes a blank line if it was alone).
    const listPos = $from.before(depth - 1)
    const container = $from.node(depth - 2)
    if (parent.childCount === 1) {
      if (container.childCount === 1) tr.replaceWith(listPos, listPos + parent.nodeSize, state.schema.nodes.paragraph.create())
      else tr.delete(listPos, listPos + parent.nodeSize)
    } else tr.delete(pos, pos + node.nodeSize)
    const at = tr.mapping.map(slot.pos, dir === 1 ? -1 : 1)
    tr.insert(at, slot.wrap ? parent.type.create(parent.attrs, node) : node)
    const start = at + (slot.wrap ? 1 : 0)
    tr.setSelection(TextSelection.create(tr.doc, Math.min(start + offset, tr.doc.content.size)))
    dispatch(tr.scrollIntoView())
    return true
  }

  if (!dispatch) return true
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

/** Alt+↑/↓ (hold Alt and tap the arrows) or Ctrl+Shift+↑/↓ moves the current block or task. */
export const MoveBlock = Extension.create({
  name: 'moveBlock',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      'Mod-Shift-ArrowUp': ({ editor }) => moveBlock(editor.state, editor.view.dispatch, -1),
      'Mod-Shift-ArrowDown': ({ editor }) => moveBlock(editor.state, editor.view.dispatch, 1),
      'Alt-ArrowUp': ({ editor }) => moveBlock(editor.state, editor.view.dispatch, -1),
      'Alt-ArrowDown': ({ editor }) => moveBlock(editor.state, editor.view.dispatch, 1),
    }
  },
})
