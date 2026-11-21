import { Command } from 'cmdk'
import { Dialog as D } from 'radix-ui'
import { useNavigate } from '@tanstack/react-router'
import { Brain, CalendarClock, CheckSquare, FileText, Moon, Settings, Sparkles, Sun, Table2 } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { getApp, useApp, useIndexVersion, useWs } from '#/lib/app'
import { createPageOfKind } from '#/lib/actions'
import { setUi, useUi } from '#/lib/ui'
import { timeAgo } from '#/lib/dates'
import type { PageKind } from '#/lib/types'
import { PageIcon } from './PageIcon'
import { useOpenPage } from './Sidebar'
import { askQuestion } from './AskPanel'

export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen)
  const [q, setQ] = useState('')
  const { index } = useApp()
  const version = useIndexVersion()
  const pages = useWs((s) => s.pages)
  const navigate = useNavigate()
  const openPage = useOpenPage()
  const theme = useWs((s) => s.settings.theme ?? 'system')

  const close = () => {
    setUi({ paletteOpen: false })
    setQ('')
  }

  const results = useMemo(() => {
    if (!q.trim()) {
      return Object.values(pages)
        .filter((p) => !p.trashedAt)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 8)
        .map((p) => ({ page: p, snippet: '' }))
    }
    return index
      .query(q, 15)
      .map((r) => pages[r.id])
      .filter((p) => p && !p.trashedAt)
      .map((p) => ({ page: p, snippet: index.snippet(p.id, q) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, pages, index, version])

  const create = (kind: PageKind) => {
    const id = createPageOfKind(kind, { title: kind === 'page' || kind === 'database' ? q : undefined })
    close()
    openPage(id)
  }

  const commands: { id: string; label: string; icon: ReactNode; run: () => void }[] = [
    { id: 'new-page', label: q ? `New page "${q}"` : 'New page', icon: <FileText />, run: () => create('page') },
    { id: 'new-todo', label: 'New TODO list', icon: <CheckSquare />, run: () => create('todo') },
    { id: 'new-db', label: 'New database', icon: <Table2 />, run: () => create('database') },
    { id: 'new-meeting', label: 'New meeting note', icon: <CalendarClock />, run: () => create('meeting') },
    {
      id: 'ask',
      label: q ? `Ask my notes: "${q}"` : 'Ask my notes',
      icon: <Sparkles />,
      run: () => {
        close()
        setUi({ askOpen: true })
        if (q) setTimeout(() => askQuestion(q), 50)
      },
    },
    {
      id: 'brain',
      label: 'Open Brain',
      icon: <Brain />,
      run: () => {
        close()
        void navigate({ to: '/brain' })
      },
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <Settings />,
      run: () => {
        close()
        void navigate({ to: '/settings' })
      },
    },
    {
      id: 'theme',
      label: `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`,
      icon: theme === 'dark' ? <Sun /> : <Moon />,
      run: () => {
        getApp().ws.setSettings({ theme: theme === 'dark' ? 'light' : 'dark' })
        close()
      },
    },
  ]
  const shownCommands = q ? commands.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()) || c.id === 'new-page' || c.id === 'ask') : commands

  return (
    <D.Root open={open} onOpenChange={(o) => (o ? setUi({ paletteOpen: true }) : close())}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <D.Content
          aria-describedby={undefined}
          className="animate-pop fixed left-1/2 top-[10vh] z-50 w-[min(680px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-xl bg-popover shadow-pop"
        >
          <D.Title className="sr-only">Search</D.Title>
          <Command shouldFilter={false} loop>
            <Command.Input
              value={q}
              onValueChange={setQ}
              autoFocus
              placeholder="Search pages or type a command…"
              className="h-12 w-full border-b border-line bg-transparent px-4 text-[16px] outline-none placeholder:text-faint"
            />
            <Command.List className="max-h-[60vh] overflow-y-auto p-1.5">
              <Command.Empty className="p-4 text-sm text-muted">No results.</Command.Empty>
              {results.length > 0 && (
                <Command.Group heading={q ? 'Pages' : 'Recent'} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-faint">
                  {results.map(({ page, snippet }) => (
                    <Command.Item
                      key={page.id}
                      value={'page-' + page.id}
                      onSelect={() => {
                        close()
                        openPage(page.id)
                      }}
                      className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 data-[selected=true]:bg-hover"
                    >
                      <PageIcon icon={page.icon} kind={page.kind} size={18} className="mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{page.title || 'Untitled'}</div>
                        {snippet ? (
                          <div className="truncate text-xs text-muted">{snippet}</div>
                        ) : (
                          <div className="truncate text-xs text-faint">
                            {breadcrumb(page.id)}
                            {timeAgo(page.updatedAt)}
                          </div>
                        )}
                      </div>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              <Command.Group heading="Actions" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-faint">
                {shownCommands.map((c) => (
                  <Command.Item
                    key={c.id}
                    value={c.id}
                    onSelect={c.run}
                    className="flex h-9 cursor-pointer items-center gap-3 rounded-md px-2 data-[selected=true]:bg-hover [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-muted"
                  >
                    {c.icon}
                    <span className="truncate">{c.label}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}

function breadcrumb(id: string) {
  const anc = getApp().ws.ancestors(id)
  return anc.length ? anc.map((a) => a.title || 'Untitled').join(' / ') + ' · ' : ''
}
