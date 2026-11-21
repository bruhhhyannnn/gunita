import { Dialog as D } from 'radix-ui'
import type { ReactNode } from 'react'
import { cn } from './cn'

export function Dialog({
  open,
  onOpenChange,
  title,
  children,
  className,
  description,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title?: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <D.Content
          aria-describedby={undefined}
          className={cn(
            'animate-pop fixed left-1/2 top-[12vh] z-50 max-h-[76vh] w-[min(640px,calc(100vw-24px))] -translate-x-1/2 overflow-auto rounded-xl bg-popover shadow-pop outline-none',
            className,
          )}
        >
          {title ? (
            <D.Title className="px-5 pt-4 text-base font-semibold">{title}</D.Title>
          ) : (
            <D.Title className="sr-only">Dialog</D.Title>
          )}
          {description && <D.Description className="px-5 pt-1 text-sm text-muted">{description}</D.Description>}
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
