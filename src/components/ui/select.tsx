import { Select as S } from 'radix-ui'
import { Check, ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from './cn'

export interface SelectOption {
  value: string
  label: ReactNode
  disabled?: boolean
}

// Radix Select can't hold an empty string value, so "" is mapped to a sentinel.
const EMPTY = '__empty__'

/** Dropdown select styled like the rest of the app. */
export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  size = 'sm',
  'aria-label': ariaLabel,
}: {
  value: string
  onValueChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  className?: string
  size?: 'xs' | 'sm'
  'aria-label'?: string
}) {
  return (
    <S.Root value={value === '' ? EMPTY : value} onValueChange={(v) => onValueChange(v === EMPTY ? '' : v)}>
      <S.Trigger
        aria-label={ariaLabel}
        className={cn(
          'inline-flex min-w-0 items-center justify-between gap-2 rounded-md border border-line bg-bg text-left text-fg outline-none transition hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent/30 data-[placeholder]:text-faint',
          size === 'xs' ? 'h-7 px-2 text-xs' : 'h-8 px-2.5 text-sm',
          className,
        )}
      >
        <span className="truncate">
          <S.Value placeholder={placeholder} />
        </span>
        <S.Icon>
          <ChevronDown className="h-3.5 w-3.5 flex-none text-faint" />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content position="popper" sideOffset={4} collisionPadding={8} className="animate-pop z-[70] max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg bg-popover p-1 shadow-pop">
          <S.Viewport>
            {options.map((o) => (
              <S.Item
                key={o.value || EMPTY}
                value={o.value === '' ? EMPTY : o.value}
                disabled={o.disabled}
                className="relative flex h-8 cursor-pointer select-none items-center rounded-md pl-7 pr-2 text-sm outline-none data-[disabled]:cursor-not-allowed data-[highlighted]:bg-hover data-[disabled]:opacity-40"
              >
                <S.ItemIndicator className="absolute left-2">
                  <Check className="h-3.5 w-3.5 text-accent" />
                </S.ItemIndicator>
                <S.ItemText>{o.label}</S.ItemText>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  )
}
