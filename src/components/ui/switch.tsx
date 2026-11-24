import { Switch as S } from 'radix-ui'
import { cn } from './cn'

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  'aria-label': ariaLabel,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  'aria-label'?: string
}) {
  return (
    <S.Root
      checked={checked}
      disabled={disabled}
      aria-label={ariaLabel}
      onCheckedChange={onCheckedChange}
      className={cn(
        'relative h-5 w-9 flex-none rounded-full bg-active outline-none transition focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50 data-[state=checked]:bg-accent',
      )}
    >
      <S.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
    </S.Root>
  )
}
