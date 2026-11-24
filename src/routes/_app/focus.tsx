import { createFileRoute } from '@tanstack/react-router'
import { Check, Flame, PictureInPicture2, Play, Pause, Plus, SkipForward, Square, Target, Timer, Volume2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { getApp, useIndexVersion, useWs } from '#/lib/app'
import { isoDate } from '#/lib/dates'
import {
  DEFAULT_FOCUS,
  PRESETS,
  addTime,
  dismissFocus,
  fmt,
  focusStats,
  formatMinutes,
  pauseFocus,
  phaseLabel,
  playSound,
  resumeFocus,
  sessionMinutes,
  skipPhase,
  startFocus,
  stopFocus,
  timeLeft,
  upNext,
  useFocusRun,
  useNow,
  type FocusRun,
  type FocusTask,
} from '#/lib/focus'
import { completeTask } from '#/lib/focusTasks'
import type { FocusSettings, FocusSound } from '#/lib/types'
import { useDocumentTitle } from '#/lib/title'
import { Button } from '#/components/ui/button'
import { Select } from '#/components/ui/select'
import { Stepper } from '#/components/ui/stepper'
import { Switch } from '#/components/ui/switch'
import { cn } from '#/components/ui/cn'
import { toast } from '#/components/ui/toast'
import { FocusRing } from '#/components/focus/FocusRing'
import { canPopOut, useFocusPopOut } from '#/components/focus/FocusMini'

export const Route = createFileRoute('/_app/focus')({ component: FocusPage })

function useFocusSettings(): [FocusSettings, (p: Partial<FocusSettings>) => void] {
  const saved = useWs((s) => s.settings.focus)
  const settings = useMemo(() => ({ ...DEFAULT_FOCUS, ...(saved ?? {}) }), [saved])
  const set = (p: Partial<FocusSettings>) => getApp().ws.setSettings({ focus: { ...settings, ...p } })
  return [settings, set]
}

/** Today's unfinished tasks from every TODO list, to pick what you're working on. */
function useTodayTasks(): (FocusTask & { key: string; list: string })[] {
  const version = useIndexVersion()
  const lists = useWs((s) => Object.values(s.pages).filter((p) => p.kind === 'todo' && !p.trashedAt).map((p) => ({ id: p.id, title: p.title })))
  return useMemo(() => {
    const today = isoDate()
    const { index } = getApp()
    return lists.flatMap((l) =>
      (index.get(l.id)?.tasks ?? [])
        .filter((t) => t.day === today && !t.checked && !t.status && t.text.trim() && t.taskId)
        .map((t) => ({ key: `${l.id}:${t.taskId}`, text: t.text.trim(), taskId: t.taskId, listId: l.id, list: l.title || 'TODO' })),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lists, version])
}

function FocusPage() {
  const run = useFocusRun()
  useDocumentTitle('Focus')
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-24 pt-10 sm:px-8">
      <div className="mb-6 flex items-center gap-3">
        <Timer className="h-7 w-7 text-accent" />
        <div>
          <h1 className="text-[28px] font-bold leading-tight">Focus</h1>
          <p className="text-sm text-muted">Work in focused sets with short breaks between them (the Pomodoro technique).</p>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-xl border border-line p-5 sm:p-6">{run ? <Session run={run} /> : <Setup />}</div>
        <Progress />
      </div>
    </div>
  )
}

const SOUNDS: { value: FocusSound; label: string }[] = [
  { value: 'chime', label: 'Chime' },
  { value: 'bell', label: 'Bell' },
  { value: 'digital', label: 'Digital beeps' },
  { value: 'none', label: 'No sound' },
]

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-faint">{hint}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

function Setup() {
  const [s, set] = useFocusSettings()
  const tasks = useTodayTasks()
  const [taskKey, setTaskKey] = useState('')
  const total = sessionMinutes(s)
  const endsAt = new Date(Date.now() + total * 60_000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const preset = PRESETS.find((p) => p.focus === s.focus && p.short === s.short)?.label ?? 'custom'
  const start = () => {
    const t = tasks.find((x) => x.key === taskKey)
    startFocus(s, t ? { text: t.text, taskId: t.taskId, listId: t.listId } : undefined)
  }
  const breaks = s.sets - 1
  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 text-xs font-medium text-muted">Get ready to focus</div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Preset">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              role="radio"
              aria-checked={preset === p.label}
              onClick={() => set({ focus: p.focus, short: p.short })}
              className={cn(
                'h-9 rounded-full border px-4 text-sm font-medium transition',
                preset === p.label ? 'border-accent bg-accent-soft text-accent' : 'border-line hover:bg-hover',
              )}
            >
              {p.label}
            </button>
          ))}
          <span className={cn('flex h-9 items-center rounded-full border px-4 text-sm', preset === 'custom' ? 'border-accent bg-accent-soft text-accent' : 'border-dashed border-line text-faint')}>
            Custom
          </span>
        </div>
      </div>

      <div className="space-y-3.5">
        <Row label="Focus" hint="Minutes per set">
          <Stepper aria-label="Focus minutes" value={s.focus} min={1} max={240} step={5} suffix="min" onChange={(v) => set({ focus: v })} />
        </Row>
        <Row label="Break" hint={s.short === 0 ? 'No breaks between sets' : 'Minutes between sets'}>
          <Stepper aria-label="Break minutes" value={s.short} min={0} max={60} suffix="min" onChange={(v) => set({ short: v })} />
        </Row>
        <Row label="Sets" hint={s.sets === 1 ? 'One focus period' : `${s.sets} focus periods, ${breaks} break${breaks === 1 ? '' : 's'}`}>
          <Stepper aria-label="Sets" value={s.sets} min={1} max={12} onChange={(v) => set({ sets: v })} />
        </Row>
        <Row label="Long break" hint={s.longOn ? `After every ${s.longEvery} sets` : 'A longer rest after a few sets'}>
          {s.longOn && (
            <>
              <Stepper aria-label="Long break minutes" value={s.long} min={5} max={60} step={5} suffix="min" onChange={(v) => set({ long: v })} />
              <span className="text-xs text-faint">every</span>
              <Stepper aria-label="Long break every" value={s.longEvery} min={2} max={8} onChange={(v) => set({ longEvery: v })} />
            </>
          )}
          <Switch aria-label="Long break" checked={s.longOn} onCheckedChange={(v) => set({ longOn: v })} />
        </Row>
        <Row label="Keep going on its own" hint="Start breaks and the next set without waiting for you">
          <Switch aria-label="Keep going on its own" checked={s.auto} onCheckedChange={(v) => set({ auto: v })} />
        </Row>
        <Row label="Sound">
          <Select aria-label="Sound" value={s.sound} onValueChange={(v) => set({ sound: v as FocusSound })} options={SOUNDS} className="w-40" />
          <Button variant="ghost" size="sm" icon={<Volume2 />} disabled={s.sound === 'none'} onClick={() => playSound(s.sound)}>
            Test
          </Button>
        </Row>
        <Row label="Working on" hint={tasks.length ? "One of today's tasks (optional)" : 'Start a TODO day to pick a task'}>
          <Select
            aria-label="Working on"
            value={taskKey}
            onValueChange={setTaskKey}
            placeholder="Nothing in particular"
            options={[{ value: '', label: 'Nothing in particular' }, ...tasks.map((t) => ({ value: t.key, label: t.text.length > 48 ? t.text.slice(0, 47) + '…' : t.text }))]}
            className="w-64 max-w-full"
          />
        </Row>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <div className="text-sm text-muted">
          {s.sets} × {s.focus} min{s.sets > 1 && s.short > 0 ? ` with ${s.short} min breaks` : ''} · {formatMinutes(total)} in all · ends around {endsAt}
        </div>
        <Button variant="primary" icon={<Play />} onClick={start} className="h-10 px-5 text-[15px]">
          Start focus
        </Button>
      </div>
    </div>
  )
}

function Session({ run }: { run: FocusRun }) {
  const now = useNow(run.status === 'running')
  const pop = useFocusPopOut()
  const left = timeLeft(run, now)
  const progress = run.phaseLen ? (run.phaseLen - left) / run.phaseLen : 0
  const [markedDone, setMarkedDone] = useState(false)

  if (run.status === 'done') {
    const minutes = Math.round(run.focusedMs / 60_000)
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div className="text-5xl">🎉</div>
        <div>
          <div className="text-xl font-semibold">Session complete</div>
          <div className="mt-1 text-sm text-muted">
            You focused for {minutes} minute{minutes === 1 ? '' : 's'}
            {run.task ? ` on “${run.task.text}”` : ''}.
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {run.task?.taskId && run.task.listId && (
            <Button
              icon={<Check />}
              disabled={markedDone}
              onClick={async () => {
                const ok = await completeTask(run.task!.listId!, run.task!.taskId!)
                setMarkedDone(ok)
                toast(ok ? `Checked off “${run.task!.text}”.` : "Couldn't find that task in today's list.")
              }}
            >
              {markedDone ? 'Marked done' : 'Mark the task done'}
            </Button>
          )}
          <Button variant="primary" icon={<Play />} onClick={() => dismissFocus()}>
            Start another
          </Button>
        </div>
      </div>
    )
  }

  const waiting = run.status === 'waiting'
  const next = upNext(run)
  return (
    <div className="flex flex-col items-center gap-5">
      {pop.portal}
      <FocusRing progress={progress} phase={run.phase}>
        <div>
          <div className={cn('text-sm font-medium', run.phase === 'focus' ? 'text-accent' : 'text-[#2e9f6b]')}>{phaseLabel(run)}</div>
          <div className="text-[52px] font-semibold leading-none tabular-nums" aria-live="off" data-testid="focus-time">
            {fmt(left)}
          </div>
          <div className="mt-2 text-sm text-muted">
            Set {run.set} of {run.cfg.sets}
            {run.status === 'paused' && ' · paused'}
          </div>
        </div>
      </FocusRing>

      <div className="flex items-center gap-1.5" aria-label={`Set ${run.set} of ${run.cfg.sets}`}>
        {Array.from({ length: run.cfg.sets }, (_, i) => {
          const n = i + 1
          const done = n < run.set || (n === run.set && run.phase !== 'focus')
          return <span key={n} className={cn('h-2 w-6 rounded-full', done ? 'bg-accent' : n === run.set ? 'bg-accent/40' : 'bg-hover')} />
        })}
      </div>

      {run.task && (
        <div className="flex max-w-full items-center gap-2 rounded-full bg-subtle px-3 py-1 text-sm">
          <Target className="h-4 w-4 flex-none text-accent" />
          <span className="truncate">{run.task.text}</span>
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        {waiting ? (
          <Button variant="primary" icon={<Play />} onClick={resumeFocus} className="h-10 px-5">
            {run.phase === 'focus' ? `Start set ${run.set}` : run.phase === 'long' ? 'Start long break' : 'Start break'}
          </Button>
        ) : run.status === 'running' ? (
          <Button variant="primary" icon={<Pause />} onClick={pauseFocus} className="h-10 px-5">
            Pause
          </Button>
        ) : (
          <Button variant="primary" icon={<Play />} onClick={resumeFocus} className="h-10 px-5">
            Resume
          </Button>
        )}
        <Button icon={<Plus />} onClick={() => addTime(5 * 60_000)} className="h-10">
          5 min
        </Button>
        <Button icon={<SkipForward />} onClick={skipPhase} className="h-10">
          Skip {run.phase === 'focus' ? 'to break' : 'break'}
        </Button>
        <Button variant="ghost" icon={<Square />} onClick={stopFocus} className="h-10">
          Stop
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-muted">
        {next && <span>Up next: {next}</span>}
        {canPopOut() && !pop.isOpen && (
          <button onClick={() => void pop.open()} className="flex items-center gap-1 text-accent hover:underline">
            <PictureInPicture2 className="h-4 w-4" /> Keep on top
          </button>
        )}
      </div>
    </div>
  )
}

function Progress() {
  const [s, set] = useFocusSettings()
  const log = useWs((x) => x.focus)
  const stats = useMemo(() => focusStats(log, s.goal), [log, s.goal])
  const pct = s.goal ? Math.min(100, Math.round((stats.today / s.goal) * 100)) : 0
  const max = Math.max(s.goal, ...stats.week.map((d) => d.minutes), 1)
  const hm = formatMinutes
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-line p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold">Daily progress</div>
          <div className="flex items-center gap-1 text-sm text-muted" title="Days in a row you reached your goal">
            <Flame className={cn('h-4 w-4', stats.streak ? 'text-[#e9730c]' : 'text-faint')} />
            <span data-testid="focus-streak">{stats.streak}</span> day{stats.streak === 1 ? '' : 's'}
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold tabular-nums" data-testid="focus-today">
            {hm(stats.today)}
          </span>
          <span className="text-sm text-faint">of {hm(s.goal)}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-hover" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Daily goal">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-4 flex items-end justify-between gap-1.5" aria-label="Last 7 days">
          {stats.week.map((d) => (
            <div key={d.day} className="flex flex-1 flex-col items-center gap-1" title={`${d.day}: ${d.minutes} min`}>
              <div className="flex h-16 w-full items-end">
                <div className={cn('w-full rounded-sm', d.minutes >= s.goal && s.goal ? 'bg-accent' : 'bg-accent/35')} style={{ height: `${Math.max(d.minutes ? 6 : 2, (d.minutes / max) * 100)}%` }} />
              </div>
              <span className="text-[10px] text-faint">{new Date(d.day + 'T12:00').toLocaleDateString([], { weekday: 'narrow' })}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-sm">
          <span className="whitespace-nowrap text-muted">Yesterday: {hm(stats.yesterday)}</span>
          <label className="flex items-center gap-2 text-muted">
            Goal
            <Stepper aria-label="Daily goal minutes" value={s.goal} min={15} max={720} step={15} suffix="min" onChange={(v) => set({ goal: v })} />
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-line p-5">
        <div className="mb-2 text-sm font-semibold">Today</div>
        {stats.todays.length === 0 ? (
          <p className="text-sm text-faint">Finished focus sets show up here.</p>
        ) : (
          <ul className="space-y-1.5 text-sm" data-testid="focus-log">
            {stats.todays.slice(0, 12).map((e) => (
              <li key={e.id} className="flex items-center gap-2">
                <span className="w-16 flex-none tabular-nums text-faint">{new Date(e.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                <span className="flex-none font-medium tabular-nums">{e.minutes} min</span>
                {e.task && <span className="truncate text-muted">· {e.task}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
