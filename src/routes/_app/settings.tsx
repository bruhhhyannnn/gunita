import { createFileRoute } from '@tanstack/react-router'
import { Download, LogOut } from 'lucide-react'
import type { ReactNode } from 'react'
import { getApp, useApp, useWs } from '#/lib/app'
import { exportAll } from '#/lib/markdown'
import { setLocalUser } from '#/lib/session'
import type { Settings } from '#/lib/types'
import { Select } from '#/components/ui/select'
import { Switch } from '#/components/ui/switch'
import { Input } from '#/components/ui/input'
import { Button } from '#/components/ui/button'
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

function SettingsPage() {
  useDocumentTitle('Settings')
  const { user, config } = useApp()
  const s = useWs((x) => x.settings)
  const set = (patch: Partial<Settings>) => getApp().ws.setSettings(patch)

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[760px] px-6 pb-24 pt-14">
        <h1 className="text-3xl font-bold">Settings</h1>

        <h2 className="mt-10 text-sm font-semibold text-muted">Account</h2>
        <Row title={user.name || 'Signed in'} desc={user.email}>
          <Button
            icon={<LogOut />}
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
              setLocalUser(null)
              location.href = '/login'
            }}
          >
            Sign out
          </Button>
        </Row>

        <h2 className="mt-10 text-sm font-semibold text-muted">Appearance</h2>
        <Row title="Theme">
          <Select
            aria-label="Theme"
            className="w-40"
            value={s.theme ?? 'system'}
            onValueChange={(v) => set({ theme: v as Settings['theme'] })}
            options={[
              { value: 'system', label: 'Match system' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </Row>

        <h2 className="mt-10 text-sm font-semibold text-muted">AI</h2>
        {config && !config.claudeConfigured && (
          <p className="mt-3 rounded-md bg-subtle p-3 text-sm text-muted">
            Claude isn't set up on the server yet. Add your key with <code>wrangler secret put ANTHROPIC_API_KEY</code>.
          </p>
        )}
        <Row title="Inline suggestions" desc="Gray text while you write. Tab accepts, Esc dismisses.">
          <Switch aria-label="Inline suggestions" checked={s.ghostText !== false} onCheckedChange={(v) => set({ ghostText: v })} />
        </Row>
        <Row title="Suggestions in TODO lists" desc="Suggest tasks for today from your history, calendar and notes.">
          <Switch aria-label="Suggestions in TODO lists" checked={s.ghostTextInTodo !== false} onCheckedChange={(v) => set({ ghostTextInTodo: v })} />
        </Row>
        <Row
          title="Model for inline suggestions"
          desc="Planning, chat, meetings and memory always use Claude Opus 5.5. Suggestions run constantly, so a faster model can save money."
        >
          <Select
            aria-label="Model for inline suggestions"
            className="w-64"
            value={s.completionModel ?? 'claude-opus-5-5'}
            onValueChange={(v) => set({ completionModel: v as Settings['completionModel'] })}
            options={[
              { value: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
              { value: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (fast, cheap)' },
              {
                value: 'workers-ai',
                label: `Workers AI (free tier)${config && !config.workersAiConfigured ? ' — not enabled' : ''}`,
                disabled: config ? !config.workersAiConfigured : false,
              },
            ]}
          />
        </Row>
        {s.completionModel === 'workers-ai' && (
          <Row title="Workers AI model" desc="Any text-generation model id from the Workers AI catalog.">
            <Input
              className="w-72"
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
            <Button onClick={() => (location.href = '/api/auth/google?mode=calendar')}>Connect</Button>
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
          <Button icon={<Download />} onClick={() => void exportAll()}>
            Export
          </Button>
        </Row>
      </div>
    </div>
  )
}
