import { useNavigate } from '@tanstack/react-router'
import {
  ArrowLeftRight,
  Download,
  EyeOff,
  Eye,
  Globe,
  ImageIcon,
  Link2,
  MoreHorizontal,
  Smile,
  Star,
  Trash2,
  Undo2,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Editor } from '@tiptap/react'
import { getApp, usePage, useWs } from '#/lib/app'
import { deleteForever } from '#/lib/actions'
import { timeAgo } from '#/lib/dates'
import type { PageMeta } from '#/lib/types'
import { PageEditor } from '#/editor/PageEditor'
import { exportPageMarkdown } from '#/lib/markdown'
import { PageIcon } from './PageIcon'
import { EmojiPicker } from './EmojiPicker'
import { CoverPicker } from './CoverPicker'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from './ui/menu'
import { cn } from './ui/cn'
import { toast } from './ui/toast'
import { useOpenPage } from './Sidebar'
import { TocRail } from './TocRail'
import { DatabaseView } from './database/DatabaseView'
import { RowProperties } from './database/RowProperties'
import { TodoToolbar } from './todo/TodoToolbar'
import { MeetingPanel } from './meeting/MeetingPanel'
import { ReportToolbar } from './todo/ReportToolbar'
import { SharePopover } from './SharePopover'
import { aiExtensions } from '#/ai/extensions'
import { useDocumentTitle } from '#/lib/title'
import { TodoDecorations } from '#/todo/plugin'

export function PageView({ pageId }: { pageId: string }) {
  const page = usePage(pageId)
  useDocumentTitle(page ? `${page.icon && !page.icon.startsWith('/') && !page.icon.startsWith('http') ? page.icon + ' ' : ''}${page.title || 'Untitled'}` : null)
  const scroller = useRef<HTMLDivElement>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const kind = page?.kind
  const extra = useMemo(
    () => (page ? [...(page.kind === 'todo' ? [TodoDecorations.configure({ pageId: page.id })] : []), ...aiExtensions(page)] : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageId, kind],
  )

  useEffect(() => {
    try {
      localStorage.setItem('gunita:last-page', pageId)
    } catch {
      /* ignore */
    }
    scroller.current?.scrollTo(0, 0)
    setEditor(null)
  }, [pageId])

  if (!page) {
    return (
      <div className="grid h-full place-items-center text-muted">
        <div className="text-center">
          <p>This page doesn't exist on this device yet.</p>
          <p className="mt-1 text-sm text-faint">If you just created it on another device, it will appear after syncing.</p>
        </div>
      </div>
    )
  }

  const wide = page.fullWidth || page.kind === 'database'
  return (
    <div ref={scroller} className="h-full overflow-y-auto" id="page-scroller">
      <TopBar page={page} />
      {page.trashedAt && <TrashBanner page={page} />}
      <Cover page={page} />
      <div className={cn('mx-auto px-6 sm:px-14 lg:px-24', wide ? 'max-w-none' : 'max-w-[900px]')}>
        <Header page={page} />
        {page.kind === 'database' ? (
          <DatabaseView page={page} />
        ) : (
          <>
            {page.kind === 'row' && <RowProperties page={page} />}
            {page.kind === 'todo' && <TodoToolbar page={page} editor={editor} />}
            {page.kind === 'meeting' && <MeetingPanel page={page} editor={editor} />}
            {page.reportFor && <ReportToolbar page={page} editor={editor} />}
            <PageEditor key={page.id} pageId={page.id} onReady={setEditor} extra={extra} />
          </>
        )}
      </div>
      {page.kind !== 'database' && editor && <TocRail editor={editor} scroller={scroller} />}
    </div>
  )
}

function TrashBanner({ page }: { page: PageMeta }) {
  const navigate = useNavigate()
  return (
    <div className="flex items-center justify-center gap-3 bg-danger py-2 text-sm text-white">
      This page is in the trash.
      <button className="flex items-center gap-1 rounded border border-white/60 px-2 py-0.5" onClick={() => getApp().ws.restorePage(page.id)}>
        <Undo2 className="h-3.5 w-3.5" /> Restore
      </button>
      <button
        className="rounded border border-white/60 px-2 py-0.5"
        onClick={async () => {
          if (!confirm('Delete this page forever?')) return
          await deleteForever(page.id)
          void navigate({ to: '/' })
        }}
      >
        Delete forever
      </button>
    </div>
  )
}

function TopBar({ page }: { page: PageMeta }) {
  const openPage = useOpenPage()
  const navigate = useNavigate()
  const ancestors = useWs(() => getApp().ws.ancestors(page.id))
  return (
    <div className="sticky top-0 z-20 flex h-11 items-center gap-1 bg-bg/95 px-3 backdrop-blur">
      <div className="flex min-w-0 flex-1 items-center gap-0.5 text-sm">
        {[...ancestors, page].map((p, i) => (
          <span key={p.id} className="flex min-w-0 items-center">
            {i > 0 && <span className="px-1 text-faint">/</span>}
            <button onClick={() => openPage(p.id)} className="flex min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-hover">
              <PageIcon icon={p.icon} kind={p.kind} size={15} />
              <span className="truncate">{p.title || 'Untitled'}</span>
            </button>
          </span>
        ))}
      </div>
      <span className="mr-2 hidden text-xs text-faint sm:inline">Edited {timeAgo(page.updatedAt)}</span>
      <SharePopover page={page} />
      <IconBtn title={page.favorite ? 'Remove from favorites' : 'Add to favorites'} onClick={() => getApp().ws.updatePage(page.id, { favorite: page.favorite ? undefined : true })}>
        <Star className={cn('h-4 w-4', page.favorite && 'fill-[#e9a800] text-[#e9a800]')} />
      </IconBtn>
      <Menu>
        <MenuTrigger asChild>
          <button className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-hover" aria-label="More">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </MenuTrigger>
        <MenuContent align="end" className="w-64">
          <MenuItem icon={<ArrowLeftRight />} onSelect={() => getApp().ws.updatePage(page.id, { fullWidth: page.fullWidth ? undefined : true })}>
            {page.fullWidth ? 'Normal width' : 'Full width'}
          </MenuItem>
          <MenuItem
            icon={page.hiddenFromAI ? <Eye /> : <EyeOff />}
            onSelect={() => getApp().ws.updatePage(page.id, { hiddenFromAI: page.hiddenFromAI ? undefined : true })}
          >
            {page.hiddenFromAI ? 'Let AI read this page' : 'Hide from AI'}
          </MenuItem>
          <MenuItem
            icon={<Link2 />}
            onSelect={() => {
              void navigator.clipboard.writeText(`${location.origin}/p/${page.id}`)
              toast('Link copied')
            }}
          >
            Copy link
          </MenuItem>
          <MenuItem icon={<Download />} onSelect={() => void exportPageMarkdown(page.id)}>
            Export as Markdown
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            icon={<Trash2 />}
            danger
            onSelect={() => {
              getApp().ws.trashPage(page.id)
              toast('Moved to trash', { label: 'Undo', run: () => getApp().ws.restorePage(page.id) })
              void navigate({ to: '/' })
            }}
          >
            Move to trash
          </MenuItem>
          {page.hiddenFromAI && (
            <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-faint">
              <Globe className="h-3.5 w-3.5" /> AI can't see this page or its sub-pages.
            </div>
          )}
        </MenuContent>
      </Menu>
    </div>
  )
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button title={title} onClick={onClick} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-hover">
      {children}
    </button>
  )
}

function Cover({ page }: { page: PageMeta }) {
  const [repos, setRepos] = useState(false)
  const [open, setOpen] = useState(false)
  if (!page.cover) return null
  const c = page.cover
  const style =
    c.kind === 'gradient'
      ? { background: c.value }
      : { backgroundImage: `url("${c.value}")`, backgroundSize: 'cover', backgroundPosition: `center ${c.y ?? 50}%` }

  const drag = (e: React.MouseEvent) => {
    if (!repos) return
    const startY = e.clientY
    const startPos = c.y ?? 50
    const move = (ev: MouseEvent) => {
      const y = Math.max(0, Math.min(100, startPos - ((ev.clientY - startY) / 280) * 100))
      getApp().ws.updatePage(page.id, { cover: { ...c, y } })
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return (
    <div className={cn('group relative h-[30vh] max-h-[280px] min-h-[160px] w-full', repos && 'cursor-move')} style={style} onMouseDown={drag}>
      {c.credit && <span className="absolute bottom-2 left-3 hidden text-[11px] text-white/80 drop-shadow group-hover:block">{c.credit}</span>}
      <div className="absolute bottom-3 right-4 hidden gap-1 group-hover:flex">
        {repos ? (
          <button className="rounded-md bg-popover/90 px-2 py-1 text-xs shadow" onClick={() => setRepos(false)}>
            Save position
          </button>
        ) : (
          <>
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <button className="rounded-md bg-popover/90 px-2 py-1 text-xs shadow">Change cover</button>
              </PopoverTrigger>
              <PopoverContent align="end">
                <CoverPicker
                  onPick={(cover) => {
                    getApp().ws.updatePage(page.id, { cover })
                    setOpen(false)
                  }}
                  onRemove={() => {
                    getApp().ws.updatePage(page.id, { cover: undefined })
                    setOpen(false)
                  }}
                />
              </PopoverContent>
            </Popover>
            {c.kind === 'image' && (
              <button className="rounded-md bg-popover/90 px-2 py-1 text-xs shadow" onClick={() => setRepos(true)}>
                Reposition
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Header({ page }: { page: PageMeta }) {
  const [iconOpen, setIconOpen] = useState(false)
  const [coverOpen, setCoverOpen] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0'
    el.style.height = el.scrollHeight + 'px'
  }, [page.title])

  useEffect(() => {
    // Focus the title of brand-new pages.
    if (!page.title && Date.now() - page.createdAt < 3000) ref.current?.focus()
  }, [page.id, page.title, page.createdAt])

  const setIcon = (icon?: string) => {
    getApp().ws.updatePage(page.id, { icon })
    setIconOpen(false)
  }

  return (
    <div className={cn('group relative', page.cover ? 'pt-0' : 'pt-16')}>
      <Popover open={iconOpen} onOpenChange={setIconOpen}>
        {page.icon && (
          <PopoverTrigger asChild>
            <button className={cn('relative z-10 block rounded-lg hover:bg-hover', page.cover ? '-mt-[42px]' : '')}>
              <PageIcon icon={page.icon} size={78} />
            </button>
          </PopoverTrigger>
        )}
        <PopoverContent align="start">
          <EmojiPicker onPick={(e) => setIcon(e)} onRemove={() => setIcon(undefined)} />
        </PopoverContent>
        <div className="flex h-8 items-center gap-1 text-sm text-faint opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
          {!page.icon && (
            <PopoverTrigger asChild>
              <button className="flex items-center gap-1 rounded px-1.5 py-1 hover:bg-hover">
                <Smile className="h-4 w-4" /> Add icon
              </button>
            </PopoverTrigger>
          )}
          {!page.cover && (
            <Popover open={coverOpen} onOpenChange={setCoverOpen}>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-1 rounded px-1.5 py-1 hover:bg-hover">
                  <ImageIcon className="h-4 w-4" /> Add cover
                </button>
              </PopoverTrigger>
              <PopoverContent align="start">
                <CoverPicker
                  onPick={(cover) => {
                    getApp().ws.updatePage(page.id, { cover })
                    setCoverOpen(false)
                  }}
                />
              </PopoverContent>
            </Popover>
          )}
        </div>
      </Popover>
      <textarea
        ref={ref}
        rows={1}
        value={page.title}
        placeholder={page.kind === 'todo' ? 'TODO list' : page.kind === 'meeting' ? 'Meeting title' : 'Untitled'}
        onChange={(e) => getApp().ws.updatePage(page.id, { title: e.target.value.replace(/\n/g, ' ') })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            const ed = document.querySelector<HTMLElement>('.gunita-editor')
            ed?.focus()
          }
        }}
        className="mb-2 mt-1 block w-full resize-none overflow-hidden bg-transparent text-[40px] font-bold leading-tight outline-none placeholder:text-faint/60"
      />
    </div>
  )
}
