import { Copy, Globe, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { getApp } from '#/lib/app'
import type { PageMeta } from '#/lib/types'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { toast } from './ui/toast'
import { cn } from './ui/cn'

/** Publish a page (and its sub-pages) as a read-only public link. */
export function SharePopover({ page }: { page: PageMeta }) {
  const [busy, setBusy] = useState(false)
  const url = page.shareSlug ? `${location.origin}/s/${page.shareSlug}` : null
  const toggle = async (enabled: boolean) => {
    setBusy(true)
    try {
      // Make sure the latest version is on the server before publishing.
      await getApp().sync.run()
      const res = await fetch('/api/share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pageId: page.id, enabled }) })
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || 'Sharing failed')
      const data = (await res.json()) as { slug: string | null }
      getApp().ws.updatePage(page.id, { shareSlug: data.slug })
    } catch (e) {
      toast(navigator.onLine ? (e as Error).message : 'Sharing needs an internet connection.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={cn('flex h-7 items-center gap-1 rounded-md px-2 text-sm hover:bg-hover', url ? 'text-accent' : 'text-muted')}>
          <Globe className="h-4 w-4" /> <span className="hidden sm:inline">Share</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-medium">Publish to web</div>
            <div className="text-xs text-muted">Anyone with the link can read this page and its sub-pages.</div>
          </div>
          <button
            role="switch"
            aria-checked={!!url}
            disabled={busy}
            onClick={() => void toggle(!url)}
            className={cn('relative h-5 w-9 flex-none rounded-full transition', url ? 'bg-accent' : 'bg-active')}
          >
            {busy ? (
              <Loader2 className="absolute left-2.5 top-0.5 h-4 w-4 animate-spin text-white" />
            ) : (
              <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition', url ? 'left-[18px]' : 'left-0.5')} />
            )}
          </button>
        </div>
        {url && (
          <div className="mt-3 flex items-center gap-2">
            <input readOnly value={url} className="h-8 min-w-0 flex-1 rounded-md border border-line bg-bg px-2 text-xs" onFocus={(e) => e.target.select()} />
            <button
              onClick={() => {
                void navigator.clipboard.writeText(url)
                toast('Link copied')
              }}
              className="grid h-8 w-8 place-items-center rounded-md border border-line hover:bg-hover"
              title="Copy link"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
        )}
        {url && <p className="mt-2 text-xs text-faint">Visitors see the latest synced version. Turn this off any time to stop sharing.</p>}
      </PopoverContent>
    </Popover>
  )
}
