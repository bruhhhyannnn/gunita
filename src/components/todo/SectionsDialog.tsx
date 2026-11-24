import type { Editor } from '@tiptap/react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getApp } from '#/lib/app'
import { isoDate } from '#/lib/dates'
import { newId } from '#/lib/ids'
import type { PageMeta, TodoSectionDef } from '#/lib/types'
import { applySections, findDay } from '#/todo/logic'
import { Dialog } from '../ui/dialog'
import { Button, IconButton } from '../ui/button'
import { Input } from '../ui/input'
import { Switch } from '../ui/switch'
import { CheckboxField } from '../ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { EmojiPicker } from '../EmojiPicker'
import { toast } from '../ui/toast'

const STARTER: Omit<TodoSectionDef, 'id'>[] = [
  { name: 'Work', icon: '💼', report: true },
  { name: 'Personal', icon: '🏠', report: false },
]

/** Today has tasks that aren't in any section. */
function hasLooseTasks(editor: Editor | null) {
  const day = editor && findDay(editor, isoDate())
  if (!day) return false
  let loose = false
  day.node.forEach((c) => {
    if (c.type.name === 'taskList' && c.textContent.trim()) loose = true
  })
  return loose
}

/** Sets up the sections each day of a TODO list is split into, like 💼 Work and 🏠 Personal. */
export function SectionsDialog({ page, editor, open, onOpenChange }: { page: PageMeta; editor: Editor | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [rows, setRows] = useState<TodoSectionDef[]>([])
  const [moveLoose, setMoveLoose] = useState(true)
  const [loose, setLoose] = useState(false)
  useEffect(() => {
    if (!open) return
    setRows(page.sections?.length ? page.sections : [])
    setLoose(hasLooseTasks(editor))
    setMoveLoose(!page.sections?.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const patch = (i: number, p: Partial<TodoSectionDef>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const move = (i: number, d: -1 | 1) =>
    setRows((r) => {
      const next = [...r]
      ;[next[i], next[i + d]] = [next[i + d], next[i]]
      return next
    })
  const clean = rows.map((r) => ({ ...r, name: r.name.trim() || 'Untitled' }))
  const firstReport = clean.find((r) => r.report)
  const target = firstReport ?? clean[0]

  const save = () => {
    const into = moveLoose && target ? target.id : null
    const ids = new Set(clean.map((x) => x.id))
    // Template tasks without a (still existing) section go where today's tasks go.
    const template = into ? page.template?.map((t) => (t.section && ids.has(t.section) ? t : { ...t, section: into })) : page.template
    getApp().ws.updatePage(page.id, { sections: clean.length ? clean : undefined, template })
    if (editor) applySections(editor, clean, loose ? into : null)
    onOpenChange(false)
    toast(clean.length ? 'Sections saved. They show in today and every new day.' : 'Sections removed.')
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Sections"
      description="Split each day into groups, like Work and Personal. Only tasks you finish in sections marked “In report” go into your accomplishment report."
    >
      <div className="max-h-[56vh] space-y-2 overflow-y-auto px-5 py-3">
        {rows.length === 0 && (
          <div className="rounded-lg border border-dashed border-line px-4 py-5 text-center text-sm text-muted">
            <p>No sections yet. Every finished task counts for the report.</p>
            <Button
              className="mt-3"
              variant="primary"
              size="sm"
              icon={<Plus />}
              onClick={() => setRows(STARTER.map((s) => ({ ...s, id: newId() })))}
            >
              Add 💼 Work and 🏠 Personal
            </Button>
          </div>
        )}
        {rows.map((r, i) => (
          <div key={r.id} className="flex items-center gap-2" data-testid="section-row">
            <Popover>
              <PopoverTrigger asChild>
                <button className="grid h-9 w-9 flex-none place-items-center rounded-md border border-line text-lg hover:bg-hover" aria-label="Section icon">
                  {r.icon || '·'}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start">
                <EmojiPicker onPick={(e) => patch(i, { icon: e })} onRemove={() => patch(i, { icon: '' })} />
              </PopoverContent>
            </Popover>
            <Input value={r.name} onChange={(e) => patch(i, { name: e.target.value })} aria-label="Section name" placeholder="Section name" className="min-w-0 flex-1" />
            <label className="flex flex-none items-center gap-2 text-sm text-muted">
              <Switch checked={r.report} onCheckedChange={(v) => patch(i, { report: v })} aria-label={`${r.name || 'Section'} counts for the report`} />
              In report
            </label>
            <div className="flex flex-none">
              <IconButton label="Move up" size="sm" disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp />
              </IconButton>
              <IconButton label="Move down" size="sm" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown />
              </IconButton>
              <IconButton label="Remove section" size="sm" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>
                <Trash2 />
              </IconButton>
            </div>
          </div>
        ))}
        {rows.length > 0 && (
          <Button variant="ghost" size="sm" icon={<Plus />} onClick={() => setRows((x) => [...x, { id: newId(), name: '', icon: '📌', report: false }])}>
            Add section
          </Button>
        )}
        {rows.length > 0 && !firstReport && (
          <p className="text-xs text-faint">No section is in the report, so every finished task counts.</p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
        {(loose || page.template?.some((t) => !t.section)) && target ? (
          <CheckboxField
            label={`Put today's tasks and the daily template in ${target.icon} ${target.name}`}
            hint="Move personal ones with Alt+↓ or the task's ⋯ menu."
            checked={moveLoose}
            onCheckedChange={setMoveLoose}
          />
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
