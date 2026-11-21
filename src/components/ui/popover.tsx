import { Popover as P } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from './cn'

export const Popover = P.Root
export const PopoverTrigger = P.Trigger
export const PopoverAnchor = P.Anchor
export const PopoverClose = P.Close

export function PopoverContent({ className, children, ...props }: ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        sideOffset={6}
        collisionPadding={8}
        className={cn('animate-pop z-50 rounded-lg bg-popover shadow-pop outline-none', className)}
        {...props}
      >
        {children}
      </P.Content>
    </P.Portal>
  )
}
