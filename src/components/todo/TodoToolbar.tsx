import type { Editor } from '@tiptap/react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { FileText, ListChecks, Settings2, Sun } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { getApp, useIndexVersion, useWs } from '#/lib/app'
import { isoDate } from '#/lib/dates'
import type { PageMeta } from '#/lib/types'
import { appendTaskToday, findDay, focusToday, isFirstList, planToday, repairDays, startToday } from '#/todo/logic'
import { toast } from '../ui/toast'
import { TemplateDialog } from './TemplateDialog'
import { ReportDialog } from './ReportDialog'
import { TaskMenu } from './TaskMenu'
import { DailyPlan } from './DailyPlan'

export function TodoToolbar({ page, editor }: { page: PageMeta; editor: Editor | null }) {
  const [templateOpen, setTemplateOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [started, setStarted] = useState(true)
  const [preview, setPreview] = useState<{ carried: number; template: number; inbox: number } | null>(null)
  const search = useSearch({ strict: false }) as { start?: string }
  const navigate = useNavigate()
  const autoRan = useRef(false)
  const inbox = useWs((s) => s.inbox.length)
  const waiting = useWs((s) => s.inbox.filter((i) => i.listId === page.id || (!i.listId && isFirstList(page.id))))
  useIndexVersion()

  // Recompute whether today exists whenever the document changes.
  useEffect(() => {
    if (!editor) return
    const check = () => {
      const has = !!findDay(editor, isoDate())
      setStarted(has)
      if (!has) {
        const p = planToday(editor, page)
        setPreview({ carried: p.carried.length, template: p.template.length, inbox: p.inboxCount })
      }
    }
    check()
    editor.on('update', check)
    return () => {
      editor.off('update', check)
    }
  }, [editor, page, inbox])

  const run = () => {
    if (!editor) return
    const r = startToday(editor, page)
    if (!r.started) {
      focusToday(editor)
      return
    }
    const parts = [
      r.template && `${r.template} from your template`,
      r.carried && `${r.carried} carried over`,
      r.inbox && `${r.inbox} from meetings`,
    ].filter(Boolean)
    toast(parts.length ? `Today started: ${parts.join(', ')}.` : 'Today started.', {
      label: 'Undo',
      run: () => editor.commands.undo(),
    })
  }

  // Auto-start (if enabled) the first time the list is opened on a new day, or when
  // arriving from the "Start today" shortcut.
  useEffect(() => {
    if (!editor || autoRan.current) return
    autoRan.current = true
    repairDays(editor)
    const wants = search.start === 'today' || page.autoStart !== false
    if (wants && !findDay(editor, isoDate())) {
      // Give sync a moment to bring in today's section from another device first.
      const t = setTimeout(() => {
        if (!findDay(editor, isoDate())) run()
      }, search.start === 'today' ? 50 : 1200)
      if (search.start) void navigate({ to: '.', search: {} as never, replace: true })
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  return (
    <div className="mb-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={run}
          disabled={!editor}
          className="flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold shadow-sm hover:bg-hover"
        >
          <Sun className="h-4 w-4 text-[#e9a800]" />
          {started ? 'Go to today' : 'TODO TODAY!'}
        </button>
        <button onClick={() => setTemplateOpen(true)} className="flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted hover:bg-hover">
          <Settings2 className="h-4 w-4" /> Template
        </button>
        <button onClick={() => setReportOpen(true)} className="flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted hover:bg-hover">
          <FileText className="h-4 w-4" /> Report
        </button>
      </div>

      {!started && preview && (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-accent/40 bg-accent-soft px-4 py-3 text-sm">
          <ListChecks className="h-5 w-5 flex-none text-accent" />
          <div className="flex-1">
            <span className="font-medium">New day.</span>{' '}
            {preview.carried + preview.template + preview.inbox === 0
              ? 'Start today with an empty list.'
              : `Start today with ${[
                  preview.template && `${preview.template} template task${preview.template === 1 ? '' : 's'}`,
                  preview.carried && `${preview.carried} unfinished from before`,
                  preview.inbox && `${preview.inbox} from meetings`,
                ]
                  .filter(Boolean)
                  .join(', ')}.`}
          </div>
          <button onClick={run} className="h-8 rounded-md bg-accent px-3 font-medium text-white">
            Start today
          </button>
        </div>
      )}

      {started && editor && waiting.length > 0 && (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-line bg-subtle px-4 py-2.5 text-sm">
          <span className="flex-1">
            {waiting.length} action item{waiting.length === 1 ? '' : 's'} from meetings: {waiting.slice(0, 2).map((w) => `“${w.text}”`).join(', ')}
            {waiting.length > 2 ? '…' : ''}
          </span>
          <button
            className="h-8 rounded-md bg-accent px-3 font-medium text-white"
            onClick={() => {
              for (const item of getApp().ws.takeInbox(page.id, isFirstList(page.id))) appendTaskToday(editor, item.text, { source: item.sourceId ?? null })
            }}
          >
            Add to today
          </button>
        </div>
      )}

      {started && editor && <DailyPlan page={page} editor={editor} />}

      <TemplateDialog page={page} open={templateOpen} onOpenChange={setTemplateOpen} />
      <ReportDialog page={page} editor={editor} open={reportOpen} onOpenChange={setReportOpen} />
      <TaskMenu pageId={page.id} />
    </div>
  )
}
