import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { DragHandle } from '@tiptap/extension-drag-handle-react'
import type { AnyExtension } from '@tiptap/core'
import type * as Y from 'yjs'
import { Bold, ChevronDown, Code, GripVertical, Highlighter, Italic, Link2, Strikethrough, Underline } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useApp } from '#/lib/app'
import { cn } from '#/components/ui/cn'
import { buildExtensions } from './extensions'

/** Live editors by page id, so page-level actions (Start Today, AI) can edit the open document. */
export const editors = new Map<string, Editor>()

export function PageEditor({
  pageId,
  extra,
  onReady,
  className,
}: {
  pageId: string
  extra?: AnyExtension[]
  onReady?: (editor: Editor) => void
  className?: string
}) {
  const { docs } = useApp()
  const [doc, setDoc] = useState<Y.Doc | null>(null)
  useEffect(() => {
    const { doc, ready } = docs.open(pageId)
    let alive = true
    void ready.then(() => alive && setDoc(doc))
    return () => {
      alive = false
      setDoc(null)
      docs.release(pageId)
    }
  }, [docs, pageId])
  if (!doc) return <div className="min-h-40" />
  return <EditorInner key={pageId} doc={doc} pageId={pageId} extra={extra} onReady={onReady} className={className} />
}

function EditorInner({
  doc,
  pageId,
  extra,
  onReady,
  className,
}: {
  doc: Y.Doc
  pageId: string
  extra?: AnyExtension[]
  onReady?: (editor: Editor) => void
  className?: string
}) {
  const extensions = useMemo(
    () => buildExtensions({ doc, ctx: { pageId }, extra }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc, pageId],
  )
  const editor = useEditor(
    {
      extensions,
      editorProps: { attributes: { class: cn('gunita-editor', className) } },
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
    },
    [doc, pageId],
  )
  useEffect(() => {
    if (!editor) return
    editors.set(pageId, editor)
    onReady?.(editor)
    return () => {
      if (editors.get(pageId) === editor) editors.delete(pageId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, pageId])

  if (!editor) return null
  return (
    <div className="relative">
      <EditorContent editor={editor} />
      <DragHandle editor={editor} nested>
        <div className="drag-handle mr-1" title="Drag to move">
          <GripVertical className="h-4 w-4" />
        </div>
      </DragHandle>
      <FormatMenu editor={editor} />
    </div>
  )
}

const showFormatMenu = ({ editor, state }: { editor: Editor; state: Editor['state'] }) => {
  const { empty } = state.selection
  if (empty || !editor.isEditable) return false
  if (editor.isActive('codeBlock') || editor.isActive('image')) return false
  return state.selection.constructor.name === 'TextSelection'
}

function FormatMenu({ editor }: { editor: Editor }) {
  return (
    <BubbleMenu editor={editor} shouldShow={showFormatMenu} className="flex items-center gap-0.5 rounded-lg bg-popover p-1 shadow-pop">
      <FormatButtons editor={editor} />
    </BubbleMenu>
  )
}

function FormatButtons({ editor }: { editor: Editor }) {
  const st = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: e.isActive('heading', { level: 1 })
        ? 'h1'
        : e.isActive('heading', { level: 2 })
          ? 'h2'
          : e.isActive('heading', { level: 3 })
            ? 'h3'
            : e.isActive('taskList')
              ? 'todo'
              : e.isActive('bulletList')
                ? 'bullet'
                : 'text',
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      highlight: e.isActive('highlight'),
      link: e.isActive('link'),
    }),
  })
  const btn = (active: boolean, onClick: () => void, icon: ReactNode, label: string) => (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={label}
      className={cn('grid h-8 w-8 place-items-center rounded hover:bg-hover [&>svg]:h-4 [&>svg]:w-4', active && 'text-accent')}
    >
      {icon}
    </button>
  )
  return (
    <>
      <BlockTypeMenu editor={editor} current={st.block} />
      <div className="mx-0.5 h-5 w-px bg-line" />
      {btn(st.bold, () => editor.chain().focus().toggleBold().run(), <Bold />, 'Bold (Ctrl B)')}
      {btn(st.italic, () => editor.chain().focus().toggleItalic().run(), <Italic />, 'Italic (Ctrl I)')}
      {btn(st.underline, () => editor.chain().focus().toggleUnderline().run(), <Underline />, 'Underline (Ctrl U)')}
      {btn(st.strike, () => editor.chain().focus().toggleStrike().run(), <Strikethrough />, 'Strikethrough')}
      {btn(st.code, () => editor.chain().focus().toggleCode().run(), <Code />, 'Inline code')}
      {btn(st.highlight, () => editor.chain().focus().toggleHighlight().run(), <Highlighter />, 'Highlight')}
      {btn(
        st.link,
        () => {
          if (editor.isActive('link')) {
            editor.chain().focus().unsetLink().run()
            return
          }
          const url = prompt('Link URL')
          if (url) editor.chain().focus().setLink({ href: /^https?:\/\//.test(url) ? url : `https://${url}` }).run()
        },
        <Link2 />,
        'Link',
      )}
    </>
  )
}

const BLOCK_TYPES = [
  { id: 'text', label: 'Text' },
  { id: 'h1', label: 'Heading 1' },
  { id: 'h2', label: 'Heading 2' },
  { id: 'h3', label: 'Heading 3' },
  { id: 'todo', label: 'To-do list' },
  { id: 'bullet', label: 'Bulleted list' },
] as const

/**
 * "Turn into" dropdown inside the formatting bubble. It renders inline (no portal)
 * and never takes focus, so the text selection and the bubble stay put.
 */
function BlockTypeMenu({ editor, current }: { editor: Editor; current: string }) {
  const [open, setOpen] = useState(false)
  const apply = (id: string) => {
    const c = editor.chain().focus()
    if (id === 'text') c.setParagraph().run()
    else if (id === 'h1' || id === 'h2' || id === 'h3') c.setHeading({ level: Number(id[1]) as 1 | 2 | 3 }).run()
    else if (id === 'todo') c.toggleTaskList().run()
    else if (id === 'bullet') c.toggleBulletList().run()
    setOpen(false)
  }
  return (
    <div className="relative">
      <button
        onMouseDown={(e) => {
          e.preventDefault()
          setOpen((o) => !o)
        }}
        className="flex h-8 items-center gap-1 rounded px-2 text-sm text-muted hover:bg-hover"
      >
        {BLOCK_TYPES.find((b) => b.id === current)?.label ?? 'Text'}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="animate-pop absolute left-0 top-9 z-10 w-40 rounded-lg bg-popover p-1 shadow-pop">
          {BLOCK_TYPES.map((b) => (
            <button
              key={b.id}
              onMouseDown={(e) => {
                e.preventDefault()
                apply(b.id)
              }}
              className={cn('flex h-8 w-full items-center rounded-md px-2 text-left text-sm hover:bg-hover', b.id === current && 'text-accent')}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
