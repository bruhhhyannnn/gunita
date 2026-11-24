import { useNavigate } from '@tanstack/react-router'
import { CheckSquare, Database, FileText, Loader2, Paperclip, Upload } from 'lucide-react'
import { useState } from 'react'
import type { ImportPlan, Progress } from '#/lib/notion/importer'
import { pickFile } from '#/editor/uploads'
import { Dialog } from './ui/dialog'
import { Button } from './ui/button'
import { CheckboxField } from './ui/checkbox'
import { Select } from './ui/select'

type State =
  | { step: 'idle' }
  | { step: 'reading' }
  | { step: 'review'; plan: ImportPlan }
  | { step: 'importing'; progress: Progress }
  | { step: 'done'; created: number; warnings: string[]; rootId: string | null; todoIds: string[] }
  | { step: 'error'; message: string }

function mb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Settings → Import from Notion (Markdown & CSV export zip). */
export function NotionImport() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<State>({ step: 'idle' })
  const [container, setContainer] = useState(true)
  const [todoKeys, setTodoKeys] = useState<string[]>([])
  const [carry, setCarry] = useState<'latest' | 'all'>('latest')

  const choose = async () => {
    const file = await pickFile('.zip,application/zip')
    if (!file) return
    setOpen(true)
    setState({ step: 'reading' })
    try {
      const { analyzeExport } = await import('#/lib/notion/importer')
      const plan = analyzeExport(new Uint8Array(await file.arrayBuffer()))
      if (!plan.pages.size) throw new Error("This zip doesn't look like a Notion export (no .md pages found). Export with “Markdown & CSV”.")
      setTodoKeys(plan.todoCandidates.filter((c) => /todo/i.test(c.title)).map((c) => c.key))
      setState({ step: 'review', plan })
    } catch (e) {
      setState({ step: 'error', message: (e as Error).message })
    }
  }

  const run = async (plan: ImportPlan) => {
    setState({ step: 'importing', progress: { step: 'Starting…', done: 0, total: plan.pages.size } })
    try {
      const { runImport } = await import('#/lib/notion/importer')
      const r = await runImport(plan, { container, todoKeys, carry }, (progress) => setState({ step: 'importing', progress }))
      setState({ step: 'done', ...r })
    } catch (e) {
      setState({ step: 'error', message: (e as Error).message })
    }
  }

  const busy = state.step === 'reading' || state.step === 'importing'
  return (
    <>
      <Button icon={<Upload />} onClick={() => void choose()}>
        Choose zip
      </Button>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)} title="Import from Notion">
        <div className="px-5 py-4 text-sm">
          {state.step === 'reading' && (
            <p className="flex items-center gap-2 text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Reading your export…
            </p>
          )}
          {state.step === 'error' && <p className="text-danger">{state.message}</p>}
          {state.step === 'review' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <Stat icon={<FileText />} label="Pages" value={state.plan.counts.pages} />
                <Stat icon={<Database />} label={`Databases (${state.plan.counts.rows} rows)`} value={state.plan.counts.databases} />
                <Stat icon={<Paperclip />} label={`Files (${mb(state.plan.attachmentBytes)})`} value={state.plan.attachments.length} />
              </div>
              {state.plan.todoCandidates.length > 0 && (
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5 font-medium">
                    <CheckSquare className="h-4 w-4 text-muted" /> Turn into TODO lists
                  </div>
                  <p className="mb-2 text-xs text-muted">These pages have tasks under date lines. Each date becomes a day; tasks you repeat almost daily become the daily template.</p>
                  <div className="space-y-1.5">
                    {state.plan.todoCandidates.map((c) => (
                      <CheckboxField
                        key={c.key}
                        label={c.title}
                        hint={`${c.days} days`}
                        checked={todoKeys.includes(c.key)}
                        onCheckedChange={(v) => setTodoKeys((k) => (v ? [...k, c.key] : k.filter((x) => x !== c.key)))}
                      />
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-xs text-muted">Carry unfinished tasks from</span>
                    <Select
                      size="xs"
                      aria-label="Carry over"
                      value={carry}
                      onValueChange={(v) => setCarry(v as 'latest' | 'all')}
                      options={[
                        { value: 'latest', label: 'only the latest day (recommended)' },
                        { value: 'all', label: 'every day' },
                      ]}
                    />
                  </div>
                </div>
              )}
              <CheckboxField
                label="Put everything inside an “Imported from Notion” page"
                hint="Handy while testing: delete that one page to undo the import. TODO lists always go at the top."
                checked={container}
                onCheckedChange={setContainer}
              />
              {!navigator.onLine && <p className="text-xs text-danger">You're offline: pages will import, but images and files need a connection to upload.</p>}
            </div>
          )}
          {state.step === 'importing' && (
            <div>
              <p className="truncate text-muted">{state.progress.step}</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-hover">
                <div className="h-full bg-accent transition-all" style={{ width: `${Math.round((state.progress.done / Math.max(1, state.progress.total)) * 100)}%` }} />
              </div>
              <p className="mt-2 text-xs text-faint">Keep this window open. Everything is saved on this device and syncs afterwards.</p>
            </div>
          )}
          {state.step === 'done' && (
            <div className="space-y-2">
              <p>
                Imported <strong>{state.created}</strong> pages and rows.
              </p>
              {state.warnings.length > 0 && (
                <details className="rounded-md bg-subtle p-2 text-xs text-muted">
                  <summary className="cursor-pointer">{state.warnings.length} note{state.warnings.length === 1 ? '' : 's'}</summary>
                  <ul className="mt-1 list-disc pl-4">
                    {state.warnings.slice(0, 50).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          {state.step === 'review' && (
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void run(state.plan)}>
                Import
              </Button>
            </>
          )}
          {(state.step === 'done' || state.step === 'error') && (
            <>
              {state.step === 'done' && (state.todoIds[0] || state.rootId) && (
                <Button
                  onClick={() => {
                    setOpen(false)
                    void navigate({ to: '/p/$pageId', params: { pageId: (state.todoIds[0] ?? state.rootId)! } })
                  }}
                >
                  {state.todoIds[0] ? 'Open TODO list' : 'Open imported pages'}
                </Button>
              )}
              <Button variant="primary" onClick={() => setOpen(false)}>
                Close
              </Button>
            </>
          )}
        </div>
      </Dialog>
    </>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted [&_svg]:h-3.5 [&_svg]:w-3.5">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  )
}
