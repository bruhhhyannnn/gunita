import { createFileRoute } from '@tanstack/react-router'
import { Download, LogOut } from 'lucide-react'
import type { ReactNode } from 'react'
import { getApp, useApp, useWs } from '#/lib/app'
import { exportAll } from '#/lib/markdown'
import { setLocalUser } from '#/lib/session'
import type { Settings } from '#/lib/types'
import { cn } from '#/components/ui/cn'
import { useDocumentTitle } from '#/lib/title'
import { DESKTOP_HOTKEY, isDesktop } from '#/lib/desktop'

export const Route = createFileRoute('/_app/settings')({ component: SettingsPage })

function Row({ title, desc, children }: { title: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-line py-4">
      <div className="min-w-0">
        <div className="font-medium">{title}</div>
        {desc && <div className="mt-0.5 text-sm text-muted">{desc}</div>}
      </div>
      <div className="flex-none">{children}</div>
    </div>
  )
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cn('relative h-5 w-9 rounded-full transition', on ? 'bg-accent' : 'bg-active')}
    >
      <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition', on ? 'left-[18px]' : 'left-0.5')} />
    </button>
  )
}

function SettingsPage() {
  useDocumentTitle('Settings')
  const { user, config } = useApp()
  const s = useWs((x) => x.settings)
  const set = (patch: Partial<Settings>) => getApp().ws.setSettings(patch)
  const select = 'h-8 rounded-md border border-line bg-bg px-2 text-sm'

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[760px] px-6 pb-24 pt-14">
        <h1 className="text-3xl font-bold">Settings</h1>

        <h2 className="mt-10 text-sm font-semibold text-muted">Account</h2>
        <Row title={user.name || 'Signed in'} desc={user.email}>
          <button
            className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm hover:bg-hover"
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
              setLocalUser(null)
              location.href = '/login'
            }}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </Row>

        <h2 className="mt-10 text-sm font-semibold text-muted">Appearance</h2>
        <Row title="Theme">
          <select className={select} value={s.theme ?? 'system'} onChange={(e) => set({ theme: e.target.value as Settings['theme'] })}>
            <option value="system">Match system</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </Row>

        <h2 className="mt-10 text-sm font-semibold text-muted">AI</h2>
        {config && !config.claudeConfigured && (
          <p className="mt-3 rounded-md bg-subtle p-3 text-sm text-muted">
            Claude isn't set up on the server yet. Add your key with <code>wrangler secret put ANTHROPIC_API_KEY</code>.
          </p>
        )}
        <Row title="Inline suggestions" desc="Gray text while you write. Tab accepts, Esc dismisses.">
          <Toggle on={s.ghostText !== false} onChange={(v) => set({ ghostText: v })} />
        </Row>
        <Row title="Suggestions in TODO lists" desc="Suggest tasks for today from your history, calendar and notes.">
          <Toggle on={s.ghostTextInTodo !== false} onChange={(v) => set({ ghostTextInTodo: v })} />
        </Row>
        <Row
          title="Model for inline suggestions"
          desc="Planning, chat, meetings and memory always use Claude Opus 5.5. Suggestions run constantly, so a faster model can save money."
        >
          <select className={select} value={s.completionModel ?? 'claude-opus-5-5'} onChange={(e) => set({ completionModel: e.target.value as Settings['completionModel'] })}>
            <option value="claude-opus-5-5">Claude Opus 5.5</option>
            <option value="claude-haiku-5-5">Claude Haiku 5.5 (fast, cheap)</option>
            <option value="workers-ai" disabled={config ? !config.workersAiConfigured : false}>
              Workers AI (free tier){config && !config.workersAiConfigured ? ' — not enabled' : ''}
            </option>
          </select>
        </Row>
        {s.completionModel === 'workers-ai' && (
          <Row title="Workers AI model" desc="Any text-generation model id from the Workers AI catalog.">
            <input
              className={cn(select, 'w-72')}
              value={s.workersAiModel ?? '@cf/meta/llama-3.3-70b-instruct-fp8-fast'}
              onChange={(e) => set({ workersAiModel: e.target.value })}
            />
          </Row>
        )}

        <h2 className="mt-10 text-sm font-semibold text-muted">Google Calendar</h2>
        <Row title="Calendar" desc="Read-only. Used to prepare meeting notes and plan your day.">
          {config?.calendarConnected ? (
            <span className="text-sm text-muted">Connected</span>
          ) : (
            <a href="/api/auth/google?mode=calendar" className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-hover">
              Connect
            </a>
          )}
        </Row>

        {isDesktop() && (
          <>
            <h2 className="mt-10 text-sm font-semibold text-muted">Desktop app</h2>
            <Row title="Quick capture" desc="Works from any app, even when Gunita is in the tray.">
              <kbd className="rounded border border-line px-2 py-1 text-xs">{DESKTOP_HOTKEY}</kbd>
            </Row>
            <Row title="Start with Windows and tray" desc="Right-click the Gunita icon in the system tray to change these. Closing the window keeps Gunita in the tray.">
              <span />
            </Row>
          </>
        )}

        <h2 className="mt-10 text-sm font-semibold text-muted">Your data</h2>
        <Row title="Export everything" desc="All pages as Markdown, databases as CSV, in a zip file.">
          <button className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm hover:bg-hover" onClick={() => void exportAll()}>
            <Download className="h-4 w-4" /> Export
          </button>
        </Row>
      </div>
    </div>
  )
}
