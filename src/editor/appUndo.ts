import { Extension } from '@tiptap/core'
import { runUndo } from '#/lib/undo'

/**
 * Ctrl+Z / Ctrl+Y in a page use the app-wide history, so they also undo a
 * title change or a page you just deleted if that was your last change.
 */
export const AppUndo = Extension.create({
  name: 'appUndo',
  // Before the collaboration extension's own Mod-z.
  priority: 1100,
  addKeyboardShortcuts() {
    return {
      'Mod-z': () => runUndo('undo'),
      'Mod-y': () => runUndo('redo'),
      'Shift-Mod-z': () => runUndo('redo'),
    }
  },
})
