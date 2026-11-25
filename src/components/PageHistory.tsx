import { History, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import * as Y from 'yjs'
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap'
import { editors } from '#/editor/PageEditor'
import { getApp } from '#/lib/app'
import { fromB64 } from '#/lib/b64'
import { writePageDoc } from '#/lib/editorSchema'
import { docToMarkdown } from '#/lib/markdown'
import type { PageMeta } from '#/lib/types'
import { Dialog } from './ui/dialog'
import { Button } from './ui/button'
import { cn } from './ui/cn'
import { toast } from './ui/toast'

interface Version {
  day: string
  savedAt: number
  size: number
}

function when(v: Version) {
  const d = new Date(v.savedAt)
  const today = new Date()
  const yesterday = new Date(Date.now() - 86400_000)
  const day =
    d.toDateString() === today.toDateString()
      ? 'Today'
      : d.toDateString() === yesterday.toDateString()
        ? 'Yesterday'
        : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  return `${day}, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}

/**
 * Saved versions of a page: the server keeps a copy once a day, before the
 * first change that day, for 30 days. Preview one and restore it (Ctrl+Z
 * undoes a restore).
 */
export function PageHistory({ page, open, onOpenChange }: { page: PageMeta; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [versions, setVersions] = useState<Version[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [doc, setDoc] = useState<Y.Doc | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setVersions(null)
    setError(null)
    setPicked(null)
    setDoc(null)
    void (async () => {
      try {
        // Send the latest changes first, so today's saved version exists if there should be one.
        await getApp().sync.run()
        const res = await fetch(`/api/history?doc=${encodeURIComponent(page.id)}`)
        if (!res.ok) throw new Error(res.status === 401 ? 'Sign in again to see page history.' : `Couldn't load history (${res.status}).`)
        const { versions } = (await res.json()) as { versions: Version[] }
        setVersions(versions)
        if (versions[0]) setPicked(versions[0].day)
      } catch (e) {
        setError(navigator.onLine ? (e as Error).message : 'Page history needs an internet connection.')
      }
    })()
  }, [open, page.id])

  useEffect(() => {
    if (!picked) return
    let alive = true
    setLoading(true)
    void (async () => {
      try {
        const res = await fetch(`/api/history?doc=${encodeURIComponent(page.id)}&day=${picked}`)
        if (!res.ok) throw new Error(`Couldn't load that version (${res.status}).`)
        const { update } = (await res.json()) as { update: string }
        const d = new Y.Doc()
        Y.applyUpdate(d, fromB64(update))
        if (alive) setDoc(d)
      } catch (e) {
        if (alive) setError((e as Error).message)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [picked, page.id])

  const preview = useMemo(() => {
    if (!doc) return ''
    const { ws } = getApp()
    return docToMarkdown(doc, (id) => ws.page(id)?.title ?? '')
  }, [doc])

  const restore = async () => {
    if (!doc || !picked) return
    const v = versions?.find((x) => x.day === picked)
    if (!confirm(`Replace “${page.title || 'Untitled'}” with the version from ${v ? when(v) : picked}? You can undo this with Ctrl+Z.`)) return
    const json = yXmlFragmentToProsemirrorJSON(doc.getXmlFragment('default'))
    const editor = editors.get(page.id)
    if (editor) editor.commands.setContent(json)
    else await writePageDoc(page.id, json)
    onOpenChange(false)
    toast(`Restored the version from ${v ? when(v) : picked}.`, editor ? { label: 'Undo', run: () => editor.commands.undo() } : undefined)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Page history"
      description="A copy of this page is saved once a day, before your first change that day, and kept for 30 days."
      className="w-[min(860px,calc(100vw-24px))]"
    >
      <div className="flex h-[min(60vh,520px)] min-h-0 border-t border-line">
        <div className="w-52 flex-none overflow-y-auto border-r border-line p-2" role="listbox" aria-label="Saved versions">
          {!versions && !error && <p className="p-2 text-sm text-faint">Loading…</p>}
          {versions?.length === 0 && <p className="p-2 text-sm text-faint">No saved versions yet. One is saved the next time you change this page, then once a day.</p>}
          {versions?.map((v) => (
            <button
              key={v.day}
              role="option"
              aria-selected={picked === v.day}
              onClick={() => setPicked(v.day)}
              className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-hover', picked === v.day && 'bg-active text-fg')}
            >
              <History className="h-3.5 w-3.5 flex-none text-faint" />
              {when(v)}
            </button>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" data-testid="history-preview">
            {error ? (
              <p className="text-sm text-danger">{error}</p>
            ) : loading ? (
              <p className="text-sm text-faint">Loading…</p>
            ) : doc ? (
              <pre className="whitespace-pre-wrap break-words font-sans text-[14px] leading-relaxed text-fg">{preview.trim() || '(empty page)'}</pre>
            ) : null}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button variant="primary" icon={<RotateCcw />} disabled={!doc || loading} onClick={() => void restore()}>
              Restore this version
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
