import { RefreshCw, X } from 'lucide-react'
import { useState } from 'react'
import { useUpdateCheck, useUpdateReady } from '#/lib/version'
import { getApp } from '#/lib/app'
import { Button } from './ui/button'

/** Tells you when a newer Gunita has been deployed, so an open tab doesn't stay on the old one. */
export function UpdateBanner() {
  useUpdateCheck()
  const ready = useUpdateReady()
  const [hidden, setHidden] = useState(false)
  if (!ready || hidden) return null
  const reload = async () => {
    // Send anything not yet synced first (it's also saved on this device).
    try {
      await getApp().sync.run()
    } catch {
      /* offline: edits stay on the device */
    }
    location.reload()
  }
  return (
    <div role="status" className="animate-pop fixed bottom-4 left-4 z-40 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-xl border border-line bg-popover py-2 pl-4 pr-2 text-sm shadow-pop">
      <RefreshCw className="h-4 w-4 flex-none text-accent" />
      <span>A new version of Gunita is ready.</span>
      <Button size="sm" variant="primary" onClick={() => void reload()}>
        Reload
      </Button>
      <button onClick={() => setHidden(true)} className="grid h-7 w-7 place-items-center rounded-md text-faint hover:bg-hover hover:text-fg" aria-label="Later">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
