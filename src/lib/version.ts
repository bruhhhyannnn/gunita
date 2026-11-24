import { useEffect, useSyncExternalStore } from 'react'

/** This build, e.g. for Settings → About. */
export const BUILD_ID = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev'
export const BUILD_TIME = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : new Date().toISOString()

let updateReady = false
const listeners = new Set<() => void>()

/**
 * Asks the server which version is live (the same id is in every build's
 * precache-manifest.json). Returns true if it's newer than this tab.
 */
export async function checkForUpdate(): Promise<boolean> {
  if (updateReady) return true
  try {
    const res = await fetch('/precache-manifest.json', { cache: 'no-store' })
    if (!res.ok) return false // dev server: no manifest
    const { version } = (await res.json()) as { version?: string }
    if (version && version !== BUILD_ID && Number(version) > Number(BUILD_ID)) {
      updateReady = true
      listeners.forEach((l) => l())
    }
  } catch {
    /* offline */
  }
  return updateReady
}

export function useUpdateReady(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => updateReady,
    () => false,
  )
}

/** Checks for a new version when you come back to the tab, and every 15 minutes. */
export function useUpdateCheck() {
  useEffect(() => {
    const check = () => void checkForUpdate()
    const onVisible = () => document.visibilityState === 'visible' && check()
    const first = setTimeout(check, 20_000)
    const every = setInterval(check, 15 * 60_000)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(first)
      clearInterval(every)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
}
