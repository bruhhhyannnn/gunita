import { useNavigate, useRouterState } from '@tanstack/react-router'
import { Pause, Play, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { fmt, pauseFocus, phaseLabel, resumeFocus, stopFocus, timeLeft, useFocusRun, useNow, type FocusRun } from '#/lib/focus'
import { cn } from '../ui/cn'

/** The time, phase and a pause button: used by the floating pill and the keep-on-top window. */
function MiniBody({ run, now, compact }: { run: FocusRun; now: number; compact?: boolean }) {
  const running = run.status === 'running'
  const focus = run.phase === 'focus'
  return (
    <div className="flex items-center gap-2.5">
      <span className={cn('h-2.5 w-2.5 flex-none rounded-full', focus ? 'bg-accent' : 'bg-[#2e9f6b]', running && 'animate-pulse')} />
      <div className="min-w-0 leading-tight">
        <div className={cn('font-semibold tabular-nums', compact ? 'text-base' : 'text-[28px]')}>{fmt(timeLeft(run, now))}</div>
        <div className="truncate text-xs text-muted">
          {phaseLabel(run)}
          {run.phase === 'focus' && ` · ${run.set}/${run.cfg.sets}`}
          {run.status === 'paused' && ' · paused'}
          {run.status === 'waiting' && ' · ready'}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation()
          if (running) pauseFocus()
          else resumeFocus()
        }}
        className="ml-auto grid h-8 w-8 flex-none place-items-center rounded-full bg-hover text-fg hover:bg-active"
        aria-label={running ? 'Pause' : 'Resume'}
      >
        {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>
    </div>
  )
}

/** A small timer in the corner of every page while a focus session runs. */
export function FocusPill() {
  const run = useFocusRun()
  const now = useNow(run?.status === 'running')
  const navigate = useNavigate()
  // Pages show the timer in their top bar instead (FocusButton).
  const hidden = useRouterState({ select: (s) => s.location.pathname === '/focus' || s.location.pathname.startsWith('/p/') })
  if (!run || run.status === 'done' || hidden) return null
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => void navigate({ to: '/focus' })}
      onKeyDown={(e) => e.key === 'Enter' && void navigate({ to: '/focus' })}
      // On phones, above the "+" quick capture button.
      className="animate-pop fixed bottom-4 right-4 z-40 w-48 cursor-pointer max-md:bottom-24 rounded-xl border border-line bg-popover px-3 py-2 shadow-pop"
      aria-label="Focus timer"
    >
      <MiniBody run={run} now={now} compact />
    </div>
  )
}

type PipWindow = Window & { document: Document }
declare global {
  interface Window {
    documentPictureInPicture?: { requestWindow: (o: { width: number; height: number }) => Promise<PipWindow>; window: PipWindow | null }
  }
}

export const canPopOut = () => typeof window !== 'undefined' && !!window.documentPictureInPicture

/** Copies the app's styles (and dark mode) into the little window. */
function copyStyles(to: Document) {
  for (const sheet of [...document.styleSheets]) {
    try {
      const style = to.createElement('style')
      style.textContent = [...sheet.cssRules].map((r) => r.cssText).join('\n')
      to.head.appendChild(style)
    } catch {
      if (sheet.href) {
        const link = to.createElement('link')
        link.rel = 'stylesheet'
        link.href = sheet.href
        to.head.appendChild(link)
      }
    }
  }
  to.documentElement.className = document.documentElement.className
}

/** "Keep on top": the timer in a small always-on-top window (like the Windows Clock's compact view). */
export function useFocusPopOut(): { open: () => Promise<void>; portal: React.ReactNode; isOpen: boolean } {
  const [win, setWin] = useState<PipWindow | null>(null)
  const run = useFocusRun()
  const now = useNow(!!win && run?.status === 'running')
  useEffect(() => {
    if (!win) return
    const close = () => setWin(null)
    win.addEventListener('pagehide', close)
    return () => win.removeEventListener('pagehide', close)
  }, [win])
  useEffect(() => {
    // Close the little window when the session is over.
    if (win && (!run || run.status === 'done')) win.close()
  }, [run, win])
  const open = async () => {
    if (!window.documentPictureInPicture) return
    const w = await window.documentPictureInPicture.requestWindow({ width: 260, height: 96 })
    copyStyles(w.document)
    w.document.title = 'Focus · Gunita'
    w.document.body.className = 'bg-bg text-fg'
    setWin(w)
  }
  const portal =
    win && run && run.status !== 'done'
      ? createPortal(
          <div className="flex h-screen flex-col justify-center gap-1 px-4">
            <MiniBody run={run} now={now} />
            <button onClick={() => stopFocus()} className="flex items-center gap-1 self-start text-[11px] text-faint hover:text-fg">
              <X className="h-3 w-3" /> Stop session
            </button>
          </div>,
          win.document.body,
        )
      : null
  return { open, portal, isOpen: !!win }
}
