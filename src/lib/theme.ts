import { useEffect } from 'react'
import { useWs } from './app'

export function applyTheme(theme: 'system' | 'light' | 'dark') {
  try {
    localStorage.setItem('gunita:theme', theme)
  } catch {
    /* ignore */
  }
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#191919' : '#ffffff')
}

/** Follows the theme stored in workspace settings (synced across devices). */
export function useTheme() {
  const theme = useWs((s) => s.settings.theme ?? 'system')
  useEffect(() => {
    applyTheme(theme)
    if (theme !== 'system') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const on = () => applyTheme('system')
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [theme])
}
