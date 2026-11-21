import { useEffect, useRef, useState } from 'react'
import { Check, X } from 'lucide-react'
import { getApp } from '#/lib/app'
import { addOption, updateProp, OPTION_COLORS } from '#/lib/database'
import { shortDate } from '#/lib/dates'
import type { PageMeta, PropDef, SelectOption } from '#/lib/types'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { cn } from '../ui/cn'

export function OptionPill({ opt, onRemove }: { opt: SelectOption; onRemove?: () => void }) {
  return (
    <span className={cn('inline-flex max-w-full items-center gap-1 truncate rounded px-1.5 py-px text-[13px] leading-5', `opt-${opt.color}`)}>
      <span className="truncate">{opt.name}</span>
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="opacity-60 hover:opacity-100"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  )
}

/** Displays and edits one database property value for one row. */
export function PropCell({ db, prop, row, className }: { db: PageMeta; prop: PropDef; row: PageMeta; className?: string }) {
  const value = prop.type === 'title' ? row.title : row.props[prop.id]
  const set = (v: unknown) => {
    if (prop.type === 'title') getApp().ws.updatePage(row.id, { title: String(v ?? '') })
    else getApp().ws.setProp(row.id, prop.id, v)
  }

  if (prop.type === 'checkbox') {
    return (
      <div className={cn('flex h-full items-center px-2', className)}>
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => set(e.target.checked || undefined)}
          className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
        />
      </div>
    )
  }
  if (prop.type === 'select' || prop.type === 'status' || prop.type === 'multiSelect') {
    return <SelectCell db={db} prop={prop} value={value} onChange={set} className={className} />
  }
  if (prop.type === 'date') {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button className={cn('flex h-full min-h-8 w-full items-center px-2 text-left text-sm', className)}>
            {value ? shortDate(String(value)) : <span className="text-faint">Empty</span>}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="flex items-center gap-2 p-2">
          <input
            type="date"
            autoFocus
            defaultValue={(value as string) ?? ''}
            onChange={(e) => set(e.target.value || undefined)}
            className="rounded-md border border-line bg-bg px-2 py-1 text-sm"
          />
          {value != null && (
            <button className="text-sm text-muted hover:text-fg" onClick={() => set(undefined)}>
              Clear
            </button>
          )}
        </PopoverContent>
      </Popover>
    )
  }
  return <TextCell value={value == null ? '' : String(value)} type={prop.type} onChange={set} className={className} />
}

function TextCell({
  value,
  type,
  onChange,
  className,
}: {
  value: string
  type: PropDef['type']
  onChange: (v: unknown) => void
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])
  useEffect(() => {
    if (editing) ref.current?.focus()
  }, [editing])
  const commit = () => {
    setEditing(false)
    if (draft === value) return
    if (type === 'number') onChange(draft.trim() === '' || isNaN(Number(draft)) ? undefined : Number(draft))
    else onChange(draft.trim() === '' && type !== 'title' ? undefined : draft)
  }
  if (editing) {
    return (
      <input
        ref={ref}
        value={draft}
        inputMode={type === 'number' ? 'decimal' : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') {
            setDraft(value)
            setEditing(false)
          }
        }}
        className={cn('h-full min-h-8 w-full bg-popover px-2 text-sm outline outline-2 outline-accent', type === 'number' && 'text-right', className)}
      />
    )
  }
  return (
    <div
      onClick={() => setEditing(true)}
      className={cn('flex h-full min-h-8 w-full cursor-text items-center px-2 text-sm', type === 'number' && 'justify-end', className)}
    >
      {type === 'url' && value ? (
        <a
          href={/^https?:\/\//.test(value) ? value : `https://${value}`}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="truncate underline decoration-[var(--text-faint)]"
        >
          {value}
        </a>
      ) : (
        <span className={cn('truncate', type === 'title' && 'font-medium')}>{value}</span>
      )}
    </div>
  )
}

function SelectCell({
  db,
  prop,
  value,
  onChange,
  className,
}: {
  db: PageMeta
  prop: PropDef
  value: unknown
  onChange: (v: unknown) => void
  className?: string
}) {
  const [q, setQ] = useState('')
  const multi = prop.type === 'multiSelect'
  const selected: string[] = multi ? ((value as string[]) ?? []) : value ? [value as string] : []
  const options = prop.options ?? []
  const filtered = options.filter((o) => o.name.toLowerCase().includes(q.toLowerCase()))
  const toggle = (id: string) => {
    if (multi) {
      const next = selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]
      onChange(next.length ? next : undefined)
    } else onChange(selected[0] === id ? undefined : id)
  }
  return (
    <Popover onOpenChange={(o) => !o && setQ('')}>
      <PopoverTrigger asChild>
        <button className={cn('flex h-full min-h-8 w-full flex-wrap items-center gap-1 px-2 py-1 text-left', className)}>
          {selected.map((id) => {
            const opt = options.find((o) => o.id === id)
            return opt ? <OptionPill key={id} opt={opt} /> : null
          })}
          {!selected.length && <span className="text-sm text-faint">Empty</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && q.trim()) {
              const match = options.find((o) => o.name.toLowerCase() === q.trim().toLowerCase())
              toggle(match ? match.id : addOption(db.id, prop.id, q.trim()).id)
              setQ('')
            }
          }}
          placeholder={multi ? 'Search or create options…' : 'Search or create an option…'}
          className="mb-1 h-8 w-full rounded-md bg-hover px-2 text-sm outline-none"
        />
        <div className="max-h-60 overflow-y-auto">
          {filtered.map((o) => (
            <div key={o.id} className="group flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-hover">
              <button className="flex flex-1 items-center gap-2 text-left" onClick={() => toggle(o.id)}>
                <OptionPill opt={o} />
                {selected.includes(o.id) && <Check className="ml-auto h-3.5 w-3.5 text-muted" />}
              </button>
              <select
                title="Color"
                value={o.color}
                onChange={(e) =>
                  updateProp(db.id, prop.id, {
                    options: options.map((x) => (x.id === o.id ? { ...x, color: e.target.value as SelectOption['color'] } : x)),
                  })
                }
                className="w-5 cursor-pointer appearance-none bg-transparent text-xs text-faint opacity-0 group-hover:opacity-100"
              >
                {OPTION_COLORS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          ))}
          {q.trim() && !options.some((o) => o.name.toLowerCase() === q.trim().toLowerCase()) && (
            <button
              className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-hover"
              onClick={() => {
                toggle(addOption(db.id, prop.id, q.trim()).id)
                setQ('')
              }}
            >
              Create <OptionPill opt={{ id: 'new', name: q.trim(), color: OPTION_COLORS[options.length % OPTION_COLORS.length] }} />
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
