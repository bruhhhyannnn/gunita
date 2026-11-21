import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useState } from 'react'
import { getApp } from '#/lib/app'
import { addRow } from '#/lib/database'
import { isoDate } from '#/lib/dates'
import type { PageMeta, ViewDef } from '#/lib/types'
import { cn } from '../ui/cn'
import { useOpenRow } from './DatabaseView'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function CalendarView({ db, view, rows }: { db: PageMeta; view: ViewDef; rows: PageMeta[] }) {
  const prop = db.db?.props.find((p) => p.id === view.dateProp)
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const openRow = useOpenRow()
  const [over, setOver] = useState<string | null>(null)
  if (!prop) return <p className="py-6 text-sm text-muted">Add a Date property and pick it for this view (click the view name).</p>

  const start = new Date(month)
  start.setDate(1 - start.getDay())
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
  const today = isoDate()
  const label = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div className="pt-2">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-base font-semibold">{label}</span>
        <div className="flex-1" />
        <button className="rounded px-2 py-1 text-sm text-muted hover:bg-hover" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>
          Today
        </button>
        <button className="rounded p-1 hover:bg-hover" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button className="rounded p-1 hover:bg-hover" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 border-l border-t border-line text-sm">
        {DOW.map((d) => (
          <div key={d} className="border-b border-r border-line px-2 py-1 text-xs text-faint">
            {d}
          </div>
        ))}
        {days.map((d) => {
          const iso = isoDate(d)
          const items = rows.filter((r) => r.props[prop.id] === iso)
          const inMonth = d.getMonth() === month.getMonth()
          return (
            <div
              key={iso}
              onDragOver={(e) => {
                e.preventDefault()
                setOver(iso)
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                setOver(null)
                const id = e.dataTransfer.getData('application/x-gunita-row')
                if (id) getApp().ws.setProp(id, prop.id, iso)
              }}
              className={cn('group min-h-24 border-b border-r border-line p-1', !inMonth && 'bg-subtle', over === iso && 'bg-accent-soft')}
            >
              <div className="flex items-center justify-between">
                <button onClick={() => addRow(db.id, { [prop.id]: iso })} className="invisible rounded p-0.5 text-faint hover:bg-hover group-hover:visible" aria-label="Add">
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <span className={cn('grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs', iso === today ? 'bg-danger text-white' : inMonth ? 'text-muted' : 'text-faint')}>
                  {d.getDate()}
                </span>
              </div>
              {items.map((r) => (
                <div
                  key={r.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('application/x-gunita-row', r.id)}
                  onClick={() => openRow(r.id)}
                  className="mb-0.5 cursor-pointer truncate rounded border border-line bg-popover px-1.5 py-0.5 text-xs shadow-sm hover:bg-hover"
                >
                  {r.title || 'Untitled'}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
