import { getApp } from './app'
import { shortId } from './ids'
import type { DatabaseSchema, OptionColor, PageMeta, PropDef, PropType, SelectOption, ViewDef, ViewType } from './types'

export const OPTION_COLORS: OptionColor[] = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red']

export const PROP_TYPES: { type: PropType; label: string }[] = [
  { type: 'text', label: 'Text' },
  { type: 'number', label: 'Number' },
  { type: 'select', label: 'Select' },
  { type: 'multiSelect', label: 'Multi-select' },
  { type: 'status', label: 'Status' },
  { type: 'date', label: 'Date' },
  { type: 'checkbox', label: 'Checkbox' },
  { type: 'url', label: 'URL' },
]

function schema(dbId: string): DatabaseSchema {
  return getApp().ws.page(dbId)?.db ?? { props: [{ id: 'title', name: 'Name', type: 'title' }], views: [] }
}

function save(dbId: string, db: DatabaseSchema) {
  getApp().ws.updatePage(dbId, { db })
}

export function addProp(dbId: string, type: PropType, name?: string): string {
  const db = schema(dbId)
  const id = shortId()
  const label = PROP_TYPES.find((t) => t.type === type)?.label ?? 'Property'
  const prop: PropDef = { id, name: name ?? label, type }
  if (type === 'select' || type === 'multiSelect') prop.options = []
  if (type === 'status')
    prop.options = [
      { id: shortId(), name: 'Not started', color: 'gray' },
      { id: shortId(), name: 'In progress', color: 'blue' },
      { id: shortId(), name: 'Done', color: 'green' },
    ]
  save(dbId, { ...db, props: [...db.props, prop] })
  return id
}

export function updateProp(dbId: string, propId: string, patch: Partial<PropDef>) {
  const db = schema(dbId)
  save(dbId, {
    ...db,
    props: db.props.map((p) => {
      if (p.id !== propId) return p
      const next = { ...p, ...patch }
      if ((next.type === 'select' || next.type === 'multiSelect' || next.type === 'status') && !next.options) next.options = []
      return next
    }),
  })
}

export function deleteProp(dbId: string, propId: string) {
  const db = schema(dbId)
  save(dbId, {
    props: db.props.filter((p) => p.id !== propId),
    views: db.views.map((v) => ({
      ...v,
      groupBy: v.groupBy === propId ? undefined : v.groupBy,
      dateProp: v.dateProp === propId ? undefined : v.dateProp,
      sort: v.sort?.filter((s) => s.prop !== propId),
      filter: v.filter?.filter((f) => f.prop !== propId),
    })),
  })
}

export function addOption(dbId: string, propId: string, name: string): SelectOption {
  const db = schema(dbId)
  const prop = db.props.find((p) => p.id === propId)
  const existing = prop?.options?.find((o) => o.name.toLowerCase() === name.toLowerCase())
  if (existing) return existing
  const opt: SelectOption = { id: shortId(), name, color: OPTION_COLORS[(prop?.options?.length ?? 0) % OPTION_COLORS.length] }
  updateProp(dbId, propId, { options: [...(prop?.options ?? []), opt] })
  return opt
}

export function addView(dbId: string, type: ViewType): string {
  const db = schema(dbId)
  const id = shortId()
  const view: ViewDef = { id, type, name: type[0].toUpperCase() + type.slice(1) }
  if (type === 'board') view.groupBy = db.props.find((p) => p.type === 'status' || p.type === 'select')?.id
  if (type === 'calendar') view.dateProp = db.props.find((p) => p.type === 'date')?.id
  save(dbId, { ...db, views: [...db.views, view] })
  return id
}

export function updateView(dbId: string, viewId: string, patch: Partial<ViewDef>) {
  const db = schema(dbId)
  save(dbId, { ...db, views: db.views.map((v) => (v.id === viewId ? { ...v, ...patch } : v)) })
}

export function deleteView(dbId: string, viewId: string) {
  const db = schema(dbId)
  if (db.views.length <= 1) return
  save(dbId, { ...db, views: db.views.filter((v) => v.id !== viewId) })
}

export function addRow(dbId: string, props: Record<string, unknown> = {}, title = ''): string {
  return getApp().ws.createPage({ kind: 'row', parentId: dbId, title, props })
}

export function propValueText(prop: PropDef, value: unknown, row?: PageMeta): string {
  if (prop.type === 'title') return row?.title ?? ''
  if (value == null) return ''
  if (prop.type === 'select' || prop.type === 'status') return prop.options?.find((o) => o.id === value)?.name ?? ''
  if (prop.type === 'multiSelect')
    return ((value as string[]) ?? [])
      .map((id) => prop.options?.find((o) => o.id === id)?.name)
      .filter(Boolean)
      .join(', ')
  if (prop.type === 'checkbox') return value ? 'true' : 'false'
  return String(value)
}

/** Applies a view's filters and sorts to the database rows. */
export function viewRows(db: PageMeta, rows: PageMeta[], view: ViewDef | undefined, search = ''): PageMeta[] {
  const props = db.db?.props ?? []
  let out = rows
  const q = search.trim().toLowerCase()
  if (q) out = out.filter((r) => r.title.toLowerCase().includes(q) || props.some((p) => propValueText(p, r.props[p.id], r).toLowerCase().includes(q)))
  for (const f of view?.filter ?? []) {
    const prop = props.find((p) => p.id === f.prop)
    if (!prop) continue
    out = out.filter((r) => {
      const raw = prop.type === 'title' ? r.title : r.props[prop.id]
      const text = propValueText(prop, raw, r).toLowerCase()
      const val = (f.value ?? '').toLowerCase()
      switch (f.op) {
        case 'is':
          return prop.type === 'multiSelect' ? ((raw as string[]) ?? []).includes(f.value ?? '') : raw === f.value || text === val
        case 'isNot':
          return prop.type === 'multiSelect' ? !((raw as string[]) ?? []).includes(f.value ?? '') : raw !== f.value && text !== val
        case 'contains':
          return text.includes(val)
        case 'empty':
          return !text
        case 'notEmpty':
          return !!text
        case 'checked':
          return !!raw
        case 'unchecked':
          return !raw
        default:
          return true
      }
    })
  }
  const sorts = view?.sort ?? []
  if (sorts.length) {
    out = [...out].sort((a, b) => {
      for (const s of sorts) {
        const prop = props.find((p) => p.id === s.prop)
        if (!prop) continue
        const va = prop.type === 'title' ? a.title : a.props[prop.id]
        const vb = prop.type === 'title' ? b.title : b.props[prop.id]
        let c = 0
        if (prop.type === 'number') c = (Number(va) || 0) - (Number(vb) || 0)
        else if (prop.type === 'select' || prop.type === 'status') {
          const ia = prop.options?.findIndex((o) => o.id === va) ?? -1
          const ib = prop.options?.findIndex((o) => o.id === vb) ?? -1
          c = ia - ib
        } else c = propValueText(prop, va, a).localeCompare(propValueText(prop, vb, b))
        if (c) return s.dir === 'asc' ? c : -c
      }
      return 0
    })
  }
  return out
}
