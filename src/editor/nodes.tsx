import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { usePage } from '#/lib/app'
import { relativeDate, isoDate } from '#/lib/dates'
import { PageIcon } from '#/components/PageIcon'
import { EmojiPicker } from '#/components/EmojiPicker'
import { Popover, PopoverContent, PopoverTrigger } from '#/components/ui/popover'
import { cn } from '#/components/ui/cn'
import { Calendar } from '#/components/ui/date-picker'

// ---------- Callout ----------

function CalloutView({ node, updateAttributes }: ReactNodeViewProps) {
  const [open, setOpen] = useState(false)
  return (
    <NodeViewWrapper className="my-1 flex gap-2 rounded-md bg-subtle px-4 py-3 outline outline-1 outline-[var(--border)]" data-type="callout">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button contentEditable={false} className="h-7 w-7 flex-none rounded text-[20px] leading-7 hover:bg-hover">
            {node.attrs.icon || '💡'}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start">
          <EmojiPicker
            onPick={(e) => {
              updateAttributes({ icon: e })
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
      <NodeViewContent className="min-w-0 flex-1 [&_p]:py-0.5" />
    </NodeViewWrapper>
  )
}

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'paragraph+',
  defining: true,
  addAttributes() {
    return { icon: { default: '💡' } }
  },
  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'callout' }), 0]
  },
  addNodeView() {
    return ReactNodeViewRenderer(CalloutView)
  },
})

// ---------- Date chip (@today) ----------

function DateChipView({ node, updateAttributes, selected }: ReactNodeViewProps) {
  const date = (node.attrs.date as string) || isoDate()
  const [open, setOpen] = useState(false)
  return (
    <NodeViewWrapper as="span" className="inline">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <span
            contentEditable={false}
            className={cn('cursor-pointer whitespace-nowrap text-muted hover:bg-hover rounded px-0.5', selected && 'bg-accent-soft')}
          >
            @{relativeDate(date)}
          </span>
        </PopoverTrigger>
        <PopoverContent align="start">
          <Calendar
            value={date}
            onChange={(d) => {
              updateAttributes({ date: d })
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
    </NodeViewWrapper>
  )
}

export const DateChip = Node.create({
  name: 'dateChip',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { date: { default: null } }
  },
  parseHTML() {
    return [{ tag: 'span[data-type="date"]', getAttrs: (el) => ({ date: (el as HTMLElement).getAttribute('data-date') }) }]
  },
  renderHTML({ node }) {
    return ['span', { 'data-type': 'date', 'data-date': node.attrs.date }, '@' + node.attrs.date]
  },
  renderText({ node }) {
    return '@' + node.attrs.date
  },
  addNodeView() {
    return ReactNodeViewRenderer(DateChipView)
  },
})

// ---------- Inline page link ([[Page]]) ----------

function PageLinkView({ node, selected }: ReactNodeViewProps) {
  const page = usePage(node.attrs.id as string)
  const navigate = useNavigate()
  const title = page ? page.title || 'Untitled' : (node.attrs.label as string) || 'Missing page'
  return (
    <NodeViewWrapper as="span" className="inline">
      <span
        contentEditable={false}
        onClick={() => page && void navigate({ to: '/p/$pageId', params: { pageId: page.id } })}
        className={cn(
          'cursor-pointer rounded px-0.5 underline decoration-[var(--text-faint)] underline-offset-2 hover:bg-hover',
          !page && 'text-faint line-through',
          selected && 'bg-accent-soft',
        )}
      >
        <PageIcon icon={page?.icon} kind={page?.kind} size={15} className="mr-1 inline-flex align-[-2px]" />
        {title}
      </span>
    </NodeViewWrapper>
  )
}

export const PageLink = Node.create({
  name: 'pageLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { id: { default: null }, label: { default: '' } }
  },
  parseHTML() {
    return [
      {
        tag: 'a[data-type="page-link"]',
        getAttrs: (el) => ({ id: (el as HTMLElement).getAttribute('data-id'), label: (el as HTMLElement).textContent }),
      },
    ]
  },
  renderHTML({ node }) {
    return ['a', { 'data-type': 'page-link', 'data-id': node.attrs.id, href: `/p/${node.attrs.id}` }, node.attrs.label || 'page']
  },
  renderText({ node }) {
    return `[[${node.attrs.label || ''}]]`
  },
  addNodeView() {
    return ReactNodeViewRenderer(PageLinkView)
  },
})

// ---------- Sub-page block ----------

function PageEmbedView({ node, selected }: ReactNodeViewProps) {
  const page = usePage(node.attrs.id as string)
  const navigate = useNavigate()
  return (
    <NodeViewWrapper data-drag-handle className="my-0.5">
      <div
        contentEditable={false}
        onClick={() => page && void navigate({ to: '/p/$pageId', params: { pageId: page.id } })}
        className={cn(
          'flex cursor-pointer items-center gap-2 rounded px-0.5 py-1 hover:bg-hover',
          selected && 'bg-accent-soft',
          (!page || page.trashedAt) && 'text-faint',
        )}
      >
        <PageIcon icon={page?.icon} kind={page?.kind} size={19} />
        <span className="font-medium underline decoration-[var(--text-faint)] underline-offset-2">
          {page ? page.title || 'Untitled' : 'Deleted page'}
          {page?.trashedAt ? ' (in trash)' : ''}
        </span>
      </div>
    </NodeViewWrapper>
  )
}

export const PageEmbed = Node.create({
  name: 'pageEmbed',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return { id: { default: null } }
  },
  parseHTML() {
    return [{ tag: 'div[data-type="page-embed"]', getAttrs: (el) => ({ id: (el as HTMLElement).getAttribute('data-id') }) }]
  },
  renderHTML({ node }) {
    return ['div', { 'data-type': 'page-embed', 'data-id': node.attrs.id }]
  },
  addNodeView() {
    return ReactNodeViewRenderer(PageEmbedView)
  },
})
