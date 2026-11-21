import { Plus } from 'lucide-react'
import { addRow, propValueText } from '#/lib/database'
import type { PageMeta, ViewDef } from '#/lib/types'
import { PageIcon } from '../PageIcon'
import { useOpenRow } from './DatabaseView'

export function ListView({ db, view, rows }: { db: PageMeta; view: ViewDef; rows: PageMeta[] }) {
  const openRow = useOpenRow()
  const props = (db.db?.props ?? []).filter((p) => p.type !== 'title' && !view.hidden?.includes(p.id)).slice(0, 3)
  return (
    <div>
      {rows.map((r) => (
        <button key={r.id} onClick={() => openRow(r.id)} className="flex h-9 w-full items-center gap-2 border-b border-line px-1 text-left text-sm hover:bg-hover">
          <PageIcon icon={r.icon} kind="row" size={16} />
          <span className="flex-1 truncate font-medium">{r.title || 'Untitled'}</span>
          {props.map((p) => (
            <span key={p.id} className="max-w-40 truncate text-xs text-muted">
              {propValueText(p, r.props[p.id], r)}
            </span>
          ))}
        </button>
      ))}
      <button onClick={() => addRow(db.id)} className="flex h-9 w-full items-center gap-2 px-1 text-sm text-faint hover:bg-hover">
        <Plus className="h-4 w-4" /> New
      </button>
    </div>
  )
}
