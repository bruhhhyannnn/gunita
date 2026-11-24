import { useEffect, useState } from 'react'

/**
 * Your notes live on the device first (IndexedDB). Browsers may clear that
 * storage when the disk runs low unless the site is marked "persistent".
 * Chromium browsers (Chrome, Edge, Opera) decide quietly; Firefox asks, so
 * there it's only requested when you click the button in Settings.
 */
export async function requestPersistence(userAsked = false): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    if (!userAsked && /firefox/i.test(navigator.userAgent)) return false
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export interface StorageInfo {
  persisted: boolean
  usage: number
}

export function useStorageInfo(): StorageInfo | null {
  const [info, setInfo] = useState<StorageInfo | null>(null)
  useEffect(() => {
    let alive = true
    const read = async () => {
      if (!navigator.storage?.estimate) return
      const [persisted, est] = await Promise.all([navigator.storage.persisted?.() ?? false, navigator.storage.estimate()])
      if (alive) setInfo({ persisted, usage: est.usage ?? 0 })
    }
    void read()
    const t = setInterval(read, 5000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])
  return info
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}
