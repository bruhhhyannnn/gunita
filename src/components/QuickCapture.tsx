import { CheckSquare, FileText, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { getApp, useWs } from '#/lib/app'
import { setUi, useUi } from '#/lib/ui'
import { Dialog } from './ui/dialog'
import { toast } from './ui/toast'
import { Textarea } from './ui/input'
import { Select } from './ui/select'
import { Button } from './ui/button'

/** Jot something down fast (great on a phone): as a task for today, or as a new note. Works offline. */
export function QuickCapture() {
  const open = useUi((s) => s.captureOpen)
  const mobile = useUi((s) => s.mobile)
  const [text, setText] = useState('')
  const navigate = useNavigate()
  const lists = useWs((s) =>
    Object.values(s.pages)
      .filter((p) => p.kind === 'todo' && !p.trashedAt)
      .sort((a, b) => a.createdAt - b.createdAt),
  )
  const [listId, setListId] = useState<string>('')
  const close = () => {
    setUi({ captureOpen: false })
    setText('')
  }
  const asTask = () => {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
    if (!lines.length) return
    getApp().ws.addInbox(lines.map((t) => ({ text: t, listId: listId || lists[0]?.id })))
    toast(`${lines.length} task${lines.length === 1 ? '' : 's'} added to your inbox. ${lists.length ? 'They show up in your TODO list.' : 'Create a TODO list to see them.'}`)
    close()
  }
  const asNote = () => {
    if (!text.trim()) return
    const [first, ...rest] = text.trim().split('\n')
    const id = getApp().ws.createPage({ title: first.slice(0, 120) })
    if (rest.length) {
      void getApp().docs.withDoc(id, async (doc) => {
        const Y = await import('yjs')
        const frag = doc.getXmlFragment('default')
        doc.transact(() => {
          frag.insert(
            0,
            rest.map((line) => {
              const p = new Y.XmlElement('paragraph')
              p.insert(0, [new Y.XmlText(line)])
              return p
            }),
          )
        })
      })
    }
    close()
    void navigate({ to: '/p/$pageId', params: { pageId: id } })
  }
  return (
    <>
      {mobile && !open && (
        <button
          onClick={() => setUi({ captureOpen: true })}
          className="fixed bottom-5 right-5 z-30 grid h-14 w-14 place-items-center rounded-full bg-accent text-white shadow-pop"
          aria-label="Quick capture"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}
      <Dialog open={open} onOpenChange={(o) => (o ? setUi({ captureOpen: true }) : close())} title="Quick capture">
        <div className="px-5 py-3">
          <Textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) asTask()
            }}
            placeholder="What's on your mind? One task per line…"
            className="h-32"
          />
          {lists.length > 1 && (
            <Select
              className="mt-2 w-56"
              aria-label="TODO list"
              value={listId || lists[0].id}
              onValueChange={setListId}
              options={lists.map((l) => ({ value: l.id, label: l.title || 'TODO' }))}
            />
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <Button icon={<FileText />} onClick={asNote}>
            Save as note
          </Button>
          <Button variant="primary" icon={<CheckSquare />} onClick={asTask}>
            Add as tasks
          </Button>
        </div>
      </Dialog>
    </>
  )
}
