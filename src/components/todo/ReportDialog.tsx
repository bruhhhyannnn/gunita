import type { Editor } from '@tiptap/react'
import { Copy, Loader2, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { addDays, isoDate, parseIso, shortDate } from '#/lib/dates'
import { useApp } from '#/lib/app'
import type { PageMeta } from '#/lib/types'
import { doneTasks, type DoneTask } from '#/todo/logic'
import { polishReport } from '#/ai/client'
import { Dialog } from '../ui/dialog'
import { toast } from '../ui/toast'
import { cn } from '../ui/cn'

type Range = 'today' | 'yesterday' | 'week' | 'lastweek' | 'month' | 'custom'

function rangeFor(r: Range, custom: { from: string; to: string }): { from: string; to: string } {
  const today = isoDate()
  const dow = (parseIso(today).getDay() + 6) % 7 // Monday = 0
  const monday = addDays(today, -dow)
  switch (r) {
    case 'today':
      return { from: today, to: today }
    case 'yesterday':
      return { from: addDays(today, -1), to: addDays(today, -1) }
    case 'week':
      return { from: monday, to: today }
    case 'lastweek':
      return { from: addDays(monday, -7), to: addDays(monday, -1) }
    case 'month':
      return { from: today.slice(0, 8) + '01', to: today }
    default:
      return custom
  }
}

function dayLabel(d: string) {
  return parseIso(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

export function formatReport(tasks: DoneTask[], byDay: boolean, from: string, to: string): string {
  if (!tasks.length) return ''
  const bullet = (t: DoneTask) => `${'    '.repeat(t.depth)}• ${t.text}`
  const header = from === to ? `Accomplishments – ${dayLabel(from)}` : `Accomplishments – ${shortDate(from)} to ${shortDate(to)}`
  if (!byDay) {
    // Merge repeated daily tasks (e.g. "check emails") into one line.
    const seen = new Set<string>()
    const lines = tasks.filter((t) => t.depth === 0).filter((t) => !seen.has(t.text.toLowerCase()) && seen.add(t.text.toLowerCase()))
    return [header, '', ...lines.map(bullet)].join('\n')
  }
  const out = [header]
  let day = ''
  for (const t of tasks) {
    if (t.day !== day) {
      day = t.day
      out.push('', dayLabel(day))
    }
    out.push(bullet(t))
  }
  return out.join('\n')
}

/** Plain-text accomplishment report from checked tasks, ready to paste into the CWA template. */
export function ReportDialog({
  page,
  editor,
  open,
  onOpenChange,
}: {
  page: PageMeta
  editor: Editor | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { config } = useApp()
  const [range, setRange] = useState<Range>('week')
  const [custom, setCustom] = useState({ from: addDays(isoDate(), -6), to: isoDate() })
  const [byDay, setByDay] = useState(true)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const r = rangeFor(range, custom)
  const tasks = useMemo(() => (editor && open ? doneTasks(editor, r.from, r.to) : []), [editor, open, r.from, r.to])

  useEffect(() => {
    setText(formatReport(tasks, byDay, r.from, r.to))
  }, [tasks, byDay, r.from, r.to])

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Accomplishment report" description={`Checked tasks from ${page.title || 'this list'}, as plain text you can paste anywhere.`}>
      <div className="space-y-3 px-5 py-3">
        <div className="flex flex-wrap gap-1">
          {(
            [
              ['today', 'Today'],
              ['yesterday', 'Yesterday'],
              ['week', 'This week'],
              ['lastweek', 'Last week'],
              ['month', 'This month'],
              ['custom', 'Custom'],
            ] as [Range, string][]
          ).map(([k, l]) => (
            <button key={k} onClick={() => setRange(k)} className={cn('h-7 rounded-md px-2.5 text-sm', range === k ? 'bg-accent text-white' : 'bg-hover text-muted')}>
              {l}
            </button>
          ))}
        </div>
        {range === 'custom' && (
          <div className="flex items-center gap-2 text-sm">
            <input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="rounded border border-line bg-bg px-2 py-1" />
            to
            <input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="rounded border border-line bg-bg px-2 py-1" />
          </div>
        )}
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={byDay} onChange={(e) => setByDay(e.target.checked)} /> Group by day
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="No checked tasks in this range."
          className="h-72 w-full resize-none rounded-md border border-line bg-bg p-3 font-mono text-[13px] leading-relaxed outline-none"
        />
      </div>
      <div className="flex items-center justify-between border-t border-line px-5 py-3">
        <span className="text-xs text-faint">{tasks.length} completed tasks</span>
        <div className="flex gap-2">
          {config?.claudeConfigured && (
            <button
              disabled={busy || !tasks.length}
              onClick={async () => {
                setBusy(true)
                try {
                  setText(await polishReport(text))
                } catch (e) {
                  toast((e as Error).message)
                } finally {
                  setBusy(false)
                }
              }}
              className="flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-sm hover:bg-hover disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Polish with AI
            </button>
          )}
          <button
            onClick={() => {
              void navigator.clipboard.writeText(text)
              toast('Copied. Paste it into your CWA document.')
            }}
            className="flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-white"
          >
            <Copy className="h-4 w-4" /> Copy
          </button>
        </div>
      </div>
    </Dialog>
  )
}
