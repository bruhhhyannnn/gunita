import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from './cn'

const FIELD =
  'w-full rounded-md border border-line bg-bg text-fg outline-none transition placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-50'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { size?: 'sm' | 'md' }>(function Input(
  { className, size = 'sm', ...props },
  ref,
) {
  return <input ref={ref} className={cn(FIELD, size === 'sm' ? 'h-8 px-2.5 text-sm' : 'h-9 px-3 text-sm', className)} {...props} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(FIELD, 'resize-none p-3 text-sm leading-relaxed', className)} {...props} />
})
