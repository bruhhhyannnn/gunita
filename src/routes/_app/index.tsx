import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { CalendarClock, CheckSquare, FileText, Plus, Sun, Table2 } from 'lucide-react'
import { useEffect } from 'react'
import { getApp, useApp, useWs } from '#/lib/app'
import { createPageOfKind, defaultWorkTemplate } from '#/lib/actions'
import { isoDate, longDate, timeAgo } from '#/lib/dates'
import type { PageKind } from '#/lib/types'
import { PageIcon } from '#/components/PageIcon'
import { useOpenPage } from '#/components/Sidebar'
import { setUi } from '#/lib/ui'

export const Route = createFileRoute('/_app/')({
  component: Home,
  validateSearch: (s: Record<string, unknown>): { start?: string; capture?: string } => ({
    ...(typeof s.start === 'string' ? { start: s.start } : {}),
    ...(s.capture ? { capture: '1' } : {}),
  }),
})

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function Home() {
  const { user, index } = useApp()
  const openPage = useOpenPage()
  const navigate = useNavigate()
  const search = Route.useSearch()
  const recent = useWs((s) =>
    Object.values(s.pages)
      .filter((p) => !p.trashedAt)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 8),
  )
  const lists = useWs((s) =>
    Object.values(s.pages)
      .filter((p) => p.kind === 'todo' && !p.trashedAt)
      .sort((a, b) => (a.order < b.order ? -1 : 1)),
  )
  const today = isoDate()

  useEffect(() => {
    if (search.start === 'today' && lists[0]) {
      void navigate({ to: '/p/$pageId', params: { pageId: lists[0].id }, search: { start: 'today' } as never })
    }
    if (search.capture) setUi({ paletteOpen: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.start, search.capture])

  const create = (kind: PageKind) => openPage(createPageOfKind(kind))
  const createWorkList = () => {
    const id = getApp().ws.createPage({
      kind: 'todo',
      title: 'Work TODO',
      icon: '☀️',
      template: defaultWorkTemplate(),
      autoStart: true,
    })
    openPage(id)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[900px] px-6 pb-24 pt-16 sm:px-14">
        <p className="text-sm text-faint">{longDate(today)}</p>
        <h1 className="mt-1 text-3xl font-bold">
          {greeting()}
          {user.name ? `, ${user.name.split(' ')[0]}` : ''}
        </h1>

        <section className="mt-10">
          <h2 className="mb-3 text-sm font-medium text-muted">Today</h2>
          {lists.length === 0 ? (
            <button
              onClick={createWorkList}
              className="flex w-full items-center gap-4 rounded-xl border border-line p-5 text-left hover:bg-hover"
            >
              <Sun className="h-8 w-8 text-[#e9a800]" />
              <div>
                <div className="font-semibold">Create your Work TODO list</div>
                <div className="text-sm text-muted">
                  Starts with your daily template (emails, CSC jobs, CWA accomplishment). Unfinished tasks carry over every day.
                </div>
              </div>
            </button>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {lists.map((l) => {
                const started = index.get(l.id)?.days.includes(today)
                const open = (index.get(l.id)?.tasks ?? []).filter((t) => !t.checked && !t.status && t.day === today).length
                return (
                  <button
                    key={l.id}
                    onClick={() => void navigate({ to: '/p/$pageId', params: { pageId: l.id }, search: { start: started ? undefined : 'today' } as never })}
                    className="flex items-center gap-3 rounded-xl border border-line p-4 text-left hover:bg-hover"
                  >
                    <PageIcon icon={l.icon} kind="todo" size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{l.title || 'TODO'}</div>
                      <div className="text-sm text-muted">{started ? `${open} open task${open === 1 ? '' : 's'} today` : 'Tap to start today'}</div>
                    </div>
                    {!started && <span className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white">Start today</span>}
                  </button>
                )
              })}
            </div>
          )}
        </section>

        <section className="mt-10">
          <h2 className="mb-3 text-sm font-medium text-muted">Recently visited</h2>
          {recent.length === 0 ? (
            <p className="text-sm text-faint">Nothing yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {recent.map((p) => (
                <button key={p.id} onClick={(e) => openPage(p.id, e)} className="overflow-hidden rounded-xl border border-line text-left hover:bg-hover">
                  <div
                    className="h-14 bg-subtle"
                    style={
                      p.cover
                        ? p.cover.kind === 'gradient'
                          ? { background: p.cover.value }
                          : { backgroundImage: `url("${p.cover.value}")`, backgroundSize: 'cover', backgroundPosition: `center ${p.cover.y ?? 50}%` }
                        : undefined
                    }
                  />
                  <div className="px-3 pb-3">
                    <div className="-mt-3">
                      <PageIcon icon={p.icon} kind={p.kind} size={26} />
                    </div>
                    <div className="mt-1 truncate text-sm font-medium">{p.title || 'Untitled'}</div>
                    <div className="text-xs text-faint">{timeAgo(p.updatedAt)}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="mt-10">
          <h2 className="mb-3 text-sm font-medium text-muted">Create</h2>
          <div className="flex flex-wrap gap-2">
            {[
              { k: 'page' as const, l: 'Page', i: FileText },
              { k: 'todo' as const, l: 'TODO list', i: CheckSquare },
              { k: 'database' as const, l: 'Database', i: Table2 },
              { k: 'meeting' as const, l: 'Meeting note', i: CalendarClock },
            ].map(({ k, l, i: Icon }) => (
              <button key={k} onClick={() => create(k)} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-hover">
                <Plus className="h-3.5 w-3.5 text-faint" />
                <Icon className="h-4 w-4 text-muted" />
                {l}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
