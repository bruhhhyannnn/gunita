import { useNavigate, useRouterState } from '@tanstack/react-router'
import { Brain, Home, Menu as MenuIcon, Plus, Settings, X } from 'lucide-react'
import { useEffect } from 'react'
import { useWs } from '#/lib/app'
import { activateTab, closeTab, openTab, syncActiveTab, useTabs, type Tab } from '#/lib/tabs'
import { setUi, useUi } from '#/lib/ui'
import { PageIcon } from './PageIcon'
import { cn } from './ui/cn'

export function TabBar() {
  const { tabs, active } = useTabs()
  const navigate = useNavigate()
  const sidebarOpen = useUi((s) => s.sidebarOpen)
  const href = useRouterState({ select: (s) => s.location.href })

  useEffect(() => syncActiveTab(href), [href])

  const go = (t: Tab | null | undefined) => {
    if (t) void navigate({ href: t.path })
  }

  return (
    <div className="flex h-10 flex-none items-end gap-0.5 overflow-x-auto border-b border-line bg-sidebar px-1.5">
      {!sidebarOpen && (
        <button
          className="mb-1.5 mr-1 grid h-7 w-7 flex-none place-items-center rounded-md text-muted hover:bg-hover"
          onClick={() => setUi({ sidebarOpen: true })}
          aria-label="Open sidebar"
        >
          <MenuIcon className="h-4 w-4" />
        </button>
      )}
      {tabs.map((t) => (
        <TabButton
          key={t.id}
          tab={t}
          active={t.id === active}
          onClick={() => go(activateTab(t.id))}
          onClose={() => {
            const next = closeTab(t.id)
            if (next) go(next)
          }}
        />
      ))}
      <button
        className="mb-1.5 ml-1 grid h-7 w-7 flex-none place-items-center rounded-md text-muted hover:bg-hover"
        onClick={() => go(openTab('/'))}
        aria-label="New tab"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  )
}

function TabButton({ tab, active, onClick, onClose }: { tab: Tab; active: boolean; onClick: () => void; onClose: () => void }) {
  const pageId = tab.path.match(/^\/p\/([^/?#]+)/)?.[1]
  const page = useWs((s) => (pageId ? s.pages[pageId] : undefined))
  let icon = <Home className="h-3.5 w-3.5 text-muted" />
  let title = 'Home'
  if (pageId) {
    icon = <PageIcon icon={page?.icon} kind={page?.kind} size={15} />
    title = page ? page.title || 'Untitled' : 'Missing page'
  } else if (tab.path.startsWith('/brain')) {
    icon = <Brain className="h-3.5 w-3.5 text-muted" />
    title = 'Brain'
  } else if (tab.path.startsWith('/settings')) {
    icon = <Settings className="h-3.5 w-3.5 text-muted" />
    title = 'Settings'
  }
  return (
    <div
      onClick={onClick}
      onAuxClick={(e) => e.button === 1 && onClose()}
      className={cn(
        'group flex h-8 w-[200px] min-w-[110px] flex-shrink cursor-pointer items-center gap-2 rounded-t-md px-2.5 text-[13px]',
        active ? 'bg-bg text-fg' : 'text-muted hover:bg-hover',
      )}
    >
      {icon}
      <span className="flex-1 truncate">{title}</span>
      <button
        className={cn('grid h-5 w-5 place-items-center rounded hover:bg-active', !active && 'opacity-0 group-hover:opacity-100')}
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        aria-label="Close tab"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}
