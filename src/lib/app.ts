import { useCallback, useRef, useSyncExternalStore } from 'react'
import * as Y from 'yjs'
import { DocManager } from './docs'
import { SyncEngine } from './sync'
import { PageIndex } from './pageIndex'
import { Workspace, WORKSPACE_DOC, type Snapshot } from './workspace'
import type { LocalUser, ServerConfig } from './session'
import type { PageMeta } from './types'
import { trackUndo } from './undo'

export interface App {
  user: LocalUser
  docs: DocManager
  ws: Workspace
  sync: SyncEngine
  index: PageIndex
  config: ServerConfig | null
  /** Undo history of the workspace (page tree, titles, properties, …). */
  wsUndo: Y.UndoManager
}

function quote(p: PageMeta | undefined) {
  return `“${p?.title || 'Untitled'}”`
}

/** A short description of what an undo/redo changed in the page tree. */
function describeChange(before: Record<string, PageMeta>, after: Record<string, PageMeta>): string | null {
  const ids = new Set([...Object.keys(before), ...Object.keys(after)])
  const changed = [...ids].filter((id) => before[id] !== after[id])
  if (!changed.length) return null
  if (changed.length > 1) {
    const back = changed.filter((id) => (!before[id] || before[id].trashedAt) && after[id] && !after[id].trashedAt)
    if (back.length === 1) return `Brought back ${quote(after[back[0]])}`
    return `Changed ${changed.length} pages`
  }
  const id = changed[0]
  const a = before[id]
  const b = after[id]
  if (!b) return `Removed ${quote(a)}`
  if (!a) return `Brought back ${quote(b)}`
  if (a.trashedAt && !b.trashedAt) return `Restored ${quote(b)} from the trash`
  if (!a.trashedAt && b.trashedAt) return `Moved ${quote(b)} to the trash`
  if (a.title !== b.title) return `Renamed to ${quote(b)}`
  if (a.parentId !== b.parentId || a.order !== b.order) return `Moved ${quote(b)}`
  return `Changed ${quote(b)}`
}

let current: App | null = null
const listeners = new Set<() => void>()

export async function startApp(user: LocalUser): Promise<App> {
  if (current?.user.id === user.id) return current
  current?.sync.stop()
  const docs = new DocManager(user.id)
  const { doc, ready } = docs.open(WORKSPACE_DOC)
  await ready
  const ws = new Workspace(doc)
  ws.refresh()
  const sync = new SyncEngine(docs, user.id)
  const index = new PageIndex(docs, ws, user.id)
  sync.onRemoteChange = (ids) => {
    for (const id of ids) if (id !== WORKSPACE_DOC) index.schedule(id, 200)
  }
  // Only your own changes are undone, never ones synced from another device.
  const wsUndo = new Y.UndoManager(ws.pages, { captureTimeout: 800 })
  let last: string | null = null
  const step = (dir: 'undo' | 'redo') => {
    const before = ws.getSnapshot().pages
    wsUndo[dir]()
    last = describeChange(before, ws.getSnapshot().pages)
  }
  trackUndo({ um: wsUndo, undo: () => step('undo'), redo: () => step('redo'), describe: () => last })
  current = { user, docs, ws, sync, index, config: null, wsUndo }
  sync.start()
  void index.ready.then(() => setTimeout(() => void index.fillMissing(), 3000))
  listeners.forEach((l) => l())
  return current
}

export function setConfig(config: ServerConfig) {
  if (current) {
    current = { ...current, config }
    listeners.forEach((l) => l())
  }
}

export function getApp(): App {
  if (!current) throw new Error('App not started')
  return current
}

export function useApp(): App {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current!,
    () => current!,
  )
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  for (const k of ka) if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false
  return true
}

/** Selects from the workspace snapshot; re-renders only when the selected value changes (shallowly). */
export function useWs<T>(selector: (s: Snapshot) => T): T {
  const { ws } = useApp()
  const cache = useRef<{ snap: Snapshot; sel: (s: Snapshot) => T; value: T } | null>(null)
  const sel = useRef(selector)
  sel.current = selector
  const get = useCallback(() => {
    const snap = ws.getSnapshot()
    const fn = sel.current
    // Re-run when either the data or the selector changed (e.g. a different page id).
    if (cache.current && cache.current.snap === snap && cache.current.sel === fn) return cache.current.value
    const value = fn(snap)
    if (cache.current && shallowEqual(cache.current.value, value)) {
      cache.current = { snap, sel: fn, value: cache.current.value }
      return cache.current.value
    }
    cache.current = { snap, sel: fn, value }
    return value
  }, [ws])
  return useSyncExternalStore(ws.subscribe, get, get)
}

export function usePage(id: string | null | undefined) {
  return useWs((s) => (id ? s.pages[id] : undefined))
}

export function useSyncState() {
  const { sync } = useApp()
  return useSyncExternalStore(sync.subscribe, sync.getState, sync.getState)
}

export function useIndexVersion() {
  const { index } = useApp()
  return useSyncExternalStore(index.subscribe, index.getVersion, index.getVersion)
}
