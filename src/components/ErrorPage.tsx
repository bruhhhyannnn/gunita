import { useRouter, useRouterState, type ErrorComponentProps } from '@tanstack/react-router'
import { AlertTriangle, ChevronDown, Copy, Home, RefreshCw, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { config } from '#/config'
import { Button } from './ui/button'

function details(error: unknown, path: string, componentStack?: string) {
  const e = error instanceof Error ? error : new Error(String(error))
  return [
    `${e.name}: ${e.message}`,
    `Page: ${path}`,
    `Time: ${new Date().toISOString()}`,
    `Browser: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'n/a'}`,
    `Online: ${typeof navigator !== 'undefined' ? navigator.onLine : 'n/a'}`,
    '',
    'Stack:',
    e.stack ?? '(no stack)',
    ...(componentStack ? ['', 'Component stack:', componentStack.trim()] : []),
  ].join('\n')
}

/** Shown when a screen crashes. Developer mode shows everything needed to fix it. */
export function ErrorPage({ error, reset, info }: ErrorComponentProps) {
  const router = useRouter()
  const path = useRouterState({ select: (s) => s.location.href })
  const [showStack, setShowStack] = useState(true)
  const [copied, setCopied] = useState(false)
  const err = error instanceof Error ? error : new Error(String(error))
  const retry = () => {
    reset()
    void router.invalidate()
  }
  const text = details(error, path, info?.componentStack)

  if (config.errorPage === 'production') {
    return (
      <div className="grid h-full min-h-[60vh] place-items-center px-6">
        <div className="max-w-md text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-hover text-2xl">🫣</div>
          <h1 className="mt-5 text-xl font-semibold">This page hit a snag</h1>
          <p className="mt-2 text-sm text-muted">Your notes are safe. Try again, or go back home. If it keeps happening, copy the details and send them to support.</p>
          <div className="mt-6 flex justify-center gap-2">
            <Button variant="primary" icon={<RotateCcw />} onClick={retry}>
              Try again
            </Button>
            <Button icon={<Home />} onClick={() => void router.navigate({ to: '/' })}>
              Home
            </Button>
          </div>
          <button
            className="mt-4 text-xs text-faint underline"
            onClick={() => {
              void navigator.clipboard.writeText(text)
              setCopied(true)
            }}
          >
            {copied ? 'Copied' : 'Copy error details'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="flex items-start gap-3 rounded-xl border border-danger/40 bg-danger/5 p-5">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-danger" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-danger">Developer error page</div>
            <h1 className="mt-1 break-words text-lg font-semibold">
              {err.name}: {err.message}
            </h1>
            <p className="mt-1 break-all text-sm text-muted">on {path}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" icon={<RotateCcw />} onClick={retry}>
            Try again
          </Button>
          <Button icon={<RefreshCw />} onClick={() => location.reload()}>
            Reload app
          </Button>
          <Button icon={<Home />} onClick={() => void router.navigate({ to: '/' })}>
            Home
          </Button>
          <Button
            icon={<Copy />}
            onClick={() => {
              void navigator.clipboard.writeText(text)
              setCopied(true)
            }}
          >
            {copied ? 'Copied' : 'Copy details'}
          </Button>
        </div>
        <button onClick={() => setShowStack((s) => !s)} className="mt-6 flex items-center gap-1 text-sm font-medium text-muted">
          <ChevronDown className={`h-4 w-4 transition ${showStack ? '' : '-rotate-90'}`} /> Stack trace
        </button>
        {showStack && (
          <pre className="mt-2 max-h-[50vh] overflow-auto rounded-lg border border-line bg-subtle p-4 font-mono text-xs leading-relaxed text-muted">{text}</pre>
        )}
        <p className="mt-4 text-xs text-faint">
          Switch to the friendly page by setting <code>errorPage: 'production'</code> in <code>src/config.ts</code> (or <code>VITE_ERROR_PAGE=production</code>).
        </p>
      </div>
    </div>
  )
}

export function NotFoundPage() {
  const router = useRouter()
  return (
    <div className="grid h-full min-h-[60vh] place-items-center px-6">
      <div className="text-center">
        <div className="text-4xl">🧭</div>
        <h1 className="mt-4 text-xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-muted">This link doesn't lead anywhere in Gunita.</p>
        <Button className="mt-6" variant="primary" icon={<Home />} onClick={() => void router.navigate({ to: '/' })}>
          Go home
        </Button>
      </div>
    </div>
  )
}
