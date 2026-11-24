import { Checkbox as C } from 'radix-ui'
import { Check, Minus } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { cn } from './cn'

export function Checkbox({
  checked,
  onCheckedChange,
  disabled,
  className,
  id,
  'aria-label': ariaLabel,
}: {
  checked: boolean | 'indeterminate'
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
  id?: string
  'aria-label'?: string
}) {
  return (
    <C.Root
      id={id}
      checked={checked}
      disabled={disabled}
      aria-label={ariaLabel}
      onCheckedChange={(v) => onCheckedChange(v === true)}
      className={cn(
        'grid h-4 w-4 flex-none place-items-center rounded-[4px] border-[1.5px] border-muted outline-none transition focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50 data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent',
        className,
      )}
    >
      <C.Indicator className="text-white">
        {checked === 'indeterminate' ? <Minus className="h-3 w-3" strokeWidth={3} /> : <Check className="h-3 w-3" strokeWidth={3} />}
      </C.Indicator>
    </C.Root>
  )
}

/** Checkbox with a clickable label (and optional hint). */
export function CheckboxField({
  label,
  hint,
  checked,
  onCheckedChange,
  disabled,
  className,
}: {
  label: ReactNode
  hint?: ReactNode
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
}) {
  const id = useId()
  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <Checkbox id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} className="mt-0.5" />
      <label htmlFor={id} className="cursor-pointer select-none text-sm">
        <span className="text-fg">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      </label>
    </div>
  )
}
