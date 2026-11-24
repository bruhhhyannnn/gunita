import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchMe, setLocalUser, type ServerConfig } from '#/lib/session'
import { isDesktop } from '#/lib/desktop'
import { useDocumentTitle } from '#/lib/title'

export const Route = createFileRoute('/login')({ component: Login })

function Login() {
  useDocumentTitle('Sign in')
  const navigate = useNavigate()
  const [config, setConfig] = useState<ServerConfig | null>(null)
  const [offline, setOffline] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const desktopError = typeof location !== 'undefined' && new URLSearchParams(location.search).get('error') === 'desktop'

  useEffect(() => {
    void fetchMe().then((r) => {
      if (r.status === 'ok') {
        setLocalUser(r.user)
        void navigate({ to: '/' })
      } else if (r.status === 'signed-out') setConfig(r.config)
      else setOffline(true)
    })
  }, [navigate])

  return (
    <div className="min-h-full grid place-items-center px-4 py-16">
      <div className="w-full max-w-sm text-center">
        <img src="/icon.svg" alt="" className="mx-auto mb-6 h-16 w-16 rounded-2xl" />
        <h1 className="text-3xl font-semibold tracking-tight">Gunita</h1>
        <p className="mt-2 text-muted">Your notes, your days, and a memory that remembers for you.</p>
        <div className="mt-10 space-y-3">
          {offline && <p className="text-sm text-muted">You're offline. Connect to sign in for the first time.</p>}
          {config && (
            <>
              <a
                href="/api/auth/google"
                // In the desktop app this link opens your normal browser (Google blocks sign-in inside apps).
                onClick={() => isDesktop() && setWaiting(true)}
                className="flex h-11 w-full items-center justify-center gap-3 rounded-md border border-line bg-popover font-medium hover:bg-hover"
              >
                <GoogleLogo />
                Continue with Google
              </a>
              {waiting && (
                <p className="text-sm text-muted">
                  Finish signing in in your browser. When it asks to open Gunita, allow it, and you'll be brought back here.
                </p>
              )}
              {desktopError && !waiting && <p className="text-sm text-danger">That sign-in link expired. Please try again.</p>}
              {!config.googleConfigured && (
                <p className="text-xs text-muted">
                  Google sign-in needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET. See the README.
                </p>
              )}
              {config.devLogin && (
                <form method="post" action="/api/auth/dev">
                  <button className="h-11 w-full rounded-md bg-hover text-sm text-muted hover:bg-active">
                    Local dev login
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
    </svg>
  )
}
