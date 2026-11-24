import { useEffect } from 'react'

/** Sets the browser tab / window title, e.g. "☀️ Work TODO – Gunita". */
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title ? `${title} – Gunita` : 'Gunita'
  }, [title])
}
