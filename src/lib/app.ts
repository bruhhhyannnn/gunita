import { useCallback, useRef, useSyncExternalStore } from 'react'
import { DocManager } from './docs'
import { SyncEngine } from './sync'
import { PageIndex } from './pageIndex'
import { Workspace, WORKSPACE_DOC, type Snapshot } from './workspace'
import type { LocalUser, ServerConfig } from './session'

export interface App {
  user: LocalUser
  docs: DocManager
  ws: Workspace
  sync: SyncEngine
  index: PageIndex
  config: ServerConfig | null
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
  current = { user, docs, ws, sync, index, config: null }
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
  const cache = useRef<{ snap: Snapshot; value: T } | null>(null)
  const sel = useRef(selector)
  sel.current = selector
  const get = useCallback(() => {
    const snap = ws.getSnapshot()
    if (cache.current && cache.current.snap === snap) return cache.current.value
    const value = sel.current(snap)
    if (cache.current && shallowEqual(cache.current.value, value)) {
      cache.current = { snap, value: cache.current.value }
      return cache.current.value
    }
    cache.current = { snap, value }
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
