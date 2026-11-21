import { ArrowLeft, ArrowRight, GripVertical, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { getApp } from '#/lib/app'
import { newId } from '#/lib/ids'
import type { PageMeta, Recurrence, TemplateItem } from '#/lib/types'
import { Dialog } from '../ui/dialog'
import { cn } from '../ui/cn'

interface FlatItem {
  id: string
  text: string
  repeat: Recurrence
  depth: number
}

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function flatten(items: TemplateItem[], depth = 0): FlatItem[] {
  return items.flatMap((i) => [{ id: i.id, text: i.text, repeat: i.repeat, depth }, ...flatten(i.children ?? [], depth + 1)])
}

function nest(flat: FlatItem[]): TemplateItem[] {
  const root: TemplateItem[] = []
  const stack: { depth: number; item: TemplateItem }[] = []
  for (const f of flat) {
    const item: TemplateItem = { id: f.id, text: f.text, repeat: f.repeat }
    while (stack.length && stack[stack.length - 1].depth >= f.depth) stack.pop()
    const parent = stack[stack.length - 1]
    if (parent) (parent.item.children ??= []).push(item)
    else root.push(item)
    stack.push({ depth: parent ? parent.depth + 1 : 0, item })
  }
  return root
}

/** Edits the tasks that Start Today adds every day (or on chosen weekdays / day of month). */
export function TemplateDialog({ page, open, onOpenChange }: { page: PageMeta; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [items, setItems] = useState<FlatItem[]>(() => flatten(page.template ?? []))
  const update = (i: number, patch: Partial<FlatItem>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const save = () => {
    getApp().ws.updatePage(page.id, { template: nest(items.filter((i) => i.text.trim())) })
    onOpenChange(false)
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setItems(flatten(page.template ?? []))
        onOpenChange(o)
      }}
      title="Daily template"
      description="These tasks are added each time you start a day. Unfinished tasks from earlier days are carried over automatically."
    >
      <div className="max-h-[50vh] overflow-y-auto px-5 py-3">
        {items.map((it, i) => (
          <div key={it.id} className="group flex items-center gap-1.5 py-1" style={{ paddingLeft: it.depth * 24 }}>
            <GripVertical className="h-4 w-4 flex-none text-faint" />
            <input type="checkbox" disabled className="h-4 w-4 flex-none" />
            <input
              value={it.text}
              autoFocus={!it.text}
              onChange={(e) => update(i, { text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  setItems((xs) => [...xs.slice(0, i + 1), { id: newId(), text: '', repeat: { kind: 'daily' }, depth: it.depth }, ...xs.slice(i + 1)])
                }
                if (e.key === 'Tab') {
                  e.preventDefault()
                  const prevDepth = items[i - 1]?.depth ?? -1
                  update(i, { depth: e.shiftKey ? Math.max(0, it.depth - 1) : Math.min(prevDepth + 1, it.depth + 1) })
                }
                if (e.key === 'Backspace' && !it.text) {
                  e.preventDefault()
                  setItems((xs) => xs.filter((_, j) => j !== i))
                }
              }}
              placeholder="Task"
              className="h-8 min-w-0 flex-1 rounded bg-transparent px-1 outline-none focus:bg-hover"
            />
            <select
              value={it.repeat.kind}
              onChange={(e) => {
                const k = e.target.value
                update(i, {
                  repeat: k === 'daily' ? { kind: 'daily' } : k === 'weekdays' ? { kind: 'weekdays', days: [1, 2, 3, 4, 5] } : { kind: 'monthly', day: 1 },
                })
              }}
              className="h-7 rounded border border-line bg-bg px-1 text-xs text-muted"
            >
              <option value="daily">Every day</option>
              <option value="weekdays">On days…</option>
              <option value="monthly">Monthly</option>
            </select>
            {it.repeat.kind === 'weekdays' && (
              <div className="flex gap-0.5">
                {DAYS.map((d, di) => {
                  const r = it.repeat as Extract<Recurrence, { kind: 'weekdays' }>
                  const on = r.days.includes(di)
                  return (
                    <button
                      key={di}
                      onClick={() => update(i, { repeat: { kind: 'weekdays', days: on ? r.days.filter((x) => x !== di) : [...r.days, di].sort() } })}
                      className={cn('h-6 w-6 rounded text-[11px]', on ? 'bg-accent text-white' : 'bg-hover text-muted')}
                    >
                      {d}
                    </button>
                  )
                })}
              </div>
            )}
            {it.repeat.kind === 'monthly' && (
              <input
                type="number"
                min={1}
                max={31}
                value={(it.repeat as Extract<Recurrence, { kind: 'monthly' }>).day}
                onChange={(e) => update(i, { repeat: { kind: 'monthly', day: Math.min(31, Math.max(1, Number(e.target.value) || 1)) } })}
                className="h-7 w-14 rounded border border-line bg-bg px-1 text-xs"
                title="Day of month"
              />
            )}
            <div className="flex opacity-0 group-hover:opacity-100">
              <button title="Outdent" className="rounded p-1 text-faint hover:bg-hover" onClick={() => update(i, { depth: Math.max(0, it.depth - 1) })}>
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
              <button title="Indent (make sub-task)" className="rounded p-1 text-faint hover:bg-hover" onClick={() => update(i, { depth: Math.min((items[i - 1]?.depth ?? -1) + 1, it.depth + 1) })}>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
              <button title="Remove" className="rounded p-1 text-faint hover:bg-hover hover:text-danger" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
        <button
          onClick={() => setItems((xs) => [...xs, { id: newId(), text: '', repeat: { kind: 'daily' }, depth: 0 }])}
          className="mt-1 flex h-8 items-center gap-1.5 rounded px-1 text-sm text-faint hover:bg-hover"
        >
          <Plus className="h-4 w-4" /> Add a task
        </button>
      </div>
      <div className="flex items-center justify-between border-t border-line px-5 py-3">
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={page.autoStart !== false}
            onChange={(e) => getApp().ws.updatePage(page.id, { autoStart: e.target.checked })}
          />
          Start the day automatically when I open this list
        </label>
        <div className="flex gap-2">
          <button onClick={() => onOpenChange(false)} className="h-8 rounded-md px-3 text-sm text-muted hover:bg-hover">
            Cancel
          </button>
          <button onClick={save} className="h-8 rounded-md bg-accent px-3 text-sm font-medium text-white">
            Save
          </button>
        </div>
      </div>
    </Dialog>
  )
}
