import { useNavigate, useRouterState } from '@tanstack/react-router'
import {
  Brain,
  CalendarClock,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  Copy,
  FileText,
  Home,
  LogOut,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Sparkles,
  Star,
  StarOff,
  Table2,
  Trash2,
  Undo2,
  ExternalLink,
} from 'lucide-react'
import { useState, type DragEvent, type MouseEvent } from 'react'
import { getApp, useApp, useSyncState, useWs } from '#/lib/app'
import { createPageOfKind, deleteForever, duplicatePage, pagePath, trashPage } from '#/lib/actions'
import { openTab } from '#/lib/tabs'
import { setUi, useUi } from '#/lib/ui'
import { setLocalUser } from '#/lib/session'
import type { PageKind, PageMeta } from '#/lib/types'
import { timeAgo } from '#/lib/dates'
import { PageIcon } from './PageIcon'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from './ui/menu'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { cn } from './ui/cn'
import { toast } from './ui/toast'

export function useOpenPage() {
  const navigate = useNavigate()
  return (id: string, e?: { metaKey?: boolean; ctrlKey?: boolean; button?: number }) => {
    const path = pagePath(id)
    if (e && (e.metaKey || e.ctrlKey || e.button === 1)) openTab(path)
    void navigate({ to: '/p/$pageId', params: { pageId: id } })
    if (getUiMobile()) setUi({ sidebarOpen: false })
  }
}

function getUiMobile() {
  return typeof window !== 'undefined' && window.innerWidth < 768
}

const NEW_KINDS: { kind: PageKind; label: string; icon: typeof FileText }[] = [
  { kind: 'page', label: 'Page', icon: FileText },
  { kind: 'todo', label: 'TODO list', icon: CheckSquare },
  { kind: 'database', label: 'Database', icon: Table2 },
  { kind: 'meeting', label: 'Meeting note', icon: CalendarClock },
]

export function Sidebar() {
  const open = useUi((s) => s.sidebarOpen)
  const width = useUi((s) => s.sidebarWidth)
  const mobile = useUi((s) => s.mobile)
  const navigate = useNavigate()
  const openPage = useOpenPage()
  const roots = useWs((s) =>
    Object.values(s.pages)
      .filter((p) => p.parentId === null && !p.trashedAt && p.kind !== 'row')
      .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0)),
  )
  const favorites = useWs((s) =>
    Object.values(s.pages)
      .filter((p) => p.favorite && !p.trashedAt)
      .sort((a, b) => a.title.localeCompare(b.title)),
  )
  const [dropRoot, setDropRoot] = useState(false)

  if (!open) return null

  const create = (kind: PageKind, parentId: string | null = null) => {
    const id = createPageOfKind(kind, { parentId })
    if (parentId) setUi((s) => ({ expanded: { ...s.expanded, [parentId]: true } }))
    openPage(id)
  }

  const startResize = (e: MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = width
    const move = (ev: globalThis.MouseEvent) => setUi({ sidebarWidth: Math.min(420, Math.max(200, startW + ev.clientX - startX)) })
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return (
    <>
      {mobile && <div className="fixed inset-0 z-30 bg-black/40" onClick={() => setUi({ sidebarOpen: false })} />}
      <aside
        className={cn(
          'group/sidebar relative flex h-full flex-none flex-col bg-sidebar text-[14px] text-muted',
          mobile && 'fixed inset-y-0 left-0 z-40 shadow-pop',
        )}
        style={{ width: mobile ? Math.min(300, window.innerWidth - 48) : width }}
      >
        <UserMenu />

        <div className="px-1.5">
          <NavItem icon={<Search />} label="Search" hint="Ctrl K" onClick={() => setUi({ paletteOpen: true })} />
          <NavItem icon={<Sparkles />} label="Ask my notes" onClick={() => setUi((s) => ({ askOpen: !s.askOpen }))} />
          <NavItem icon={<Home />} label="Home" onClick={() => void navigate({ to: '/' })} />
          <NavItem icon={<Brain />} label="Brain" onClick={() => void navigate({ to: '/brain' })} />
          <NavItem icon={<Settings />} label="Settings" onClick={() => void navigate({ to: '/settings' })} />
        </div>

        <div className="mt-3 flex-1 overflow-y-auto px-1.5 pb-4">
          {favorites.length > 0 && (
            <Section title="Favorites">
              {favorites.map((p) => (
                <TreeItem key={'fav-' + p.id} page={p} depth={0} favoriteRow />
              ))}
            </Section>
          )}
          <Section
            title="Pages"
            action={
              <Menu>
                <MenuTrigger asChild>
                  <button className="rounded p-0.5 opacity-0 hover:bg-active group-hover/section:opacity-100" aria-label="New page">
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </MenuTrigger>
                <MenuContent align="start">
                  {NEW_KINDS.map((k) => (
                    <MenuItem key={k.kind} icon={<k.icon />} onSelect={() => create(k.kind)}>
                      {k.label}
                    </MenuItem>
                  ))}
                </MenuContent>
              </Menu>
            }
          >
            <div
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes('application/x-gunita-page')) {
                  e.preventDefault()
                  setDropRoot(true)
                }
              }}
              onDragLeave={() => setDropRoot(false)}
              onDrop={(e) => {
                setDropRoot(false)
                const id = e.dataTransfer.getData('application/x-gunita-page')
                if (id && e.target === e.currentTarget) getApp().ws.movePage(id, null)
              }}
              className={cn('min-h-6 rounded', dropRoot && 'bg-accent-soft')}
            >
              {roots.map((p) => (
                <TreeItem key={p.id} page={p} depth={0} />
              ))}
              {roots.length === 0 && <p className="px-2 py-1 text-xs text-faint">No pages yet</p>}
            </div>
          </Section>
          <div className="mt-1">
            {NEW_KINDS.slice(0, 2).map((k) => (
              <NavItem key={k.kind} icon={<Plus />} label={`New ${k.label.toLowerCase()}`} onClick={() => create(k.kind)} />
            ))}
          </div>
        </div>

        <div className="border-t border-line px-1.5 py-1.5">
          <TrashButton />
          <SyncBadge />
        </div>

        {!mobile && (
          <div
            onMouseDown={startResize}
            className="absolute inset-y-0 -right-1 w-2 cursor-col-resize opacity-0 hover:opacity-100"
          >
            <div className="mx-auto h-full w-0.5 bg-line" />
          </div>
        )}
      </aside>
    </>
  )
}

function UserMenu() {
  const { user } = useApp()
  const navigate = useNavigate()
  return (
    <div className="flex items-center gap-1 px-1.5 pb-1 pt-2">
      <Menu>
        <MenuTrigger asChild>
          <button className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-fg hover:bg-hover">
            {user.picture ? (
              <img src={user.picture} alt="" className="h-5 w-5 rounded" referrerPolicy="no-referrer" />
            ) : (
              <span className="grid h-5 w-5 place-items-center rounded bg-active text-[11px] font-semibold">
                {(user.name || 'G')[0]}
              </span>
            )}
            <span className="truncate font-medium">{user.name ? `${user.name.split(' ')[0]}'s Gunita` : 'Gunita'}</span>
            <ChevronDown className="h-3.5 w-3.5 flex-none text-faint" />
          </button>
        </MenuTrigger>
        <MenuContent align="start" className="w-64">
          <div className="px-2 py-1.5 text-xs text-faint">{user.email}</div>
          <MenuItem icon={<Settings />} onSelect={() => void navigate({ to: '/settings' })}>
            Settings
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            icon={<LogOut />}
            onSelect={async () => {
              await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
              setLocalUser(null)
              location.href = '/login'
            }}
          >
            Sign out
          </MenuItem>
        </MenuContent>
      </Menu>
      <button
        className="rounded p-1 text-faint opacity-0 hover:bg-hover group-hover/sidebar:opacity-100"
        onClick={() => setUi({ sidebarOpen: false })}
        title="Close sidebar (Ctrl \)"
      >
        <ChevronsLeft className="h-4 w-4" />
      </button>
    </div>
  )
}

function NavItem({ icon, label, hint, onClick }: { icon: React.ReactNode; label: string; hint?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex h-[30px] w-full items-center gap-2 rounded-md px-2 hover:bg-hover">
      <span className="flex w-5 justify-center [&>svg]:h-[17px] [&>svg]:w-[17px]">{icon}</span>
      <span className="flex-1 truncate text-left">{label}</span>
      {hint && <span className="text-[11px] text-faint">{hint}</span>}
    </button>
  )
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="group/section mb-3">
      <div className="flex h-7 items-center justify-between px-2 text-xs font-medium text-faint">
        <span>{title}</span>
        {action}
      </div>
      {children}
    </div>
  )
}

function TreeItem({ page, depth, favoriteRow }: { page: PageMeta; depth: number; favoriteRow?: boolean }) {
  const openPage = useOpenPage()
  const expandKey = (favoriteRow ? 'fav:' : '') + page.id
  const expanded = useUi((s) => !!s.expanded[expandKey])
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const active = pathname === pagePath(page.id)
  const children = useWs((s) =>
    Object.values(s.pages)
      .filter((p) => p.parentId === page.id && !p.trashedAt && p.kind !== 'row')
      .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0)),
  )
  const [drop, setDrop] = useState<'before' | 'inside' | 'after' | null>(null)

  const toggle = () => setUi((s) => ({ expanded: { ...s.expanded, [expandKey]: !s.expanded[expandKey] } }))

  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes('application/x-gunita-page')) return
    e.preventDefault()
    e.stopPropagation()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const y = e.clientY - r.top
    setDrop(y < r.height * 0.28 ? 'before' : y > r.height * 0.72 ? 'after' : 'inside')
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const id = e.dataTransfer.getData('application/x-gunita-page')
    const where = drop
    setDrop(null)
    if (!id || id === page.id) return
    const { ws } = getApp()
    if (where === 'inside') {
      ws.movePage(id, page.id)
      setUi((s) => ({ expanded: { ...s.expanded, [page.id]: true } }))
    } else if (where === 'before') {
      ws.movePage(id, page.parentId, page.id)
    } else {
      const sibs = ws.children(page.parentId)
      const idx = sibs.findIndex((s) => s.id === page.id)
      ws.movePage(id, page.parentId, sibs[idx + 1]?.id ?? null)
    }
  }

  const addChild = (kind: PageKind) => {
    const id = createPageOfKind(kind, { parentId: page.id })
    setUi((s) => ({ expanded: { ...s.expanded, [expandKey]: true } }))
    openPage(id)
  }

  return (
    <div>
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('application/x-gunita-page', page.id)
          e.dataTransfer.effectAllowed = 'move'
        }}
        onDragOver={onDragOver}
        onDragLeave={() => setDrop(null)}
        onDrop={onDrop}
        onClick={(e) => openPage(page.id, e)}
        onAuxClick={(e) => e.button === 1 && openPage(page.id, e)}
        className={cn(
          'group/item relative flex h-[30px] cursor-pointer items-center gap-1 rounded-md pr-1 hover:bg-hover',
          active && 'bg-active text-fg',
          drop === 'inside' && 'bg-accent-soft',
        )}
        style={{ paddingLeft: 4 + depth * 14 }}
      >
        {drop === 'before' && <div className="absolute inset-x-1 top-0 h-0.5 rounded bg-accent" />}
        {drop === 'after' && <div className="absolute inset-x-1 bottom-0 h-0.5 rounded bg-accent" />}
        <button
          className="grid h-5 w-5 flex-none place-items-center rounded text-faint hover:bg-active"
          onClick={(e) => {
            e.stopPropagation()
            toggle()
          }}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          <span className="group-hover/item:hidden">
            <PageIcon icon={page.icon} kind={page.kind} size={17} />
          </span>
          <span className="hidden group-hover/item:block">
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </span>
        </button>
        <span className={cn('flex-1 truncate', !page.title && 'text-faint')}>{page.title || 'Untitled'}</span>
        {/* Stay visible while a menu is open so it stays anchored next to this row. */}
        <div className="hidden items-center group-hover/item:flex has-[[data-state=open]]:flex" onClick={(e) => e.stopPropagation()}>
          <PageMenu page={page} />
          <Menu>
            <MenuTrigger asChild>
              <button className="grid h-5 w-5 place-items-center rounded hover:bg-active" aria-label="Add sub-page">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </MenuTrigger>
            <MenuContent align="start">
              {NEW_KINDS.map((k) => (
                <MenuItem key={k.kind} icon={<k.icon />} onSelect={() => addChild(k.kind)}>
                  {k.label}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
        </div>
      </div>
      {expanded && (
        <div>
          {children.map((c) => (
            <TreeItem key={c.id} page={c} depth={depth + 1} favoriteRow={favoriteRow} />
          ))}
          {children.length === 0 && (
            <div className="h-[26px] truncate text-xs leading-[26px] text-faint" style={{ paddingLeft: 30 + depth * 14 }}>
              {page.kind === 'database' ? 'Rows live inside the database' : 'No pages inside'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function PageMenu({ page, onDeleted }: { page: PageMeta; onDeleted?: () => void }) {
  const openPage = useOpenPage()
  return (
    <Menu>
      <MenuTrigger asChild>
        <button className="grid h-5 w-5 place-items-center rounded hover:bg-active" aria-label="Page options">
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </MenuTrigger>
      <MenuContent align="start">
        <MenuItem
          icon={page.favorite ? <StarOff /> : <Star />}
          onSelect={() => getApp().ws.updatePage(page.id, { favorite: page.favorite ? undefined : true })}
        >
          {page.favorite ? 'Remove from favorites' : 'Add to favorites'}
        </MenuItem>
        <MenuItem
          icon={<Copy />}
          onSelect={() => {
            const id = duplicatePage(page.id)
            if (id) openPage(id)
          }}
        >
          Duplicate
        </MenuItem>
        <MenuItem icon={<ExternalLink />} onSelect={() => openPage(page.id, { ctrlKey: true })}>
          Open in new tab
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          icon={<Trash2 />}
          danger
          onSelect={() => {
            trashPage(page.id)
            onDeleted?.()
            toast('Moved to trash', { label: 'Undo', run: () => getApp().ws.restorePage(page.id) })
          }}
        >
          Move to trash
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

function TrashButton() {
  const trashed = useWs((s) =>
    Object.values(s.pages)
      .filter((p) => p.trashedAt)
      .sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0)),
  )
  const openPage = useOpenPage()
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex h-[30px] w-full items-center gap-2 rounded-md px-2 hover:bg-hover">
          <Trash2 className="h-4 w-4" />
          <span className="flex-1 text-left">Trash</span>
          {trashed.length > 0 && <span className="text-xs text-faint">{trashed.length}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="end" className="w-80 p-1">
        {trashed.length === 0 && <p className="p-3 text-sm text-muted">Trash is empty.</p>}
        <div className="max-h-80 overflow-y-auto">
          {trashed.map((p) => (
            <div key={p.id} className="group flex h-9 items-center gap-2 rounded-md px-2 hover:bg-hover">
              <PageIcon icon={p.icon} kind={p.kind} size={16} />
              <button className="flex-1 truncate text-left" onClick={() => openPage(p.id)}>
                {p.title || 'Untitled'}
                <span className="ml-2 text-xs text-faint">{p.trashedAt ? timeAgo(p.trashedAt) : ''}</span>
              </button>
              <button title="Restore" className="rounded p-1 hover:bg-active" onClick={() => getApp().ws.restorePage(p.id)}>
                <Undo2 className="h-4 w-4" />
              </button>
              <button
                title="Delete forever"
                className="rounded p-1 text-danger hover:bg-active"
                onClick={() => {
                  if (confirm(`Delete "${p.title || 'Untitled'}" and its sub-pages forever?`)) void deleteForever(p.id)
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function SyncBadge() {
  const s = useSyncState()
  const label =
    s.status === 'syncing'
      ? 'Syncing…'
      : s.status === 'offline'
        ? `Offline · ${s.pending} unsynced`
        : s.status === 'signed-out'
          ? 'Signed out · sign in to sync'
          : s.status === 'error'
            ? 'Sync error · retrying'
            : s.lastSyncedAt
              ? `Synced ${timeAgo(s.lastSyncedAt)}`
              : 'Saved on this device'
  const dot =
    s.status === 'syncing' ? 'bg-accent animate-pulse' : s.status === 'idle' ? 'bg-green-500' : s.status === 'offline' ? 'bg-yellow-500' : 'bg-danger'
  return (
    <a
      href={s.status === 'signed-out' ? '/login' : undefined}
      title={s.error}
      className="flex h-7 items-center gap-2 px-2 text-xs text-faint"
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />
      {label}
    </a>
  )
}
