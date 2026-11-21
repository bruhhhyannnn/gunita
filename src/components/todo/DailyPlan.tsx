import type { Editor } from '@tiptap/react'
import { Loader2, Plus, RefreshCw, Sparkles, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useApp, useWs } from '#/lib/app'
import { isoDate } from '#/lib/dates'
import type { PageMeta } from '#/lib/types'
import { postJson } from '#/ai/client'
import { buildPlanContext } from '#/ai/context'
import { getPlan, setPlan, takePlanSuggestion, usePlan, type PlanSuggestion } from '#/ai/planStore'
import { appendTaskToday } from '#/todo/logic'

const DISMISS_KEY = 'gunita:plan-dismissed'

async function fetchPlan(page: PageMeta, editor: Editor) {
  const today = isoDate()
  setPlan(page.id, { date: today, status: 'loading', suggestions: [] })
  try {
    const r = await postJson<{ suggestions: PlanSuggestion[] }>('/api/ai/plan', buildPlanContext(editor, page.id))
    setPlan(page.id, { date: today, status: 'ready', suggestions: r.suggestions })
  } catch (e) {
    setPlan(page.id, { date: today, status: 'error', error: (e as Error).message, suggestions: [] })
  }
}

/** "Suggested for today": AI ideas you can add with a click, or with Tab on an empty task. */
export function DailyPlan({ page, editor }: { page: PageMeta; editor: Editor }) {
  const { config } = useApp()
  const enabled = useWs((s) => s.settings.ghostTextInTodo !== false)
  const plan = usePlan(page.id)
  const today = isoDate()
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === `${page.id}:${today}`
    } catch {
      return false
    }
  })
  const allowed = enabled && config?.claudeConfigured && page.hiddenFromAI !== true

  useEffect(() => {
    if (!allowed || dismissed || !navigator.onLine) return
    if (getPlan(page.id).date === today) return
    // Let the page index catch up with the new day first.
    const t = setTimeout(() => void fetchPlan(page, editor), 1500)
    return () => clearTimeout(t)
  }, [allowed, dismissed, page, editor, today])

  if (!allowed || dismissed || plan.status === 'idle') return null
  if (plan.status === 'ready' && plan.suggestions.length === 0) return null

  const add = (i: number) => {
    const s = takePlanSuggestion(page.id, i)
    if (s) appendTaskToday(editor, s.text, { source: 'ai' })
  }

  return (
    <div className="mt-3 rounded-lg border border-line bg-subtle px-3 py-2.5">
      <div className="mb-1 flex items-center gap-2 text-sm">
        <Sparkles className="h-4 w-4 text-[#a371f7]" />
        <span className="font-medium">Suggested for today</span>
        {plan.status === 'loading' && <Loader2 className="h-3.5 w-3.5 animate-spin text-faint" />}
        <span className="text-xs text-faint">Tab on an empty task adds the next one</span>
        <div className="flex-1" />
        {plan.status === 'ready' && plan.suggestions.length > 1 && (
          <button
            className="rounded px-1.5 py-0.5 text-xs text-muted hover:bg-hover"
            onClick={() => {
              while (getPlan(page.id).suggestions.length) add(0)
            }}
          >
            Add all
          </button>
        )}
        <button className="rounded p-1 text-faint hover:bg-hover" title="Refresh" onClick={() => void fetchPlan(page, editor)}>
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
        <button
          className="rounded p-1 text-faint hover:bg-hover"
          title="Hide for today"
          onClick={() => {
            setDismissed(true)
            try {
              localStorage.setItem(DISMISS_KEY, `${page.id}:${today}`)
            } catch {
              /* ignore */
            }
          }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {plan.status === 'error' && <p className="text-sm text-muted">{plan.error}</p>}
      {plan.status === 'loading' && <p className="text-sm text-faint">Looking at your calendar, notes and habits…</p>}
      {plan.suggestions.map((s, i) => (
        <div key={s.text + i} className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-hover">
          <button onClick={() => add(i)} className="grid h-5 w-5 flex-none place-items-center rounded border border-dashed border-faint text-faint group-hover:border-accent group-hover:text-accent" title="Add to today">
            <Plus className="h-3 w-3" />
          </button>
          <span className="text-[15px] text-muted">{s.text}</span>
          <span className="truncate text-xs text-faint">· {s.reason}</span>
        </div>
      ))}
    </div>
  )
}
