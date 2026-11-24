import { useSyncExternalStore } from 'react'

export interface UiState {
  sidebarOpen: boolean
  sidebarWidth: number
  paletteOpen: boolean
  askOpen: boolean
  captureOpen: boolean
  shortcutsOpen: boolean
  mobile: boolean
  expanded: Record<string, boolean>
}

const KEY = 'gunita:ui'

function initial(): UiState {
  let saved: Partial<UiState> = {}
  try {
    saved = JSON.parse(localStorage.getItem(KEY) || '{}')
  } catch {
    /* ignore */
  }
  const mobile = typeof window !== 'undefined' && window.innerWidth < 768
  return {
    sidebarOpen: mobile ? false : (saved.sidebarOpen ?? true),
    sidebarWidth: saved.sidebarWidth ?? 248,
    paletteOpen: false,
    askOpen: false,
    captureOpen: false,
    shortcutsOpen: false,
    mobile,
    expanded: saved.expanded ?? {},
  }
}

let state: UiState | null = null
const listeners = new Set<() => void>()

function get() {
  if (!state) state = initial()
  return state
}

export function setUi(patch: Partial<UiState> | ((s: UiState) => Partial<UiState>)) {
  const s = get()
  state = { ...s, ...(typeof patch === 'function' ? patch(s) : patch) }
  try {
    const { sidebarOpen, sidebarWidth, expanded, mobile } = state
    localStorage.setItem(KEY, JSON.stringify({ sidebarOpen: mobile ? s.sidebarOpen : sidebarOpen, sidebarWidth, expanded }))
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

export function useUi<T>(sel: (s: UiState) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => sel(get()),
    () => sel(get()),
  )
}

export function getUi() {
  return get()
}

if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    const mobile = window.innerWidth < 768
    if (mobile !== get().mobile) setUi({ mobile, sidebarOpen: !mobile })
  })
}
