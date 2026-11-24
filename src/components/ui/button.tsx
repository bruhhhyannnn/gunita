import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from './cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:brightness-110 disabled:hover:brightness-100',
  secondary: 'border border-line bg-bg text-fg hover:bg-hover',
  ghost: 'text-muted hover:bg-hover hover:text-fg',
  danger: 'bg-danger text-white hover:brightness-110',
}

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-[13px] gap-1.5 [&_svg]:h-3.5 [&_svg]:w-3.5',
  md: 'h-9 px-3 text-sm gap-1.5 [&_svg]:h-4 [&_svg]:w-4',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
}

/** The app's standard button. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, className, children, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex flex-none select-none items-center justify-center whitespace-nowrap rounded-md font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  )
})

/** A square button with just an icon. `label` is required for screen readers and the tooltip. */
export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: Size }>(
  function IconButton({ label, size = 'md', className, children, type = 'button', ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        title={label}
        className={cn(
          'inline-grid flex-none place-items-center rounded-md text-muted outline-none transition hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-40',
          size === 'sm' ? 'h-7 w-7 [&_svg]:h-3.5 [&_svg]:w-3.5' : 'h-9 w-9 [&_svg]:h-4 [&_svg]:w-4',
          className,
        )}
        {...props}
      >
        {children}
      </button>
    )
  },
)
