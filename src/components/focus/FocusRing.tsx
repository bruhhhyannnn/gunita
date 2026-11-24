import { cn } from '../ui/cn'

/** The countdown ring: full at the start of a phase, empty at the end. */
export function FocusRing({ progress, size = 240, stroke = 10, phase, children }: { progress: number; size?: number; stroke?: number; phase: 'focus' | 'break' | 'long'; children?: React.ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const left = Math.min(1, Math.max(0, 1 - progress))
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-[var(--bg-hover)]" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - left)}
          className={cn('transition-[stroke-dashoffset] duration-300 ease-linear', phase === 'focus' ? 'stroke-[var(--accent)]' : 'stroke-[#2e9f6b]')}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  )
}
