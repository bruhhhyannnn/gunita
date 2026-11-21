import { useSyncExternalStore } from 'react'
import { shortId } from './ids'

export interface Tab {
  id: string
  path: string
}

interface TabsState {
  tabs: Tab[]
  active: string
}

const KEY = 'gunita:tabs'
const listeners = new Set<() => void>()

function load(): TabsState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw) as TabsState
      if (s.tabs.length) return s
    }
  } catch {
    /* ignore */
  }
  const id = shortId()
  return { tabs: [{ id, path: '/' }], active: id }
}

let state: TabsState | null = null

function get(): TabsState {
  if (!state) state = load()
  return state
}

function save(s: TabsState) {
  state = s
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

export function useTabs() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    get,
    get,
  )
}

/** Keeps the active tab pointed at the current URL. */
export function syncActiveTab(path: string) {
  const s = get()
  const tab = s.tabs.find((t) => t.id === s.active)
  if (tab && tab.path !== path) save({ ...s, tabs: s.tabs.map((t) => (t.id === s.active ? { ...t, path } : t)) })
}

export function openTab(path: string): Tab {
  const s = get()
  const tab = { id: shortId(), path }
  const idx = s.tabs.findIndex((t) => t.id === s.active)
  const tabs = [...s.tabs]
  tabs.splice(idx + 1, 0, tab)
  save({ tabs, active: tab.id })
  return tab
}

export function activateTab(id: string): Tab | undefined {
  const s = get()
  const tab = s.tabs.find((t) => t.id === id)
  if (tab) save({ ...s, active: id })
  return tab
}

/** Closes a tab and returns the tab that becomes active (if the active one closed). */
export function closeTab(id: string): Tab | null {
  const s = get()
  if (s.tabs.length === 1) {
    const only = { ...s.tabs[0], path: '/' }
    save({ tabs: [only], active: only.id })
    return only
  }
  const idx = s.tabs.findIndex((t) => t.id === id)
  const tabs = s.tabs.filter((t) => t.id !== id)
  if (s.active !== id) {
    save({ ...s, tabs })
    return null
  }
  const next = tabs[Math.min(idx, tabs.length - 1)]
  save({ tabs, active: next.id })
  return next
}

/** Removes tabs that point at deleted pages. */
export function pruneTabs(exists: (pageId: string) => boolean) {
  const s = get()
  const tabs = s.tabs.map((t) => {
    const m = t.path.match(/^\/p\/([^/?#]+)/)
    return m && !exists(m[1]) ? { ...t, path: '/' } : t
  })
  if (tabs.some((t, i) => t !== s.tabs[i])) save({ ...s, tabs })
}
