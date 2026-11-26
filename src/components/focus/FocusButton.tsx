import { useNavigate } from '@tanstack/react-router'
import { ExternalLink, Pause, Play, Plus, SkipForward, Square, Timer } from 'lucide-react'
import { useWs } from '#/lib/app'
import {
  DEFAULT_FOCUS,
  addTime,
  fmt,
  formatMinutes,
  pauseFocus,
  phaseLabel,
  resumeFocus,
  sessionMinutes,
  skipPhase,
  startFocus,
  stopFocus,
  timeLeft,
  useFocusRun,
  useNow,
} from '#/lib/focus'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '../ui/menu'
import { cn } from '../ui/cn'
import { toast } from '../ui/toast'

/**
 * Focus in the page's top bar. Idle: one click starts a session with your
 * Focus settings. Running: shows the time left; click for pause, skip, stop.
 */
export function FocusButton() {
  const run = useFocusRun()
  const navigate = useNavigate()
  const saved = useWs((s) => s.settings.focus)
  const cfg = { ...DEFAULT_FOCUS, ...(saved ?? {}) }
  const live = run && run.status !== 'done'
  const now = useNow(!!live && run.status === 'running')

  if (!live) {
    const plan = `${cfg.sets} × ${cfg.focus} min${cfg.sets > 1 && cfg.short ? ` + ${cfg.short} min breaks` : ''}`
    return (
      <button
        title={`Start focus: ${plan} (${formatMinutes(sessionMinutes(cfg))}). Change it on the Focus page.`}
        aria-label="Start focus"
        onClick={() => {
          startFocus(cfg)
          toast(`Focus started: ${plan}.`, { label: 'Open timer', run: () => void navigate({ to: '/focus' }) })
        }}
        className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-hover"
      >
        <Timer className="h-4 w-4" />
      </button>
    )
  }

  const running = run.status === 'running'
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          aria-label="Focus timer"
          title={`${phaseLabel(run)} · set ${run.set} of ${run.cfg.sets}`}
          className={cn(
            'flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium tabular-nums hover:bg-hover',
            run.phase === 'focus' ? 'text-accent' : 'text-[#2e9f6b]',
          )}
        >
          <span className={cn('h-2 w-2 rounded-full', run.phase === 'focus' ? 'bg-accent' : 'bg-[#2e9f6b]', running && 'animate-pulse')} />
          {running ? '' : '⏸ '}
          {fmt(timeLeft(run, now))}
        </button>
      </MenuTrigger>
      <MenuContent align="end" className="w-52">
        <MenuLabel>
          {phaseLabel(run)} · set {run.set} of {run.cfg.sets}
        </MenuLabel>
        {running ? (
          <MenuItem icon={<Pause />} onSelect={pauseFocus}>
            Pause
          </MenuItem>
        ) : (
          <MenuItem icon={<Play />} onSelect={resumeFocus}>
            {run.status === 'waiting' ? (run.phase === 'focus' ? `Start set ${run.set}` : 'Start break') : 'Resume'}
          </MenuItem>
        )}
        <MenuItem icon={<Plus />} onSelect={() => addTime(5 * 60_000)}>
          5 more minutes
        </MenuItem>
        <MenuItem icon={<SkipForward />} onSelect={skipPhase}>
          {run.phase === 'focus' ? 'Skip to break' : 'Skip break'}
        </MenuItem>
        <MenuItem icon={<Square />} onSelect={stopFocus}>
          Stop
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={<ExternalLink />} onSelect={() => void navigate({ to: '/focus' })}>
          Open Focus page
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}
