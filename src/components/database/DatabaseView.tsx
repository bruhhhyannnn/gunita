import { useNavigate } from '@tanstack/react-router'
import {
  ArrowDownUp,
  Calendar as CalendarIcon,
  Filter,
  KanbanSquare,
  List as ListIcon,
  Maximize2,
  Plus,
  Search,
  Table2,
  Trash2,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { getApp, useWs } from '#/lib/app'
import { addRow, addView, deleteView, updateView, viewRows } from '#/lib/database'
import type { PageMeta, ViewDef, ViewType } from '#/lib/types'
import { PageIcon } from '../PageIcon'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../ui/menu'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { cn } from '../ui/cn'
import { TableView } from './TableView'
import { BoardView } from './BoardView'
import { CalendarView } from './CalendarView'
import { ListView } from './ListView'

const VIEW_ICONS: Record<ViewType, typeof Table2> = { table: Table2, board: KanbanSquare, calendar: CalendarIcon, list: ListIcon }

export function useRows(dbId: string) {
  return useWs((s) =>
    Object.values(s.pages)
      .filter((p) => p.parentId === dbId && p.kind === 'row' && !p.trashedAt)
      .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0)),
  )
}

export function useOpenRow() {
  const navigate = useNavigate()
  return (id: string) => void navigate({ to: '/p/$pageId', params: { pageId: id } })
}

export function DatabaseView({ page, inline }: { page: PageMeta; inline?: boolean }) {
  const db = page.db
  const rows = useRows(page.id)
  const [viewId, setViewId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [searching, setSearching] = useState(false)
  const navigate = useNavigate()
  const views = db?.views ?? []
  const view = views.find((v) => v.id === viewId) ?? views[0]
  const shown = useMemo(() => viewRows(page, rows, view, search), [page, rows, view, search])

  if (!db || !view) return <p className="text-muted">This database has no schema.</p>

  const newRow = () => {
    const id = addRow(page.id)
    void navigate({ to: '/p/$pageId', params: { pageId: id } })
  }

  return (
    <div className={cn(inline ? '' : 'pb-24')}>
      {inline && (
        <button
          onClick={() => void navigate({ to: '/p/$pageId', params: { pageId: page.id } })}
          className="mb-1 flex items-center gap-2 rounded px-1 py-0.5 text-lg font-semibold hover:bg-hover"
        >
          <PageIcon icon={page.icon} kind="database" size={20} />
          {page.title || 'Untitled database'}
          <Maximize2 className="h-3.5 w-3.5 text-faint" />
        </button>
      )}
      <div className="flex flex-wrap items-center gap-1 border-b border-line pb-1">
        {views.map((v) => {
          const Icon = VIEW_ICONS[v.type]
          return (
            <Menu key={v.id}>
              <MenuTrigger asChild>
                <button
                  onClick={(e) => {
                    if (v.id !== view.id) {
                      e.preventDefault()
                      setViewId(v.id)
                    }
                  }}
                  onPointerDown={(e) => {
                    if (v.id !== view.id) {
                      e.preventDefault()
                      setViewId(v.id)
                    }
                  }}
                  className={cn(
                    'flex h-7 items-center gap-1.5 rounded-md px-2 text-sm',
                    v.id === view.id ? 'font-medium text-fg' : 'text-muted hover:bg-hover',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {v.name}
                </button>
              </MenuTrigger>
              <MenuContent align="start">
                <div className="px-1 pb-1">
                  <input
                    defaultValue={v.name}
                    onBlur={(e) => updateView(page.id, v.id, { name: e.target.value || v.name })}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    className="h-7 w-full rounded bg-hover px-2 text-sm outline-none"
                  />
                </div>
                <ViewOptions db={page} view={v} />
                {views.length > 1 && (
                  <>
                    <MenuSeparator />
                    <MenuItem icon={<Trash2 />} danger onSelect={() => deleteView(page.id, v.id)}>
                      Delete view
                    </MenuItem>
                  </>
                )}
              </MenuContent>
            </Menu>
          )
        })}
        <Menu>
          <MenuTrigger asChild>
            <button className="grid h-7 w-7 place-items-center rounded-md text-faint hover:bg-hover" aria-label="Add view">
              <Plus className="h-4 w-4" />
            </button>
          </MenuTrigger>
          <MenuContent align="start">
            {(Object.keys(VIEW_ICONS) as ViewType[]).map((t) => {
              const Icon = VIEW_ICONS[t]
              return (
                <MenuItem key={t} icon={<Icon />} onSelect={() => setViewId(addView(page.id, t))}>
                  {t[0].toUpperCase() + t.slice(1)}
                </MenuItem>
              )
            })}
          </MenuContent>
        </Menu>
        <div className="flex-1" />
        {searching ? (
          <div className="flex h-7 items-center gap-1 rounded-md bg-hover px-2">
            <Search className="h-3.5 w-3.5 text-faint" />
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="w-32 bg-transparent text-sm outline-none" />
            <button
              onClick={() => {
                setSearch('')
                setSearching(false)
              }}
            >
              <X className="h-3.5 w-3.5 text-faint" />
            </button>
          </div>
        ) : (
          <button className="grid h-7 w-7 place-items-center rounded-md text-faint hover:bg-hover" onClick={() => setSearching(true)} aria-label="Search">
            <Search className="h-4 w-4" />
          </button>
        )}
        <FilterButton db={page} view={view} />
        <SortButton db={page} view={view} />
        <button onClick={newRow} className="ml-1 h-7 rounded-md bg-accent px-3 text-sm font-medium text-white hover:opacity-90">
          New
        </button>
      </div>

      <div className="mt-1">
        {view.type === 'table' && <TableView db={page} view={view} rows={shown} />}
        {view.type === 'board' && <BoardView db={page} view={view} rows={shown} />}
        {view.type === 'calendar' && <CalendarView db={page} view={view} rows={shown} />}
        {view.type === 'list' && <ListView db={page} view={view} rows={shown} />}
      </div>
    </div>
  )
}

function ViewOptions({ db, view }: { db: PageMeta; view: ViewDef }) {
  const props = db.db?.props ?? []
  if (view.type === 'board') {
    const groupable = props.filter((p) => p.type === 'select' || p.type === 'status')
    return (
      <div className="px-2 py-1 text-sm">
        <div className="mb-1 text-xs text-faint">Group by</div>
        <select
          value={view.groupBy ?? ''}
          onChange={(e) => updateView(db.id, view.id, { groupBy: e.target.value || undefined })}
          className="h-7 w-full rounded border border-line bg-bg px-1"
        >
          <option value="">Choose a property</option>
          {groupable.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
    )
  }
  if (view.type === 'calendar') {
    const dates = props.filter((p) => p.type === 'date')
    return (
      <div className="px-2 py-1 text-sm">
        <div className="mb-1 text-xs text-faint">Show by</div>
        <select
          value={view.dateProp ?? ''}
          onChange={(e) => updateView(db.id, view.id, { dateProp: e.target.value || undefined })}
          className="h-7 w-full rounded border border-line bg-bg px-1"
        >
          <option value="">Choose a date property</option>
          {dates.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
    )
  }
  return null
}

const OPS: { op: NonNullable<ViewDef['filter']>[number]['op']; label: string; needsValue: boolean }[] = [
  { op: 'contains', label: 'contains', needsValue: true },
  { op: 'is', label: 'is', needsValue: true },
  { op: 'isNot', label: 'is not', needsValue: true },
  { op: 'empty', label: 'is empty', needsValue: false },
  { op: 'notEmpty', label: 'is not empty', needsValue: false },
  { op: 'checked', label: 'is checked', needsValue: false },
  { op: 'unchecked', label: 'is unchecked', needsValue: false },
]

function FilterButton({ db, view }: { db: PageMeta; view: ViewDef }) {
  const props = db.db?.props ?? []
  const filters = view.filter ?? []
  const set = (f: ViewDef['filter']) => updateView(db.id, view.id, { filter: f })
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={cn('grid h-7 min-w-7 place-items-center rounded-md px-1 hover:bg-hover', filters.length ? 'text-accent' : 'text-faint')} aria-label="Filter">
          <Filter className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[420px] p-2">
        {filters.length === 0 && <p className="px-1 py-1 text-sm text-muted">No filters.</p>}
        {filters.map((f, i) => {
          const prop = props.find((p) => p.id === f.prop)
          const op = OPS.find((o) => o.op === f.op)
          return (
            <div key={i} className="mb-1 flex items-center gap-1 text-sm">
              <select value={f.prop} onChange={(e) => set(filters.map((x, j) => (j === i ? { ...x, prop: e.target.value } : x)))} className="h-7 rounded border border-line bg-bg px-1">
                {props.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select value={f.op} onChange={(e) => set(filters.map((x, j) => (j === i ? { ...x, op: e.target.value as typeof f.op } : x)))} className="h-7 rounded border border-line bg-bg px-1">
                {OPS.map((o) => (
                  <option key={o.op} value={o.op}>
                    {o.label}
                  </option>
                ))}
              </select>
              {op?.needsValue &&
                (prop?.options ? (
                  <select value={f.value ?? ''} onChange={(e) => set(filters.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} className="h-7 flex-1 rounded border border-line bg-bg px-1">
                    <option value="">—</option>
                    {prop.options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input value={f.value ?? ''} onChange={(e) => set(filters.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} className="h-7 min-w-0 flex-1 rounded border border-line bg-bg px-2" />
                ))}
              <button onClick={() => set(filters.filter((_, j) => j !== i))} className="rounded p-1 hover:bg-hover">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })}
        <button onClick={() => set([...filters, { prop: props[0].id, op: 'contains', value: '' }])} className="mt-1 flex items-center gap-1 rounded px-1 py-1 text-sm text-muted hover:bg-hover">
          <Plus className="h-3.5 w-3.5" /> Add filter
        </button>
      </PopoverContent>
    </Popover>
  )
}

function SortButton({ db, view }: { db: PageMeta; view: ViewDef }) {
  const props = db.db?.props ?? []
  const sorts = view.sort ?? []
  const set = (s: ViewDef['sort']) => updateView(db.id, view.id, { sort: s })
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={cn('grid h-7 w-7 place-items-center rounded-md hover:bg-hover', sorts.length ? 'text-accent' : 'text-faint')} aria-label="Sort">
          <ArrowDownUp className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        {sorts.length === 0 && <p className="px-1 py-1 text-sm text-muted">No sorts.</p>}
        {sorts.map((s, i) => (
          <div key={i} className="mb-1 flex items-center gap-1 text-sm">
            <select value={s.prop} onChange={(e) => set(sorts.map((x, j) => (j === i ? { ...x, prop: e.target.value } : x)))} className="h-7 flex-1 rounded border border-line bg-bg px-1">
              {props.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select value={s.dir} onChange={(e) => set(sorts.map((x, j) => (j === i ? { ...x, dir: e.target.value as 'asc' | 'desc' } : x)))} className="h-7 rounded border border-line bg-bg px-1">
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
            <button onClick={() => set(sorts.filter((_, j) => j !== i))} className="rounded p-1 hover:bg-hover">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button onClick={() => set([...sorts, { prop: props[0].id, dir: 'asc' }])} className="mt-1 flex items-center gap-1 rounded px-1 py-1 text-sm text-muted hover:bg-hover">
          <Plus className="h-3.5 w-3.5" /> Add sort
        </button>
      </PopoverContent>
    </Popover>
  )
}

export function deleteRow(id: string) {
  getApp().ws.trashPage(id)
}
