import { useSyncExternalStore } from 'react'

interface Toast {
  id: number
  text: string
  action?: { label: string; run: () => void }
}

let toasts: Toast[] = []
const listeners = new Set<() => void>()
let nextId = 1

export function toast(text: string, action?: Toast['action'], ms = 4000) {
  const t = { id: nextId++, text, action }
  toasts = [...toasts, t]
  listeners.forEach((l) => l())
  setTimeout(() => dismiss(t.id), ms)
}

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  listeners.forEach((l) => l())
}

export function Toaster() {
  const list = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => toasts,
    () => toasts,
  )
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
      {list.map((t) => (
        <div
          key={t.id}
          className="animate-pop pointer-events-auto flex items-center gap-3 rounded-lg bg-[#2f2f2f] px-4 py-2.5 text-sm text-white shadow-pop"
        >
          <span>{t.text}</span>
          {t.action && (
            <button
              className="font-medium text-[#79b8ff]"
              onClick={() => {
                t.action!.run()
                dismiss(t.id)
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
