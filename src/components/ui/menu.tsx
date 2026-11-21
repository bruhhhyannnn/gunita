import { DropdownMenu } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from './cn'

export const Menu = DropdownMenu.Root
export const MenuTrigger = DropdownMenu.Trigger

export function MenuContent({
  children,
  className,
  ...props
}: ComponentProps<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        sideOffset={4}
        collisionPadding={8}
        className={cn(
          'animate-pop z-50 min-w-[200px] rounded-lg bg-popover p-1 text-[14px] shadow-pop outline-none',
          className,
        )}
        {...props}
      >
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  )
}

export function MenuItem({
  icon,
  children,
  shortcut,
  danger,
  className,
  ...props
}: ComponentProps<typeof DropdownMenu.Item> & { icon?: ReactNode; shortcut?: string; danger?: boolean }) {
  return (
    <DropdownMenu.Item
      className={cn(
        'flex h-8 cursor-pointer select-none items-center gap-2 rounded-md px-2 outline-none data-[highlighted]:bg-hover data-[disabled]:opacity-40',
        danger && 'text-danger',
        className,
      )}
      {...props}
    >
      {icon && <span className="flex w-5 justify-center text-muted [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
      {shortcut && <span className="text-xs text-faint">{shortcut}</span>}
    </DropdownMenu.Item>
  )
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="my-1 h-px bg-line" />
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DropdownMenu.Label className="px-2 pb-1 pt-2 text-xs font-medium text-faint">{children}</DropdownMenu.Label>
}

export const MenuSub = DropdownMenu.Sub

export function MenuSubTrigger({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <DropdownMenu.SubTrigger className="flex h-8 cursor-pointer select-none items-center gap-2 rounded-md px-2 outline-none data-[highlighted]:bg-hover data-[state=open]:bg-hover">
      {icon && <span className="flex w-5 justify-center text-muted [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      <span className="flex-1">{children}</span>
      <span className="text-faint">›</span>
    </DropdownMenu.SubTrigger>
  )
}

export function MenuSubContent({ children }: { children: ReactNode }) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.SubContent
        sideOffset={4}
        collisionPadding={8}
        className="animate-pop z-50 min-w-[180px] rounded-lg bg-popover p-1 shadow-pop outline-none"
      >
        {children}
      </DropdownMenu.SubContent>
    </DropdownMenu.Portal>
  )
}
