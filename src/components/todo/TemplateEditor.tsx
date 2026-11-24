import { EditorContent, useEditor, type JSONContent } from '@tiptap/react'
import { DragHandle } from '@tiptap/extension-drag-handle-react'
import { Extension, Node as TNode } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import { GripVertical } from 'lucide-react'
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { newId } from '#/lib/ids'
import type { Recurrence, TemplateItem } from '#/lib/types'
import { MoveBlock } from '#/editor/moveBlock'
import { Popover, PopoverAnchor, PopoverContent } from '../ui/popover'
import { cn } from '../ui/cn'
import { Input } from '../ui/input'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const REPEAT_EVENT = 'gunita:repeat-menu'

export function repeatLabel(r: Recurrence | null | undefined): string {
  if (!r || r.kind === 'daily') return 'Every day'
  if (r.kind === 'monthly') return `Monthly · day ${r.day}`
  const days = [...r.days].sort()
  if (days.join() === '1,2,3,4,5') return 'Weekdays'
  if (days.join() === '0,6') return 'Weekends'
  return days.map((d) => DAY_NAMES[d]).join(', ') || 'Never'
}

/** The template is one task list; nothing else can live in it. */
const TemplateDoc = TNode.create({ name: 'doc', topNode: true, content: 'taskList' })

const TemplateItemNode = TaskItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      templateId: { default: null, keepOnSplit: false, renderHTML: () => ({}) },
      repeat: { default: null, keepOnSplit: false, renderHTML: () => ({}) },
    }
  },
}).configure({ nested: true })

interface RepeatEvent {
  pos: number
  rect: DOMRect
  repeat: Recurrence | null
}

/** "Every day" chip at the end of each task; click it to change how often it repeats. */
const RepeatChips = Extension.create({
  name: 'repeatChips',
  addProseMirrorPlugins() {
    const key = new PluginKey<DecorationSet>('repeatChips')
    const build = (doc: PMNode) => {
      const decos: Decoration[] = []
      doc.descendants((node, pos) => {
        if (node.type.name !== 'taskItem' || !node.firstChild) return true
        const end = pos + 1 + node.firstChild.nodeSize - 1
        const repeat = node.attrs.repeat as Recurrence | null
        decos.push(
          Decoration.widget(
            end,
            () => {
              const el = document.createElement('button')
              el.type = 'button'
              el.className = cn('repeat-chip', repeat && repeat.kind !== 'daily' && 'is-custom')
              el.contentEditable = 'false'
              el.textContent = repeatLabel(repeat)
              el.addEventListener('mousedown', (e) => {
                e.preventDefault()
                e.stopPropagation()
                window.dispatchEvent(new CustomEvent<RepeatEvent>(REPEAT_EVENT, { detail: { pos, rect: el.getBoundingClientRect(), repeat } }))
              })
              return el
            },
            { side: 1, ignoreSelection: true, key: `r-${pos}-${repeatLabel(repeat)}` },
          ),
        )
        return true
      })
      return DecorationSet.create(doc, decos)
    }
    return [
      new Plugin<DecorationSet>({
        key,
        state: { init: (_, s) => build(s.doc), apply: (tr, old) => (tr.docChanged ? build(tr.doc) : old) },
        props: { decorations: (s) => key.getState(s) },
      }),
    ]
  },
})

function toJson(items: TemplateItem[]): JSONContent {
  const item = (t: TemplateItem): JSONContent => ({
    type: 'taskItem',
    attrs: { checked: false, templateId: t.id, repeat: t.repeat },
    content: [
      { type: 'paragraph', content: t.text ? [{ type: 'text', text: t.text }] : [] },
      ...(t.children?.length ? [{ type: 'taskList', content: t.children.map(item) }] : []),
    ],
  })
  return { type: 'doc', content: [{ type: 'taskList', content: items.length ? items.map(item) : [item({ id: newId(), text: '', repeat: { kind: 'daily' } })] }] }
}

function fromJson(doc: JSONContent): TemplateItem[] {
  const text = (n: JSONContent | undefined): string => (n?.content ?? []).map((c) => c.text ?? '').join('').trim()
  const list = (l: JSONContent | undefined): TemplateItem[] =>
    (l?.content ?? [])
      .filter((n) => n.type === 'taskItem')
      .map((n) => {
        const para = n.content?.find((c) => c.type === 'paragraph')
        const sub = n.content?.find((c) => c.type === 'taskList')
        return {
          id: (n.attrs?.templateId as string) || newId(),
          text: text(para),
          repeat: (n.attrs?.repeat as Recurrence | null) ?? { kind: 'daily' },
          children: list(sub),
        }
      })
      .filter((t) => t.text || t.children?.length)
      .map((t) => (t.children?.length ? t : { id: t.id, text: t.text, repeat: t.repeat }))
  return list(doc.content?.[0])
}

export interface TemplateEditorHandle {
  getItems: () => TemplateItem[]
}

/** Edits the daily template with the same task-list editor as pages: Tab / Shift+Tab, Enter, drag. */
export const TemplateEditor = forwardRef<TemplateEditorHandle, { initial: TemplateItem[] }>(function TemplateEditor({ initial }, ref) {
  const editor = useEditor(
    {
      extensions: [
        TemplateDoc,
        StarterKit.configure({
          document: false,
          heading: false,
          blockquote: false,
          codeBlock: false,
          bulletList: false,
          orderedList: false,
          listItem: false,
          horizontalRule: false,
          code: false,
          link: false,
          trailingNode: false,
        }),
        TaskList,
        TemplateItemNode,
        Placeholder.configure({ placeholder: 'A task you do every day…' }),
        RepeatChips,
        MoveBlock,
      ],
      content: toJson(initial),
      editorProps: { attributes: { class: 'gunita-editor template-editor' } },
      immediatelyRender: true,
    },
    [],
  )
  useImperativeHandle(ref, () => ({ getItems: () => (editor ? fromJson(editor.getJSON()) : initial) }), [editor, initial])

  if (!editor) return null
  return (
    <div
      className="relative pl-6"
      // Tab / Shift+Tab indent tasks here; don't let the dialog use them to move focus away.
      onKeyDown={(e) => {
        if (e.key === 'Tab') {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
    >
      <EditorContent editor={editor} />
      <DragHandle editor={editor} nested>
        <div className="drag-handle mr-1" title="Drag to reorder (or Ctrl+Shift+↑/↓)">
          <GripVertical className="h-4 w-4" />
        </div>
      </DragHandle>
      <RepeatMenu
        onChange={(pos, repeat) => {
          const node = editor.state.doc.nodeAt(pos)
          if (node) editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, repeat }))
        }}
      />
    </div>
  )
})

function RepeatMenu({ onChange }: { onChange: (pos: number, repeat: Recurrence) => void }) {
  const [ev, setEv] = useState<RepeatEvent | null>(null)
  useEffect(() => {
    const on = (e: Event) => setEv((e as CustomEvent<RepeatEvent>).detail)
    window.addEventListener(REPEAT_EVENT, on)
    return () => window.removeEventListener(REPEAT_EVENT, on)
  }, [])
  if (!ev) return null
  const r = ev.repeat ?? { kind: 'daily' as const }
  const set = (next: Recurrence) => {
    onChange(ev.pos, next)
    setEv({ ...ev, repeat: next })
  }
  const days = r.kind === 'weekdays' ? r.days : []
  return (
    <Popover open onOpenChange={(o) => !o && setEv(null)}>
      <PopoverAnchor asChild>
        <span style={{ position: 'fixed', left: ev.rect.left, top: ev.rect.bottom, width: 1, height: 1 }} />
      </PopoverAnchor>
      <PopoverContent align="start" className="w-64 p-2 text-sm">
        <div className="px-1 pb-1 text-xs text-faint">Repeat</div>
        {[
          { label: 'Every day', value: { kind: 'daily' } as Recurrence },
          { label: 'Weekdays (Mon–Fri)', value: { kind: 'weekdays', days: [1, 2, 3, 4, 5] } as Recurrence },
        ].map((o) => (
          <button
            key={o.label}
            onClick={() => set(o.value)}
            className={cn('flex h-8 w-full items-center rounded-md px-2 text-left hover:bg-hover', repeatLabel(r) === repeatLabel(o.value) && 'text-accent')}
          >
            {o.label}
          </button>
        ))}
        <div className="mt-1 px-1 py-1 text-xs text-faint">On these days</div>
        <div className="flex gap-1 px-1">
          {DAY_NAMES.map((d, i) => {
            const on = days.includes(i)
            return (
              <button
                key={d}
                onClick={() => set({ kind: 'weekdays', days: on ? days.filter((x) => x !== i) : [...days, i].sort() })}
                className={cn('h-7 w-7 rounded-md text-[11px]', on ? 'bg-accent text-white' : 'bg-hover text-muted hover:bg-active')}
              >
                {d[0]}
              </button>
            )
          })}
        </div>
        <div className="mt-2 flex items-center gap-2 px-1">
          <button onClick={() => set({ kind: 'monthly', day: r.kind === 'monthly' ? r.day : 1 })} className={cn('h-8 rounded-md px-2 hover:bg-hover', r.kind === 'monthly' && 'text-accent')}>
            Monthly on day
          </button>
          <Input
            inputMode="numeric"
            aria-label="Day of month"
            value={r.kind === 'monthly' ? String(r.day) : ''}
            placeholder="15"
            onChange={(e) => {
              const n = Math.min(31, Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1))
              set({ kind: 'monthly', day: n })
            }}
            className="w-14 text-center"
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
