import { CalendarClock, CheckSquare, FileText, File, Table2 } from 'lucide-react'
import type { PageKind } from '#/lib/types'
import { cn } from './ui/cn'

export function PageIcon({
  icon,
  kind,
  className,
  size = 18,
}: {
  icon?: string
  kind?: PageKind
  className?: string
  size?: number
}) {
  if (icon) {
    if (icon.startsWith('http') || icon.startsWith('/')) {
      return <img src={icon} alt="" className={cn('rounded-sm object-cover', className)} style={{ width: size, height: size }} />
    }
    return (
      <span className={cn('inline-flex items-center justify-center leading-none', className)} style={{ fontSize: size * 0.95, width: size, height: size }}>
        {icon}
      </span>
    )
  }
  const Icon = kind === 'todo' ? CheckSquare : kind === 'database' ? Table2 : kind === 'meeting' ? CalendarClock : kind === 'row' ? File : FileText
  return <Icon className={cn('text-muted', className)} style={{ width: size * 0.9, height: size * 0.9 }} strokeWidth={1.8} />
}
