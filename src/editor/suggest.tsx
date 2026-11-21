import { createRoot, type Root } from 'react-dom/client'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react'
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion'
import type { Range } from '@tiptap/core'
import { cn } from '#/components/ui/cn'

export interface SuggestItem {
  id: string
  title: string
  subtitle?: string
  icon?: ReactNode
  group?: string
  /** Called with the range of the trigger text (e.g. "/head") to replace. */
  run: (range: Range) => void
}

interface ListHandle {
  onKeyDown: (e: KeyboardEvent) => boolean
}

const SuggestList = forwardRef<ListHandle, { items: SuggestItem[]; empty?: string; onPick: (it: SuggestItem) => void }>(function SuggestList({ items, empty, onPick }, ref) {
  const [sel, setSel] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => setSel(0), [items])
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${sel}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [sel])
  useImperativeHandle(ref, () => ({
    onKeyDown: (e) => {
      if (!items.length) return false
      if (e.key === 'ArrowDown') {
        setSel((s) => (s + 1) % items.length)
        return true
      }
      if (e.key === 'ArrowUp') {
        setSel((s) => (s - 1 + items.length) % items.length)
        return true
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (items[sel]) onPick(items[sel])
        return true
      }
      return false
    },
  }))
  let lastGroup: string | undefined
  return (
    <div ref={listRef} className="animate-pop max-h-80 w-72 overflow-y-auto rounded-lg bg-popover p-1 text-[14px] shadow-pop">
      {items.length === 0 && <div className="px-2 py-1.5 text-sm text-muted">{empty ?? 'No results'}</div>}
      {items.map((it, i) => {
        const header = it.group && it.group !== lastGroup ? it.group : null
        lastGroup = it.group
        return (
          <div key={it.id}>
            {header && <div className="px-2 pb-1 pt-2 text-xs text-faint">{header}</div>}
            <button
              data-idx={i}
              onMouseEnter={() => setSel(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                onPick(it)
              }}
              className={cn('flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left', i === sel && 'bg-hover')}
            >
              {it.icon && (
                <span className="grid h-8 w-8 flex-none place-items-center rounded-md border border-line bg-bg text-muted [&>svg]:h-4 [&>svg]:w-4">
                  {it.icon}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{it.title}</span>
                {it.subtitle && <span className="block truncate text-xs text-faint">{it.subtitle}</span>}
              </span>
            </button>
          </div>
        )
      })}
    </div>
  )
})

/** Renders a Tiptap suggestion popup (slash menu, [[ links, @ mentions) with React. */
export function suggestionRenderer(empty?: string) {
  return () => {
    let el: HTMLDivElement | null = null
    let root: Root | null = null
    const handle: { current: ListHandle | null } = { current: null }

    const place = (props: SuggestionProps<SuggestItem>) => {
      const rect = props.clientRect?.()
      if (!el || !rect) return
      const h = 330
      const below = window.innerHeight - rect.bottom > h || rect.top < h
      el.style.left = `${Math.min(rect.left, window.innerWidth - 300)}px`
      el.style.top = below ? `${rect.bottom + 6}px` : `${rect.top - 6}px`
      el.style.transform = below ? '' : 'translateY(-100%)'
    }
    const render = (props: SuggestionProps<SuggestItem>) => {
      root?.render(
        <SuggestList ref={(r) => void (handle.current = r)} items={props.items} empty={empty} onPick={(it) => props.command(it)} />,
      )
    }
    return {
      onStart(props: SuggestionProps<SuggestItem>) {
        el = document.createElement('div')
        el.style.position = 'fixed'
        el.style.zIndex = '60'
        document.body.appendChild(el)
        root = createRoot(el)
        render(props)
        place(props)
      },
      onUpdate(props: SuggestionProps<SuggestItem>) {
        render(props)
        place(props)
      },
      onKeyDown(props: SuggestionKeyDownProps) {
        if (props.event.key === 'Escape') {
          return false
        }
        return handle.current?.onKeyDown(props.event) ?? false
      },
      onExit() {
        const r = root
        const e = el
        root = null
        el = null
        setTimeout(() => {
          r?.unmount()
          e?.remove()
        })
      },
    }
  }
}
