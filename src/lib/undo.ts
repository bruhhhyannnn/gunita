import * as Y from 'yjs'
import { useSyncExternalStore } from 'react'
import { toast } from '#/components/ui/toast'

/**
 * One undo history for the whole app. Each part that can be undone has its
 * own Yjs undo manager: the open page's editor (its text) and the workspace
 * (page tree, titles, icons, database cells, templates, sections). Undo picks
 * whichever changed most recently, so Ctrl+Z always undoes your last change,
 * wherever it was.
 */

export interface UndoSource {
  um: Y.UndoManager
  undo: () => void
  redo: () => void
  /** Shown after undoing from outside an editor, e.g. "a change to “Notes”". */
  describe?: () => string | null
}

const TIME = 'gunita:time'
const sources = new Set<UndoSource>()
const listeners = new Set<() => void>()
let version = 0

function emit() {
  version++
  listeners.forEach((l) => l())
}

function stamp({ stackItem }: { stackItem: { meta: Map<unknown, unknown> } }) {
  stackItem.meta.set(TIME, performance.now())
  emit()
}

/** Adds a source to the history; returns a function that removes it. */
export function trackUndo(source: UndoSource): () => void {
  sources.add(source)
  const { um } = source
  um.on('stack-item-added', stamp)
  um.on('stack-item-updated', stamp)
  um.on('stack-item-popped', emit)
  um.on('stack-cleared', emit)
  emit()
  return () => {
    sources.delete(source)
    um.off('stack-item-added', stamp)
    um.off('stack-item-updated', stamp)
    um.off('stack-item-popped', emit)
    um.off('stack-cleared', emit)
    emit()
  }
}

function latest(kind: 'undo' | 'redo'): UndoSource | null {
  let best: UndoSource | null = null
  let bestTime = -1
  for (const s of sources) {
    const stack = kind === 'undo' ? s.um.undoStack : s.um.redoStack
    const top = stack[stack.length - 1]
    if (!top) continue
    const t = (top.meta.get(TIME) as number | undefined) ?? 0
    if (t >= bestTime) {
      best = s
      bestTime = t
    }
  }
  return best
}

/** Undoes the most recent change. Returns the source used, or null if there was nothing to undo. */
export function appUndo(): UndoSource | null {
  const s = latest('undo')
  s?.undo()
  return s
}

export function appRedo(): UndoSource | null {
  const s = latest('redo')
  s?.redo()
  return s
}

export function useUndoState(): { canUndo: boolean; canRedo: boolean } {
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => version,
    () => version,
  )
  return { canUndo: !!latest('undo'), canRedo: !!latest('redo') }
}

/**
 * Undo or redo with feedback: changes outside the page you're looking at
 * (a page restored in the sidebar, a renamed title) get a short message.
 */
export function runUndo(kind: 'undo' | 'redo', opts: { quiet?: boolean } = {}): boolean {
  const s = kind === 'undo' ? appUndo() : appRedo()
  if (!s) return false
  const what = s.describe?.()
  if (what && !opts.quiet) toast(what, kind === 'undo' ? { label: 'Redo', run: () => void runUndo('redo') } : { label: 'Undo', run: () => void runUndo('undo') })
  return true
}
