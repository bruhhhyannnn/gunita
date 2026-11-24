import { Outlet, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { setConfig, startApp, type App } from '#/lib/app'
import { fetchMe, getLocalUser, setLocalUser } from '#/lib/session'
import { setUi, useUi } from '#/lib/ui'
import { pruneTabs } from '#/lib/tabs'
import { Sidebar } from '#/components/Sidebar'
import { TabBar } from '#/components/TabBar'
import { CommandPalette } from '#/components/CommandPalette'
import { Toaster, toast } from '#/components/ui/toast'
import { config } from '#/config'
import { isoDate } from '#/lib/dates'
import { useTheme } from '#/lib/theme'
import { AskPanel } from '#/components/AskPanel'
import { QuickCapture } from '#/components/QuickCapture'

export const Route = createFileRoute('/_app')({ component: AppLayout })

function AppLayout() {
  const navigate = useNavigate()
  const [app, setApp] = useState<App | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      let user = getLocalUser()
      if (!user) {
        const r = await fetchMe()
        if (r.status !== 'ok') {
          void navigate({ to: '/login' })
          return
        }
        user = r.user
        setLocalUser(user)
      }
      const a = await startApp(user)
      if (cancelled) return
      setApp(a)
      pruneTabs((id) => !!a.ws.page(id))
      const me = await fetchMe()
      if (me.status === 'ok') {
        setConfig(me.config)
        // Let the AI refresh the brain once a day, after things settle.
        setTimeout(() => void import('#/ai/reflect').then((m) => m.maybeReflectDaily()), 20_000)
        if (me.user.id !== user.id) {
          setLocalUser(me.user)
          location.reload()
        } else setLocalUser(me.user)
      } else if (me.status === 'signed-out') {
        setConfig(me.config)
        a.sync.setSignedOut(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [navigate])

  if (!app) {
    return (
      <div className="grid h-dvh place-items-center">
        <img src="/icon.svg" alt="" className="h-10 w-10 animate-pulse rounded-xl" />
      </div>
    )
  }
  return <Shell />
}

function Shell() {
  useTheme()
  const navigate = useNavigate()
  useAutoReports()
  const askOpen = useUi((s) => s.askOpen)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setUi((s) => ({ paletteOpen: !s.paletteOpen }))
      } else if (mod && e.key === '\\') {
        e.preventDefault()
        setUi((s) => ({ sidebarOpen: !s.sidebarOpen }))
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        setUi({ captureOpen: true })
      } else if (mod && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        setUi((s) => ({ askOpen: !s.askOpen }))
      }
    }
    const onOpen = (e: Event) => void navigate({ to: '/p/$pageId', params: { pageId: (e as CustomEvent<string>).detail } })
    // Sent by the desktop app's global hotkey and tray menu (see src/lib/desktop.ts).
    const onCapture = () => setUi({ captureOpen: true })
    const onNavigate = (e: Event) => void navigate({ href: String((e as CustomEvent<string>).detail || '/') })
    // Developer mode: surface async errors that never reach an error boundary.
    const onRejection = (e: PromiseRejectionEvent) => {
      if (config.errorPage !== 'developer') return
      const r = e.reason as { name?: string; message?: string } | undefined
      if (r?.name === 'AbortError') return
      toast(`Unhandled error: ${r?.message ?? String(e.reason)}`, undefined, 8000)
      console.error('Unhandled rejection', e.reason)
    }
    window.addEventListener('unhandledrejection', onRejection)
    window.addEventListener('keydown', onKey)
    window.addEventListener('gunita:open-page', onOpen)
    window.addEventListener('gunita:capture', onCapture)
    window.addEventListener('gunita:navigate', onNavigate)
    return () => {
      window.removeEventListener('unhandledrejection', onRejection)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('gunita:open-page', onOpen)
      window.removeEventListener('gunita:capture', onCapture)
      window.removeEventListener('gunita:navigate', onNavigate)
    }
  }, [navigate])

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <TabBar />
        <div className="relative min-h-0 flex-1">
          <Outlet />
        </div>
      </main>
      {askOpen && <AskPanel />}
      <CommandPalette />
      <QuickCapture />
      <Toaster />
    </div>
  )
}

/** On the 15th and month end, draft accomplishment reports and say so. */
function useAutoReports() {
  const navigate = useNavigate()
  useEffect(() => {
    const run = async () => {
      // Wait for the first sync so another device's draft isn't duplicated.
      await new Promise((r) => setTimeout(r, 8000))
      const { autoDraftReports } = await import('#/lib/report')
      const made = await autoDraftReports().catch(() => [])
      for (const m of made) {
        const endsToday = m.period.to === isoDate()
        toast(
          `📝 Your ${m.period.short} accomplishment report is drafted${endsToday ? '. Regenerate tonight to include today' : ''}.`,
          { label: 'Open', run: () => void navigate({ to: '/p/$pageId', params: { pageId: m.pageId } }) },
          12000,
        )
      }
    }
    void run()
    const onVisible = () => document.visibilityState === 'visible' && void run()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [navigate])
}
