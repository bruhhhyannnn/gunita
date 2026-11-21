import type { Editor, JSONContent } from '@tiptap/react'
import { CalendarClock, ExternalLink, Loader2, MapPin, Mic, Paperclip, Sparkles, Square, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { getApp, useApp } from '#/lib/app'
import type { PageMeta } from '#/lib/types'
import { postJson } from '#/ai/client'
import { pickFile, uploadFile } from '#/editor/uploads'
import { toast } from '../ui/toast'
import { ActionItemsDialog, type ActionItem } from './ActionItemsDialog'
import { useTranscriber } from './transcribe'

const TEMPLATE: JSONContent[] = [
  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Agenda' }] },
  { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Notes' }] },
  { type: 'paragraph' },
  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Decisions' }] },
  { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Action items' }] },
  { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph' }] }] },
]

function toLocalInput(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function MeetingPanel({ page, editor }: { page: PageMeta; editor: Editor | null }) {
  const { config } = useApp()
  const m = page.meeting ?? {}
  const [busy, setBusy] = useState<'finish' | 'slides' | null>(null)
  const [items, setItems] = useState<ActionItem[] | null>(null)
  const [attendees, setAttendees] = useState((m.attendees ?? []).join(', '))
  const templated = useRef(false)
  const transcriber = useTranscriber(editor)

  useEffect(() => setAttendees((page.meeting?.attendees ?? []).join(', ')), [page.meeting?.attendees])

  // New meeting notes start with the agenda / notes / decisions / action items template.
  useEffect(() => {
    if (!editor || templated.current || m.templated) return
    templated.current = true
    const doc = editor.state.doc
    const empty = doc.childCount <= 1 && doc.textContent.trim() === ''
    if (empty) {
      editor.commands.setContent(TEMPLATE)
      getApp().ws.updatePage(page.id, { meeting: { ...m, templated: true } })
    }
  }, [editor, m, page.id])

  const setMeeting = (patch: Partial<NonNullable<PageMeta['meeting']>>) =>
    getApp().ws.updatePage(page.id, { meeting: { ...(getApp().ws.page(page.id)?.meeting ?? {}), ...patch } })

  const finish = async () => {
    if (!editor) return
    setBusy('finish')
    try {
      const r = await postJson<{ summary: string; decisions: string[]; actionItems: ActionItem[] }>('/api/ai/meeting', {
        title: page.title,
        date: m.start ?? new Date(page.createdAt).toISOString(),
        attendees: m.attendees ?? [],
        notes: editor.getText({ blockSeparator: '\n' }),
      })
      const content: JSONContent[] = [
        {
          type: 'callout',
          attrs: { icon: '✨' },
          content: [
            { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Summary' }] },
            { type: 'paragraph', content: [{ type: 'text', text: r.summary }] },
            ...(r.decisions.length
              ? [
                  { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Decisions' }] },
                  ...r.decisions.map((d) => ({ type: 'paragraph', content: [{ type: 'text', text: `• ${d}` }] })),
                ]
              : []),
          ],
        },
      ]
      editor.chain().insertContentAt(0, content).run()
      setMeeting({ finishedAt: Date.now() })
      if (r.actionItems.length) setItems(r.actionItems)
      else toast('Summary added. No action items found.')
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const attach = async () => {
    if (!editor) return
    const file = await pickFile('image/*,application/pdf')
    if (!file) return
    setBusy('slides')
    try {
      const up = await uploadFile(file)
      const blocks: JSONContent[] = []
      if (up.contentType.startsWith('image/')) blocks.push({ type: 'image', attrs: { src: up.url, alt: file.name } })
      else blocks.push({ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'link', attrs: { href: up.url } }], text: `📄 ${file.name}` }] })
      if (config?.claudeConfigured) {
        const x = await postJson<{ title: string; text: string; keyPoints: string[] }>('/api/ai/extract', { key: up.key })
        blocks.push({
          type: 'details',
          content: [
            { type: 'detailsSummary', content: [{ type: 'text', text: x.title || 'Slide text' }] },
            {
              type: 'detailsContent',
              content: [
                ...x.text
                  .split('\n')
                  .filter((l) => l.trim())
                  .map((l) => ({ type: 'paragraph', content: [{ type: 'text', text: l }] })),
                ...(x.keyPoints.length
                  ? [
                      { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Key points' }] },
                      { type: 'bulletList', content: x.keyPoints.map((k) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: k }] }] })) },
                    ]
                  : []),
              ],
            },
          ],
        })
      }
      editor.chain().focus().insertContent(blocks).run()
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mb-4 space-y-2 border-b border-line pb-4 text-sm">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-muted">
        <label className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4" />
          <input
            type="datetime-local"
            value={toLocalInput(m.start)}
            onChange={(e) => setMeeting({ start: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
            className="rounded bg-transparent px-1 hover:bg-hover"
          />
        </label>
        <label className="flex min-w-60 flex-1 items-center gap-2">
          <Users className="h-4 w-4 flex-none" />
          <input
            value={attendees}
            onChange={(e) => setAttendees(e.target.value)}
            onBlur={() => setMeeting({ attendees: attendees.split(',').map((a) => a.trim()).filter(Boolean) })}
            placeholder="Attendees, comma separated"
            className="w-full rounded bg-transparent px-1 outline-none placeholder:text-faint hover:bg-hover"
          />
        </label>
        <label className="flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          <input
            defaultValue={m.location ?? ''}
            onBlur={(e) => setMeeting({ location: e.target.value || undefined })}
            placeholder="Location / link"
            className="w-44 rounded bg-transparent px-1 outline-none placeholder:text-faint hover:bg-hover"
          />
        </label>
        {m.eventLink && (
          <a href={m.eventLink} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-fg">
            <ExternalLink className="h-3.5 w-3.5" /> Calendar
          </a>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => void finish()}
          disabled={!editor || busy !== null || !config?.claudeConfigured}
          title={config?.claudeConfigured ? 'Summarize, list decisions and send action items to your TODO list' : 'Needs Claude to be configured'}
          className="flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 font-medium text-white disabled:opacity-50"
        >
          {busy === 'finish' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {m.finishedAt ? 'Summarize again' : 'Finish meeting'}
        </button>
        <button onClick={() => void attach()} disabled={!editor || busy !== null} className="flex h-8 items-center gap-1.5 rounded-md border border-line px-3 hover:bg-hover disabled:opacity-50">
          {busy === 'slides' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
          Add slides / PDF
        </button>
        {transcriber.supported &&
          (transcriber.active ? (
            <button onClick={transcriber.stop} className="flex h-8 items-center gap-1.5 rounded-md border border-danger px-3 text-danger hover:bg-hover">
              <Square className="h-3.5 w-3.5" /> Stop transcript
              <span className="ml-1 h-2 w-2 animate-pulse rounded-full bg-danger" />
            </button>
          ) : (
            <button
              onClick={() => {
                if (confirm('Live transcript uses your browser’s speech recognition (audio may be processed by your browser vendor). Make sure everyone in the meeting agrees to be transcribed. Start?')) transcriber.start()
              }}
              disabled={!editor}
              className="flex h-8 items-center gap-1.5 rounded-md border border-line px-3 hover:bg-hover"
            >
              <Mic className="h-4 w-4" /> Live transcript
            </button>
          ))}
        {transcriber.interim && <span className="truncate text-xs italic text-faint">{transcriber.interim}</span>}
      </div>
      <ActionItemsDialog meeting={page} items={items} onClose={() => setItems(null)} />
    </div>
  )
}
