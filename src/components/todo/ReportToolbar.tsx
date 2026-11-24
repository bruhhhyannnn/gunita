import type { Editor } from '@tiptap/react'
import { ClipboardCopy, Loader2, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { usePage } from '#/lib/app'
import type { PageMeta } from '#/lib/types'
import { copyRich, generateReport, makePeriod } from '#/lib/report'
import { Button } from '../ui/button'
import { toast } from '../ui/toast'

/** Shown on generated report pages: copy into Google Docs, or rebuild from the latest tasks. */
export function ReportToolbar({ page, editor }: { page: PageMeta; editor: Editor | null }) {
  const r = page.reportFor!
  const list = usePage(r.listId)
  const [busy, setBusy] = useState(false)
  const period = makePeriod(r.from, r.to)
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-subtle px-3 py-2 text-sm">
      <span className="mr-auto text-muted">
        Accomplishment report · {period.short}
        {list ? ` · from ${list.title || 'TODO'}` : ''}
      </span>
      <Button
        size="sm"
        variant="primary"
        icon={<ClipboardCopy />}
        disabled={!editor}
        onClick={async () => {
          if (!editor) return
          // Plain <li>text</li> pastes into Google Docs without extra blank lines.
          const html = editor.getHTML().replace(/<li><p>/g, '<li>').replace(/<\/p><\/li>/g, '</li>').replace(/(<p><\/p>)+$/, '')
          await copyRich(html, editor.getText({ blockSeparator: '\n' }).replace(/\n{3,}/g, '\n\n'))
          toast('Copied. Paste into your Google Doc. Bold and bullets are kept.')
        }}
      >
        Copy for Google Docs
      </Button>
      <Button
        size="sm"
        icon={busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        disabled={busy || !list}
        onClick={async () => {
          if (!confirm('Rebuild this report from the latest tasks? Your edits on this page will be replaced.')) return
          setBusy(true)
          try {
            const res = await generateReport(r.listId, period)
            toast(`Report updated: ${res.count} finished tasks.`)
          } catch (e) {
            toast((e as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      >
        Regenerate
      </Button>
    </div>
  )
}
