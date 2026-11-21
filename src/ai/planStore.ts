import { useSyncExternalStore } from 'react'

export interface PlanSuggestion {
  text: string
  reason: string
}

interface PlanState {
  date: string
  status: 'idle' | 'loading' | 'ready' | 'error'
  error?: string
  suggestions: PlanSuggestion[]
}

const plans = new Map<string, PlanState>()
const listeners = new Set<() => void>()
const EMPTY: PlanState = { date: '', status: 'idle', suggestions: [] }

function emit() {
  listeners.forEach((l) => l())
}

export function getPlan(pageId: string): PlanState {
  return plans.get(pageId) ?? EMPTY
}

export function setPlan(pageId: string, s: PlanState) {
  plans.set(pageId, s)
  emit()
}

export function nextPlanSuggestion(pageId: string): string | null {
  return plans.get(pageId)?.suggestions[0]?.text ?? null
}

export function takePlanSuggestion(pageId: string, index = 0): PlanSuggestion | null {
  const p = plans.get(pageId)
  if (!p?.suggestions[index]) return null
  const [taken] = p.suggestions.splice(index, 1)
  plans.set(pageId, { ...p, suggestions: [...p.suggestions] })
  emit()
  return taken
}

export function usePlan(pageId: string) {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => getPlan(pageId),
    () => getPlan(pageId),
  )
}
