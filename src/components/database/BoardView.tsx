import { Plus } from 'lucide-react'
import { useState } from 'react'
import { getApp } from '#/lib/app'
import { addRow, propValueText } from '#/lib/database'
import type { PageMeta, SelectOption, ViewDef } from '#/lib/types'
import { PageIcon } from '../PageIcon'
import { cn } from '../ui/cn'
import { OptionPill } from './PropCell'
import { useOpenRow } from './DatabaseView'

export function BoardView({ db, view, rows }: { db: PageMeta; view: ViewDef; rows: PageMeta[] }) {
  const props = db.db?.props ?? []
  const group = props.find((p) => p.id === view.groupBy)
  const openRow = useOpenRow()
  const [over, setOver] = useState<string | null>(null)
  if (!group) {
    return <p className="py-6 text-sm text-muted">Pick a Select or Status property to group by (click the view name).</p>
  }
  const columns: (SelectOption | null)[] = [null, ...(group.options ?? [])]
  const visibleProps = props.filter((p) => p.type !== 'title' && p.id !== group.id && !view.hidden?.includes(p.id)).slice(0, 3)

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 pt-2">
      {columns.map((col) => {
        const key = col?.id ?? '__none'
        const items = rows.filter((r) => (r.props[group.id] ?? null) === (col?.id ?? null))
        if (!col && !items.length) return null
        return (
          <div
            key={key}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(key)
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              setOver(null)
              const id = e.dataTransfer.getData('application/x-gunita-row')
              if (id) getApp().ws.setProp(id, group.id, col?.id)
            }}
            className={cn('w-64 flex-none rounded-lg p-1', over === key && 'bg-accent-soft')}
          >
            <div className="mb-2 flex items-center gap-2 px-1 text-sm">
              {col ? <OptionPill opt={col} /> : <span className="text-muted">No {group.name}</span>}
              <span className="text-faint">{items.length}</span>
            </div>
            <div className="space-y-1.5">
              {items.map((r) => (
                <div
                  key={r.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('application/x-gunita-row', r.id)}
                  onClick={() => openRow(r.id)}
                  className="cursor-pointer rounded-md border border-line bg-popover p-2.5 text-sm shadow-sm hover:bg-hover"
                >
                  <div className="flex items-center gap-1.5 font-medium">
                    {r.icon && <PageIcon icon={r.icon} size={15} />}
                    {r.title || <span className="text-faint">Untitled</span>}
                  </div>
                  {visibleProps.map((p) => {
                    const v = r.props[p.id]
                    if (v == null || v === '') return null
                    if (p.type === 'multiSelect')
                      return (
                        <div key={p.id} className="mt-1 flex flex-wrap gap-1">
                          {(v as string[]).map((id) => {
                            const o = p.options?.find((x) => x.id === id)
                            return o ? <OptionPill key={id} opt={o} /> : null
                          })}
                        </div>
                      )
                    if (p.type === 'select' || p.type === 'status') {
                      const o = p.options?.find((x) => x.id === v)
                      return o ? (
                        <div key={p.id} className="mt-1">
                          <OptionPill opt={o} />
                        </div>
                      ) : null
                    }
                    return (
                      <div key={p.id} className="mt-1 truncate text-xs text-muted">
                        {propValueText(p, v, r)}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
            <button
              onClick={() => addRow(db.id, col ? { [group.id]: col.id } : {})}
              className="mt-1 flex h-8 w-full items-center gap-1.5 rounded-md px-2 text-sm text-faint hover:bg-hover"
            >
              <Plus className="h-4 w-4" /> New
            </button>
          </div>
        )
      })}
    </div>
  )
}
