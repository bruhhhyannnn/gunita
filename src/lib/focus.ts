import { useEffect, useState, useSyncExternalStore } from 'react'
import { getApp } from './app'
import { isoDate, addDays } from './dates'
import { newId } from './ids'
import { setTitlePrefix } from './title'
import type { FocusConfig, FocusEntry, FocusSettings, FocusSound } from './types'

/**
 * The focus (Pomodoro) timer. Times are kept as timestamps, so the countdown
 * stays right in a background tab and across reloads. The running session
 * lives in this browser (localStorage); finished focus periods are saved to
 * the workspace so every device shows the same daily progress and streak.
 */

export type Phase = 'focus' | 'break' | 'long'
export type RunStatus = 'running' | 'paused' | 'waiting' | 'done'

export interface FocusTask {
  text: string
  taskId?: string
  listId?: string
}

export interface FocusRun {
  id: string
  cfg: FocusConfig
  phase: Phase
  /** The current set, 1-based (during a break: the set just finished). */
  set: number
  status: RunStatus
  /** When the phase ends, while running. */
  endsAt: number | null
  /** Time left, while paused or waiting to start the phase. */
  left: number
  /** Length of the current phase (grows with "+5 min"). */
  phaseLen: number
  /** When the current focus period started (for the log). */
  phaseStart: number
  focusedMs: number
  task?: FocusTask
  startedAt: number
}

export const DEFAULT_FOCUS: FocusSettings = {
  focus: 25,
  short: 5,
  sets: 4,
  longOn: false,
  longEvery: 4,
  long: 15,
  auto: true,
  sound: 'chime',
  goal: 120,
}

export const PRESETS: { label: string; focus: number; short: number }[] = [
  { label: '25 / 5', focus: 25, short: 5 },
  { label: '30 / 5', focus: 30, short: 5 },
  { label: '50 / 10', focus: 50, short: 10 },
]

const KEY = 'gunita:focus-run'
const MIN = 60_000

export function focusSettings(): FocusSettings {
  return { ...DEFAULT_FOCUS, ...(getApp().ws.getSnapshot().settings.focus ?? {}) }
}

// ---------- Store ----------

let run: FocusRun | null = load()
const listeners = new Set<() => void>()

function load(): FocusRun | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
    return raw ? (JSON.parse(raw) as FocusRun) : null
  } catch {
    return null
  }
}

function save(next: FocusRun | null) {
  run = next
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next))
    else localStorage.removeItem(KEY)
  } catch {
    /* private mode: the timer still works in this tab */
  }
  listeners.forEach((l) => l())
  schedule()
}

export function getRun() {
  return run
}

export function useFocusRun(): FocusRun | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => run,
    () => null,
  )
}

/** Re-renders every quarter second while the timer runs. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [active])
  return active ? now : Date.now()
}

export function timeLeft(r: FocusRun, now = Date.now()): number {
  return r.status === 'running' && r.endsAt ? Math.max(0, r.endsAt - now) : r.left
}

export function fmt(ms: number): string {
  const s = Math.ceil(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** "1 h 40 min", "55 min". */
export function formatMinutes(m: number): string {
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (!h) return `${rest} min`
  return rest ? `${h} h ${rest} min` : `${h} h`
}

export function phaseLabel(r: FocusRun): string {
  if (r.status === 'done') return 'Session complete'
  if (r.phase === 'focus') return 'Focus'
  return r.phase === 'long' ? 'Long break' : 'Break'
}

/** What comes after this phase, e.g. "5 min break" or "Set 3 of 4". */
export function upNext(r: FocusRun): string | null {
  if (r.status === 'done') return null
  if (r.phase === 'focus') {
    if (r.set >= r.cfg.sets) return 'The end of the session'
    const next = nextBreak(r.cfg, r.set)
    return next ? `${next.minutes} min ${next.phase === 'long' ? 'long break' : 'break'}` : `Set ${r.set + 1} of ${r.cfg.sets}`
  }
  return `Set ${r.set + 1} of ${r.cfg.sets} · ${r.cfg.focus} min focus`
}

function nextBreak(cfg: FocusConfig, set: number): { phase: Phase; minutes: number } | null {
  if (cfg.longOn && cfg.longEvery > 0 && set % cfg.longEvery === 0 && cfg.long > 0) return { phase: 'long', minutes: cfg.long }
  return cfg.short > 0 ? { phase: 'break', minutes: cfg.short } : null
}

/** Total length of a session, breaks included (no break after the last set). */
export function sessionMinutes(cfg: FocusConfig): number {
  let total = cfg.focus * cfg.sets
  for (let set = 1; set < cfg.sets; set++) total += nextBreak(cfg, set)?.minutes ?? 0
  return total
}

// ---------- Actions ----------

export function startFocus(cfg: FocusConfig, task?: FocusTask) {
  unlockAudio()
  void askNotify()
  const now = Date.now()
  const len = cfg.focus * MIN
  save({
    id: newId(),
    cfg,
    phase: 'focus',
    set: 1,
    status: 'running',
    endsAt: now + len,
    left: len,
    phaseLen: len,
    phaseStart: now,
    focusedMs: 0,
    task,
    startedAt: now,
  })
}

export function pauseFocus() {
  if (!run || run.status !== 'running' || !run.endsAt) return
  save({ ...run, status: 'paused', left: Math.max(0, run.endsAt - Date.now()), endsAt: null })
}

/** Resumes a paused phase, or starts the next one when waiting. */
export function resumeFocus() {
  if (!run || (run.status !== 'paused' && run.status !== 'waiting')) return
  unlockAudio()
  const now = Date.now()
  save({ ...run, status: 'running', endsAt: now + run.left, phaseStart: run.status === 'waiting' && run.phase === 'focus' ? now : run.phaseStart })
}

export function addTime(ms: number) {
  if (!run || run.status === 'done') return
  save({
    ...run,
    phaseLen: run.phaseLen + ms,
    endsAt: run.endsAt ? run.endsAt + ms : null,
    left: run.status === 'running' ? run.left : run.left + ms,
  })
}

/** Ends the current phase now and moves on. */
export function skipPhase() {
  if (!run || run.status === 'done') return
  advance(run, Date.now(), { early: true, quiet: true })
}

/** Ends the session, keeping the focus time so far. */
export function stopFocus() {
  if (!run) return
  if (run.status === 'done') return save(null)
  let focused = run.focusedMs
  if (run.phase === 'focus' && run.status !== 'waiting') {
    const spent = run.phaseLen - timeLeft(run)
    focused += spent
    logPeriod(run, spent)
  }
  save({ ...run, status: 'done', endsAt: null, left: 0, focusedMs: focused })
}

export function dismissFocus() {
  save(null)
}

function logPeriod(r: FocusRun, ms: number) {
  const minutes = Math.round(ms / MIN)
  if (minutes < 1) return
  try {
    getApp().ws.logFocus({
      start: r.phaseStart,
      day: isoDate(new Date(r.phaseStart)),
      minutes,
      ...(r.task?.text ? { task: r.task.text } : {}),
      ...(r.task?.taskId ? { taskId: r.task.taskId } : {}),
      ...(r.task?.listId ? { listId: r.task.listId } : {}),
    })
  } catch {
    /* app not started (e.g. on the login page) */
  }
}

/** Moves from the current phase to the next. `at` is when the phase ended. */
function advance(r: FocusRun, at: number, opts: { early?: boolean; quiet?: boolean } = {}) {
  const spent = opts.early ? r.phaseLen - timeLeft(r, at) : r.phaseLen
  let next: FocusRun
  if (r.phase === 'focus') {
    if (r.status !== 'waiting') logPeriod(r, spent)
    const focusedMs = r.focusedMs + (r.status === 'waiting' ? 0 : spent)
    if (r.set >= r.cfg.sets) {
      next = { ...r, status: 'done', endsAt: null, left: 0, focusedMs }
      if (!opts.quiet) cue('done', `Session complete: ${Math.round(focusedMs / MIN)} minutes of focus.`, r.cfg.sound)
      return save(next)
    }
    const brk = nextBreak(r.cfg, r.set)
    if (brk) {
      next = { ...r, phase: brk.phase, focusedMs, phaseLen: brk.minutes * MIN }
      if (!opts.quiet) cue('break', `Set ${r.set} of ${r.cfg.sets} done. Take a ${brk.minutes}-minute ${brk.phase === 'long' ? 'long break' : 'break'}.`, r.cfg.sound)
    } else {
      next = { ...r, set: r.set + 1, phase: 'focus', focusedMs, phaseLen: r.cfg.focus * MIN }
      if (!opts.quiet) cue('focus', `Set ${r.set} done. Set ${r.set + 1} of ${r.cfg.sets} starts now.`, r.cfg.sound)
    }
  } else {
    next = { ...r, set: r.set + 1, phase: 'focus', phaseLen: r.cfg.focus * MIN }
    if (!opts.quiet) cue('focus', `Break's over. Set ${r.set + 1} of ${r.cfg.sets}: ${r.cfg.focus} minutes of focus.`, r.cfg.sound)
  }
  // Skipping always starts the next phase; otherwise it waits unless "auto" is on.
  const autoGo = r.cfg.auto || opts.early
  const start = opts.early ? Date.now() : at
  next = autoGo
    ? { ...next, status: 'running', endsAt: start + next.phaseLen, left: next.phaseLen, phaseStart: start }
    : { ...next, status: 'waiting', endsAt: null, left: next.phaseLen, phaseStart: start }
  save(next)
}

/** Catches up on phases that ended (also after the app was closed for a while). */
function tick() {
  let guard = 50
  while (run && run.status === 'running' && run.endsAt && run.endsAt <= Date.now() && guard-- > 0) {
    // Only sound the alarm for a phase that just ended, not ones missed while closed.
    const late = Date.now() - run.endsAt > 90_000
    advance(run, run.endsAt, { quiet: late })
  }
  updateTitle()
}

// ---------- Engine (one tab runs it; the others just show the time) ----------

let timer: ReturnType<typeof setTimeout> | null = null
let leader = typeof navigator === 'undefined' || !('locks' in navigator)

function schedule() {
  if (timer) clearTimeout(timer)
  timer = null
  updateTitle()
  if (!leader || !run || run.status !== 'running' || !run.endsAt) return
  // A single timeout (not a chain) so background tabs aren't throttled to once a minute.
  timer = setTimeout(tick, Math.max(0, run.endsAt - Date.now()) + 30)
}

function updateTitle() {
  if (!run || run.status === 'done') return setTitlePrefix('')
  const icon = run.status === 'running' ? (run.phase === 'focus' ? '▶' : '☕') : '⏸'
  setTitlePrefix(`${icon} ${fmt(timeLeft(run))} · `)
}

let started = false

/** Call once when the app starts. */
export function startFocusEngine() {
  if (started || typeof window === 'undefined') return
  started = true
  // Another tab changed the timer.
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return
    run = load()
    listeners.forEach((l) => l())
    schedule()
  })
  setInterval(updateTitle, 1000)
  if (!leader) {
    void navigator.locks.request('gunita-focus-timer', () => {
      leader = true
      run = load()
      tick()
      schedule()
      return new Promise<void>(() => {}) // hold the lock while this tab is open
    })
  } else {
    tick()
    schedule()
  }
}

// ---------- Progress ----------

export interface FocusStats {
  today: number
  yesterday: number
  streak: number
  todays: FocusEntry[]
  week: { day: string; minutes: number }[]
}

export function focusStats(log: FocusEntry[], goal: number): FocusStats {
  const byDay = new Map<string, number>()
  for (const e of log) byDay.set(e.day, (byDay.get(e.day) ?? 0) + e.minutes)
  const today = isoDate()
  // Days in a row that met the goal, counting today only once it's met.
  let streak = 0
  let d = (byDay.get(today) ?? 0) >= goal ? today : addDays(today, -1)
  while ((byDay.get(d) ?? 0) >= goal && goal > 0) {
    streak++
    d = addDays(d, -1)
  }
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, i - 6)
    return { day, minutes: byDay.get(day) ?? 0 }
  })
  return {
    today: byDay.get(today) ?? 0,
    yesterday: byDay.get(addDays(today, -1)) ?? 0,
    streak,
    todays: log.filter((e) => e.day === today).sort((a, b) => b.start - a.start),
    week,
  }
}

// ---------- Sound and notifications ----------

let audio: AudioContext | null = null

/** Browsers only play sound after a click; call this from Start/Resume. */
export function unlockAudio() {
  try {
    audio ??= new AudioContext()
    if (audio.state === 'suspended') void audio.resume()
  } catch {
    /* no Web Audio */
  }
}

function note(ctx: AudioContext, freq: number, at: number, dur: number, type: OscillatorType, gain: number) {
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.value = freq
  g.gain.setValueAtTime(0, at)
  g.gain.linearRampToValueAtTime(gain, at + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  o.connect(g).connect(ctx.destination)
  o.start(at)
  o.stop(at + dur + 0.05)
}

/** Plays one of the alert sounds (made with Web Audio, no files needed). */
export function playSound(sound: FocusSound, times = 1) {
  if (sound === 'none') return
  unlockAudio()
  const ctx = audio
  if (!ctx) return
  const t0 = ctx.currentTime + 0.05
  for (let i = 0; i < times; i++) {
    const t = t0 + i * 1.6
    if (sound === 'chime') [659.25, 783.99, 1046.5].forEach((f, j) => note(ctx, f, t + j * 0.18, 1.2, 'sine', 0.25))
    else if (sound === 'bell') {
      note(ctx, 880, t, 2.2, 'sine', 0.3)
      note(ctx, 1760, t, 1.2, 'sine', 0.08)
      note(ctx, 2640, t, 0.8, 'sine', 0.04)
    } else [0, 0.18, 0.36, 0.54].forEach((d) => note(ctx, 1200, t + d, 0.12, 'square', 0.08))
  }
}

async function askNotify() {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') await Notification.requestPermission()
  } catch {
    /* not supported */
  }
}

/** A sound, a system notification (when the tab isn't in front) and an in-app event. */
function cue(kind: 'break' | 'focus' | 'done', text: string, sound: FocusSound) {
  playSound(sound, kind === 'done' ? 2 : 1)
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
      new Notification(kind === 'done' ? 'Focus session complete' : kind === 'break' ? 'Time for a break' : 'Back to focus', {
        body: text,
        icon: '/icon-192.png',
        tag: 'gunita-focus',
      })
    }
  } catch {
    /* notifications unavailable */
  }
  window.dispatchEvent(new CustomEvent('gunita:focus-cue', { detail: { kind, text } }))
}
