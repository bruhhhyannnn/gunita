import type { Editor } from '@tiptap/react'
import { useNavigate } from '@tanstack/react-router'
import { ChevronRight, FileText, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { getApp, useApp } from '#/lib/app'
import { isoDate, addDays } from '#/lib/dates'
import type { PageMeta, ReportGrouping, ReportSettings } from '#/lib/types'
import { duePeriod, findReportPage, generateReport, makePeriod, monthPeriod, periodOf, previousPeriod, reportSettings, type Period } from '#/lib/report'
import { Dialog } from '../ui/dialog'
import { Button } from '../ui/button'
import { Select } from '../ui/select'
import { Switch } from '../ui/switch'
import { CheckboxField } from '../ui/checkbox'
import { Input, Textarea } from '../ui/input'
import { DatePicker } from '../ui/date-picker'
import { toast } from '../ui/toast'

type Choice = 'due' | 'current' | 'previous' | 'month' | 'custom'

/** Settings and manual run for the semi-monthly accomplishment report. */
export function ReportDialog({ page, open, onOpenChange }: { page: PageMeta; editor: Editor | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { config } = useApp()
  const navigate = useNavigate()
  const settings = reportSettings(page)
  const [choice, setChoice] = useState<Choice>('due')
  const [custom, setCustom] = useState({ from: addDays(isoDate(), -14), to: isoDate() })
  const [busy, setBusy] = useState(false)
  const [showWording, setShowWording] = useState(false)
  const set = (patch: Partial<ReportSettings>) => getApp().ws.updatePage(page.id, { report: { ...settings, ...patch } })

  const due = duePeriod()
  const current = periodOf(isoDate())
  const periods: Record<Choice, Period> = {
    due,
    current,
    previous: previousPeriod(due),
    month: monthPeriod(isoDate()),
    custom: makePeriod(custom.from, custom.to),
  }
  const period = periods[choice]
  const existing = findReportPage(page.id, period)

  const create = async () => {
    setBusy(true)
    try {
      const r = await generateReport(page.id, period)
      onOpenChange(false)
      toast(`Report for ${period.short}: ${r.count} finished task${r.count === 1 ? '' : 's'}${r.usedAi ? ', written up by AI' : ''}.`)
      void navigate({ to: '/p/$pageId', params: { pageId: r.pageId } })
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const options: { value: Choice; label: string }[] = [
    { value: 'due', label: `Due report (${due.short})` },
    ...(current.from !== due.from ? [{ value: 'current' as Choice, label: `This period so far (${current.short})` }] : []),
    { value: 'previous', label: `Earlier period (${periods.previous.short})` },
    { value: 'month', label: `Whole month (${periods.month.short})` },
    { value: 'custom', label: 'Custom dates…' },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Accomplishment report" description="Turns the tasks you checked off into your work accomplishment report, as a page you can edit and copy into Google Docs.">
      <div className="space-y-5 px-5 py-4">
        <div className="flex items-start justify-between gap-4 rounded-lg bg-subtle p-3">
          <div>
            <div className="text-sm font-medium">Draft automatically on the 15th and last day of each month</div>
            <div className="mt-0.5 text-xs text-muted">The draft appears under “Accomplishment reports” in this list. Regenerate it before sending to include the last day's work.</div>
          </div>
          <Switch aria-label="Draft automatically" checked={settings.auto} onCheckedChange={(v) => set({ auto: v })} />
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium text-muted">Period</div>
          <Select className="w-full" aria-label="Period" value={choice} onValueChange={(v) => setChoice(v as Choice)} options={options} />
          {choice === 'custom' && (
            <div className="flex items-center gap-2 text-sm">
              <DatePicker value={custom.from} onChange={(d) => d && setCustom({ ...custom, from: d })} />
              to
              <DatePicker value={custom.to} min={custom.from} onChange={(d) => d && setCustom({ ...custom, to: d })} />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium text-muted">Group accomplishments</div>
          <Select
            className="w-full"
            aria-label="Grouping"
            value={settings.grouping}
            onValueChange={(v) => set({ grouping: v as ReportGrouping })}
            options={[
              { value: 'ai', label: config?.claudeConfigured ? 'By project, written up by AI' : 'By project, written up by AI (needs Claude)', disabled: !config?.claudeConfigured },
              { value: 'parent', label: 'By the task they were under (no AI)' },
              { value: 'day', label: 'By day (no AI)' },
            ]}
          />
          <CheckboxField
            label="Leave out routine tasks from the daily template"
            hint="Like “check emails”. They still count for attendance."
            checked={settings.skipRoutine}
            onCheckedChange={(v) => set({ skipRoutine: v })}
          />
        </div>

        <div>
          <button onClick={() => setShowWording((s) => !s)} className="flex items-center gap-1 text-xs font-medium text-muted hover:text-fg">
            <ChevronRight className={`h-3.5 w-3.5 transition ${showWording ? 'rotate-90' : ''}`} /> Heading and intro
          </button>
          {showWording && (
            <div className="mt-2 space-y-2">
              <Input value={settings.heading} onChange={(e) => set({ heading: e.target.value })} aria-label="Heading" />
              <Textarea value={settings.intro} onChange={(e) => set({ intro: e.target.value })} className="h-24" aria-label="Intro" />
              <p className="text-xs text-faint">
                <code>{'{period}'}</code> becomes “{due.label}” (in bold). <code>{'{absences}'}</code> becomes the weekdays with no finished tasks, or “N/A”.
              </p>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
        <span className="text-xs text-faint">{existing ? 'A report for this period exists; it will be updated.' : ''}</span>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button variant="primary" disabled={busy} icon={busy ? <Loader2 className="animate-spin" /> : <FileText />} onClick={() => void create()}>
            {existing ? 'Update report' : 'Create report'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
