import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  Calendar,
  CheckSquare,
  CircleDot,
  EyeOff,
  Hash,
  Link,
  List,
  Maximize2,
  Plus,
  Tags,
  Trash2,
  Type,
} from 'lucide-react'
import { useState, type MouseEvent } from 'react'
import { addProp, addRow, deleteProp, PROP_TYPES, updateProp, updateView } from '#/lib/database'
import type { PageMeta, PropDef, PropType, ViewDef } from '#/lib/types'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger, MenuTrigger } from '../ui/menu'
import { PageIcon } from '../PageIcon'
import { PropCell } from './PropCell'
import { deleteRow, useOpenRow } from './DatabaseView'

export const PROP_ICONS: Record<PropType, typeof Type> = {
  title: Type,
  text: AlignLeft,
  number: Hash,
  select: CircleDot,
  multiSelect: Tags,
  status: List,
  date: Calendar,
  checkbox: CheckSquare,
  url: Link,
}

export function TableView({ db, view, rows }: { db: PageMeta; view: ViewDef; rows: PageMeta[] }) {
  const props = (db.db?.props ?? []).filter((p) => !view.hidden?.includes(p.id))
  const hidden = (db.db?.props ?? []).filter((p) => view.hidden?.includes(p.id))
  const openRow = useOpenRow()
  const widths = view.widths ?? {}
  const [, setTick] = useState(0)

  const startResize = (e: MouseEvent, propId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = widths[propId] ?? (propId === 'title' ? 280 : 180)
    let latest = startW
    const move = (ev: globalThis.MouseEvent) => {
      latest = Math.max(80, startW + ev.clientX - startX)
      const th = document.querySelector<HTMLElement>(`[data-col="${view.id}-${propId}"]`)
      if (th) th.style.width = latest + 'px'
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      updateView(db.id, view.id, { widths: { ...widths, [propId]: latest } })
      setTick((t) => t + 1)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-max min-w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-muted">
            {props.map((p) => (
              <th
                key={p.id}
                data-col={`${view.id}-${p.id}`}
                className="relative border-r border-line p-0 font-normal last:border-r-0"
                style={{ width: widths[p.id] ?? (p.type === 'title' ? 280 : 180) }}
              >
                <PropHeader db={db} prop={p} view={view} />
                <div onMouseDown={(e) => startResize(e, p.id)} className="absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize hover:bg-accent/40" />
              </th>
            ))}
            <th className="w-10 p-0">
              <Menu>
                <MenuTrigger asChild>
                  <button className="grid h-8 w-10 place-items-center text-faint hover:bg-hover" aria-label="Add property">
                    <Plus className="h-4 w-4" />
                  </button>
                </MenuTrigger>
                <MenuContent align="end">
                  <MenuLabel>New property</MenuLabel>
                  {PROP_TYPES.map((t) => {
                    const Icon = PROP_ICONS[t.type]
                    return (
                      <MenuItem key={t.type} icon={<Icon />} onSelect={() => addProp(db.id, t.type)}>
                        {t.label}
                      </MenuItem>
                    )
                  })}
                  {hidden.length > 0 && (
                    <>
                      <MenuSeparator />
                      <MenuLabel>Hidden</MenuLabel>
                      {hidden.map((p) => (
                        <MenuItem key={p.id} icon={<EyeOff />} onSelect={() => updateView(db.id, view.id, { hidden: view.hidden?.filter((h) => h !== p.id) })}>
                          Show {p.name}
                        </MenuItem>
                      ))}
                    </>
                  )}
                </MenuContent>
              </Menu>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="group border-b border-line hover:bg-subtle">
              {props.map((p) => (
                <td key={p.id} className="relative h-9 border-r border-line p-0 align-middle last:border-r-0">
                  {p.type === 'title' ? (
                    <div className="flex h-full items-center">
                      {r.icon && <PageIcon icon={r.icon} size={16} className="ml-2" />}
                      <PropCell db={db} prop={p} row={r} className="flex-1" />
                      <button
                        onClick={() => openRow(r.id)}
                        className="mr-1 hidden h-6 items-center gap-1 rounded border border-line bg-popover px-1.5 text-xs text-muted shadow-sm group-hover:flex"
                      >
                        <Maximize2 className="h-3 w-3" /> Open
                      </button>
                    </div>
                  ) : (
                    <PropCell db={db} prop={p} row={r} />
                  )}
                </td>
              ))}
              <td className="p-0">
                <button onClick={() => deleteRow(r.id)} className="hidden h-9 w-10 place-items-center text-faint hover:text-danger group-hover:grid" aria-label="Delete row">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={() => addRow(db.id)} className="flex h-9 w-full items-center gap-2 px-2 text-sm text-faint hover:bg-hover">
        <Plus className="h-4 w-4" /> New row
      </button>
      <div className="px-2 py-1 text-xs text-faint">{rows.length} rows</div>
    </div>
  )
}

function PropHeader({ db, prop, view }: { db: PageMeta; prop: PropDef; view: ViewDef }) {
  const Icon = PROP_ICONS[prop.type]
  const sortBy = (dir: 'asc' | 'desc') => updateView(db.id, view.id, { sort: [{ prop: prop.id, dir }] })
  return (
    <Menu>
      <MenuTrigger asChild>
        <button className="flex h-8 w-full items-center gap-1.5 px-2 hover:bg-hover">
          <Icon className="h-3.5 w-3.5 flex-none" />
          <span className="truncate">{prop.name}</span>
        </button>
      </MenuTrigger>
      <MenuContent align="start" className="w-60">
        <div className="px-1 pb-1">
          <input
            defaultValue={prop.name}
            onBlur={(e) => e.target.value.trim() && updateProp(db.id, prop.id, { name: e.target.value.trim() })}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
            className="h-7 w-full rounded bg-hover px-2 text-sm outline-none"
          />
        </div>
        {prop.type !== 'title' && (
          <MenuSub>
            <MenuSubTrigger icon={<Icon />}>Type: {PROP_TYPES.find((t) => t.type === prop.type)?.label}</MenuSubTrigger>
            <MenuSubContent>
              {PROP_TYPES.map((t) => {
                const TIcon = PROP_ICONS[t.type]
                return (
                  <MenuItem key={t.type} icon={<TIcon />} onSelect={() => updateProp(db.id, prop.id, { type: t.type })}>
                    {t.label}
                  </MenuItem>
                )
              })}
            </MenuSubContent>
          </MenuSub>
        )}
        <MenuItem icon={<ArrowUp />} onSelect={() => sortBy('asc')}>
          Sort ascending
        </MenuItem>
        <MenuItem icon={<ArrowDown />} onSelect={() => sortBy('desc')}>
          Sort descending
        </MenuItem>
        {prop.type !== 'title' && (
          <>
            <MenuItem icon={<EyeOff />} onSelect={() => updateView(db.id, view.id, { hidden: [...(view.hidden ?? []), prop.id] })}>
              Hide in this view
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              icon={<Trash2 />}
              danger
              onSelect={() => {
                if (confirm(`Delete the "${prop.name}" property and its values?`)) deleteProp(db.id, prop.id)
              }}
            >
              Delete property
            </MenuItem>
          </>
        )}
      </MenuContent>
    </Menu>
  )
}
