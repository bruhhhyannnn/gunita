import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { addDays, isoDate, parseIso, shortDate } from '#/lib/dates'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { Button } from './button'
import { cn } from './cn'

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/** A month calendar. Dates are local YYYY-MM-DD strings. */
export function Calendar({
  value,
  onChange,
  min,
  max,
}: {
  value?: string | null
  onChange: (date: string) => void
  min?: string
  max?: string
}) {
  const initial = value ? parseIso(value) : new Date()
  const [month, setMonth] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1))
  const start = new Date(month)
  start.setDate(1 - start.getDay())
  const days = Array.from({ length: 42 }, (_, i) => isoDate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)))
  const today = isoDate()
  return (
    <div className="w-[252px] select-none p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="pl-1 text-sm font-semibold">{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
        <div className="flex">
          <button type="button" aria-label="Previous month" className="grid h-7 w-7 place-items-center rounded hover:bg-hover" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Next month" className="grid h-7 w-7 place-items-center rounded hover:bg-hover" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] text-faint">
        {DOW.map((d, i) => (
          <div key={i} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const inMonth = parseIso(d).getMonth() === month.getMonth()
          const disabled = (min && d < min) || (max && d > max)
          return (
            <button
              type="button"
              key={d}
              disabled={!!disabled}
              onClick={() => onChange(d)}
              className={cn(
                'm-px grid h-8 place-items-center rounded-md text-[13px] hover:bg-hover disabled:cursor-not-allowed disabled:opacity-30',
                !inMonth && 'text-faint',
                d === today && 'font-semibold text-danger',
                d === value && 'bg-accent text-white hover:bg-accent',
              )}
            >
              {parseIso(d).getDate()}
            </button>
          )
        })}
      </div>
      <div className="mt-1 flex justify-between border-t border-line pt-1.5">
        <button type="button" className="rounded px-2 py-1 text-xs text-muted hover:bg-hover" onClick={() => onChange(today)}>
          Today
        </button>
        <button type="button" className="rounded px-2 py-1 text-xs text-muted hover:bg-hover" onClick={() => onChange(addDays(today, 1))}>
          Tomorrow
        </button>
      </div>
    </div>
  )
}

/** A button showing a date that opens a calendar. */
export function DatePicker({
  value,
  onChange,
  min,
  max,
  placeholder = 'Pick a date',
  clearable,
  className,
  trigger,
}: {
  value?: string | null
  onChange: (date: string | null) => void
  min?: string
  max?: string
  placeholder?: string
  clearable?: boolean
  className?: string
  trigger?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            className={cn(
              'inline-flex h-8 items-center gap-2 rounded-md border border-line bg-bg px-2.5 text-sm outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent/30',
              !value && 'text-faint',
              className,
            )}
          >
            <CalendarDays className="h-3.5 w-3.5 text-faint" />
            {value ? shortDate(value) : placeholder}
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start">
        <Calendar
          value={value}
          min={min}
          max={max}
          onChange={(d) => {
            onChange(d)
            setOpen(false)
          }}
        />
        {clearable && value && (
          <div className="px-2 pb-2">
            <Button
              size="sm"
              variant="ghost"
              className="w-full"
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
            >
              Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

const TIMES = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4)
  const m = (i % 4) * 15
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
})

function timeLabel(t: string) {
  const [h, m] = t.split(':').map(Number)
  return new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/** Date + time (15-minute steps) for meeting times. Value is an ISO datetime. */
export function DateTimePicker({ value, onChange }: { value?: string; onChange: (iso: string | undefined) => void }) {
  const d = value ? new Date(value) : null
  const date = d ? isoDate(d) : null
  const time = d ? `${String(d.getHours()).padStart(2, '0')}:${String(Math.floor(d.getMinutes() / 15) * 15).padStart(2, '0')}` : '09:00'
  const [open, setOpen] = useState(false)
  const set = (nextDate: string | null, nextTime: string) => {
    if (!nextDate) return onChange(undefined)
    const [y, mo, da] = nextDate.split('-').map(Number)
    const [h, mi] = nextTime.split(':').map(Number)
    onChange(new Date(y, mo - 1, da, h, mi).toISOString())
  }
  return (
    <div className="inline-flex items-center gap-1">
      <DatePicker value={date} onChange={(nd) => set(nd, time)} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="h-8 rounded-md border border-line bg-bg px-2.5 text-sm hover:bg-hover" disabled={!date}>
            {timeLabel(time)}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="max-h-64 w-32 overflow-y-auto p-1">
          {TIMES.map((t) => (
            <button
              type="button"
              key={t}
              ref={(el) => {
                if (el && t === time) el.scrollIntoView({ block: 'center' })
              }}
              onClick={() => {
                set(date, t)
                setOpen(false)
              }}
              className={cn('block w-full rounded px-2 py-1 text-left text-sm hover:bg-hover', t === time && 'bg-accent-soft text-accent')}
            >
              {timeLabel(t)}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  )
}
