import { useSyncExternalStore } from 'react'

/**
 * The size of page text (blocks, headings, the title, TODO days), per device:
 * a phone and a big monitor want different sizes. Ctrl/⌘ + and − change it,
 * Ctrl/⌘ 0 resets it.
 */

export const DEFAULT_SIZE = 16
export const SIZES = [13, 14, 15, 16, 17, 18, 19, 20, 22, 24, 26, 28]
const KEY = 'gunita:text-size'
const listeners = new Set<() => void>()

function read(): number {
  try {
    const n = Number(localStorage.getItem(KEY))
    return SIZES.includes(n) ? n : DEFAULT_SIZE
  } catch {
    return DEFAULT_SIZE
  }
}

let size = typeof window === 'undefined' ? DEFAULT_SIZE : read()

function apply() {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty('--content-size', `${size}px`)
}
apply()

export function getTextSize() {
  return size
}

export function setTextSize(next: number) {
  size = SIZES.reduce((best, s) => (Math.abs(s - next) < Math.abs(best - next) ? s : best), DEFAULT_SIZE)
  try {
    if (size === DEFAULT_SIZE) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, String(size))
  } catch {
    /* private mode: still applies until reload */
  }
  apply()
  listeners.forEach((l) => l())
}

/** One step bigger (1) or smaller (−1). Returns the new size. */
export function stepTextSize(dir: 1 | -1): number {
  const i = SIZES.indexOf(size)
  setTextSize(SIZES[Math.min(SIZES.length - 1, Math.max(0, (i < 0 ? SIZES.indexOf(DEFAULT_SIZE) : i) + dir))])
  return size
}

export function useTextSize(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => size,
    () => DEFAULT_SIZE,
  )
}

// Another tab changed it.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return
    size = read()
    apply()
    listeners.forEach((l) => l())
  })
}
