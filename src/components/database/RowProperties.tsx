import { Plus } from 'lucide-react'
import { usePage } from '#/lib/app'
import { addProp, PROP_TYPES } from '#/lib/database'
import type { PageMeta } from '#/lib/types'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../ui/menu'
import { PropCell } from './PropCell'
import { PROP_ICONS } from './TableView'

/** Property list shown at the top of a database row's page. */
export function RowProperties({ page }: { page: PageMeta }) {
  const db = usePage(page.parentId)
  if (!db?.db) return null
  const props = db.db.props.filter((p) => p.type !== 'title')
  return (
    <div className="mb-4 border-b border-line pb-3">
      {props.map((p) => {
        const Icon = PROP_ICONS[p.type]
        return (
          <div key={p.id} className="flex min-h-9 items-start">
            <div className="flex h-9 w-40 flex-none items-center gap-2 text-sm text-muted">
              <Icon className="h-4 w-4" />
              <span className="truncate">{p.name}</span>
            </div>
            <div className="min-w-0 flex-1 rounded hover:bg-hover">
              <PropCell db={db} prop={p} row={page} />
            </div>
          </div>
        )
      })}
      <Menu>
        <MenuTrigger asChild>
          <button className="mt-1 flex h-8 items-center gap-2 rounded px-1 text-sm text-faint hover:bg-hover">
            <Plus className="h-4 w-4" /> Add a property
          </button>
        </MenuTrigger>
        <MenuContent align="start">
          {PROP_TYPES.map((t) => {
            const Icon = PROP_ICONS[t.type]
            return (
              <MenuItem key={t.type} icon={<Icon />} onSelect={() => addProp(db.id, t.type)}>
                {t.label}
              </MenuItem>
            )
          })}
        </MenuContent>
      </Menu>
    </div>
  )
}
