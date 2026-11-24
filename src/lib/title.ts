import { useEffect } from 'react'

let base = 'Gunita'
let prefix = ''

/** Sets the browser tab / window title, e.g. "☀️ Work TODO – Gunita". */
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    base = title ? `${title} – Gunita` : 'Gunita'
    document.title = prefix + base
  }, [title])
}

/** Puts something before every title, like the focus timer's "▶ 18:42 · ". */
export function setTitlePrefix(next: string) {
  if (next === prefix) return
  prefix = next
  document.title = prefix + base
}
