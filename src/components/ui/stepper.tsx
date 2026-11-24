import { Minus, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from './cn'

/** A number with − and + buttons; you can also type the number. */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  suffix,
  className,
  'aria-label': ariaLabel,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
  className?: string
  'aria-label'?: string
}) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const clamp = (n: number) => Math.min(max, Math.max(min, n))
  const commit = (raw: string) => {
    const n = Number(raw.replace(/[^\d]/g, ''))
    const next = raw.trim() === '' || Number.isNaN(n) ? value : clamp(n)
    setText(String(next))
    if (next !== value) onChange(next)
  }
  const btn = 'grid h-full w-8 flex-none place-items-center text-muted transition hover:bg-hover hover:text-fg disabled:pointer-events-none disabled:opacity-30 [&_svg]:h-3.5 [&_svg]:w-3.5'
  return (
    <div className={cn('inline-flex h-9 items-stretch overflow-hidden rounded-md border border-line bg-bg', className)}>
      <button type="button" className={btn} aria-label={`Less ${ariaLabel ?? ''}`.trim()} disabled={value <= min} onClick={() => onChange(clamp(value - step))}>
        <Minus />
      </button>
      <label className="flex min-w-0 items-center gap-1 border-x border-line px-1.5">
        <input
          inputMode="numeric"
          aria-label={ariaLabel}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit((e.target as HTMLInputElement).value)
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              onChange(clamp(value + step))
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              onChange(clamp(value - step))
            }
          }}
          className="w-9 bg-transparent text-center text-sm tabular-nums outline-none"
        />
        {suffix && <span className="text-xs text-faint">{suffix}</span>}
      </label>
      <button type="button" className={btn} aria-label={`More ${ariaLabel ?? ''}`.trim()} disabled={value >= max} onClick={() => onChange(clamp(value + step))}>
        <Plus />
      </button>
    </div>
  )
}
