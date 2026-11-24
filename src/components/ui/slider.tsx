import { Slider as S } from 'radix-ui'
import { cn } from './cn'

export function Slider({
  value,
  min,
  max,
  step = 1,
  onValueChange,
  className,
  'aria-label': ariaLabel,
}: {
  value: number
  min: number
  max: number
  step?: number
  onValueChange: (v: number) => void
  className?: string
  'aria-label'?: string
}) {
  return (
    <S.Root
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={(v) => onValueChange(v[0])}
      aria-label={ariaLabel}
      className={cn('relative flex h-5 touch-none select-none items-center', className)}
    >
      <S.Track className="relative h-1 grow overflow-hidden rounded-full bg-white/20">
        <S.Range className="absolute h-full bg-[#a98bff]" />
      </S.Track>
      <S.Thumb className="block h-3.5 w-3.5 rounded-full bg-white shadow outline-none focus-visible:ring-2 focus-visible:ring-[#a98bff]" />
    </S.Root>
  )
}
