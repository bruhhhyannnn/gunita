import { useEffect, useState } from 'react'
import { getApp, useWs } from '#/lib/app'
import type { PageMeta } from '#/lib/types'
import { Dialog } from '../ui/dialog'
import { toast } from '../ui/toast'
import { Checkbox } from '../ui/checkbox'
import { Select } from '../ui/select'
import { Button } from '../ui/button'

export interface ActionItem {
  text: string
  owner: string
  due: string
}

/** After "Finish meeting": pick which action items go to your next Start Today. */
export function ActionItemsDialog({ meeting, items, onClose }: { meeting: PageMeta; items: ActionItem[] | null; onClose: () => void }) {
  const lists = useWs((s) =>
    Object.values(s.pages)
      .filter((p) => p.kind === 'todo' && !p.trashedAt)
      .sort((a, b) => a.createdAt - b.createdAt),
  )
  const [picked, setPicked] = useState<boolean[]>([])
  const [listId, setListId] = useState('')
  useEffect(() => {
    if (items) setPicked(items.map((i) => !i.owner || /^(me|i|myself)$/i.test(i.owner)))
    if (!listId && lists[0]) setListId(lists[0].id)
  }, [items, lists, listId])
  if (!items) return null
  const send = () => {
    const chosen = items.filter((_, i) => picked[i])
    getApp().ws.addInbox(
      chosen.map((i) => ({ text: i.due ? `${i.text} (due ${i.due})` : i.text, sourceId: meeting.id, listId: listId || undefined })),
    )
    toast(`${chosen.length} action item${chosen.length === 1 ? '' : 's'} will be added when you start your day.`)
    onClose()
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Action items" description="Checked items go to your TODO list the next time you start a day (or right away, from the list).">
      <div className="max-h-[50vh] space-y-1 overflow-y-auto px-5 py-3">
        {items.map((it, i) => (
          <div key={i} className="flex items-start gap-2.5 rounded-md px-1 py-1.5 hover:bg-hover">
            <Checkbox className="mt-1" checked={!!picked[i]} onCheckedChange={(v) => setPicked((p) => p.map((x, j) => (j === i ? v : x)))} />
            <span className="flex-1">
              {it.text}
              <span className="ml-2 text-xs text-faint">
                {[it.owner && `owner: ${it.owner}`, it.due && `due ${it.due}`].filter(Boolean).join(' · ')}
              </span>
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-sm">
        {lists.length ? (
          <label className="flex items-center gap-2 text-muted">
            Send to
            <Select
              className="w-48"
              aria-label="TODO list"
              value={listId}
              onValueChange={setListId}
              options={lists.map((l) => ({ value: l.id, label: l.title || 'TODO' }))}
            />
          </label>
        ) : (
          <span className="text-muted">Create a TODO list first.</span>
        )}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            Skip
          </Button>
          <Button variant="primary" onClick={send} disabled={!lists.length}>
            Send {picked.filter(Boolean).length}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
