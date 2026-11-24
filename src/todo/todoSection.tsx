import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react'
import { ChevronRight, FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useWs } from '#/lib/app'
import { cn } from '#/components/ui/cn'

export const SECTIONS_EVENT = 'gunita:sections'

function countTasks(node: ReactNodeViewProps['node']) {
  let done = 0
  let total = 0
  node.descendants((n) => {
    if (n.type.name === 'taskItem') {
      const s = n.attrs.status as string | null
      if (s === 'moved' || s === 'dropped' || s === 'archived' || !n.firstChild?.textContent.trim()) return true
      total++
      if (n.attrs.checked) done++
    }
    return true
  })
  return { done, total }
}

function SectionView({ node, extension, getPos, editor }: ReactNodeViewProps) {
  const pageId = (extension.options as { pageId: string }).pageId
  const id = node.attrs.sectionId as string
  const def = useWs((s) => s.pages[pageId]?.sections?.find((x) => x.id === id))
  const name = def?.name ?? (node.attrs.name as string) ?? 'Section'
  const icon = def?.icon ?? (node.attrs.icon as string) ?? ''
  const key = `gunita:section-collapsed:${id}:${(() => {
    // Collapse per day: find the day this section is in.
    const pos = typeof getPos === 'function' ? getPos() : undefined
    if (pos == null) return ''
    const $pos = editor.state.doc.resolve(pos)
    for (let d = $pos.depth; d >= 0; d--) if ($pos.node(d).type.name === 'todoDay') return $pos.node(d).attrs.date as string
    return ''
  })()}`
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(key) === '1')
    } catch {
      /* ignore */
    }
  }, [key])
  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    try {
      if (next) localStorage.setItem(key, '1')
      else localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  }
  const { done, total } = countTasks(node)
  return (
    <NodeViewWrapper as="div" data-type="todoSection" data-section={id} className={cn('todo-section', def?.report && 'is-report')}>
      <div contentEditable={false} className="todo-section-header">
        <button onClick={toggle} className="todo-day-toggle" aria-label={collapsed ? 'Expand section' : 'Collapse section'}>
          <ChevronRight className={cn('h-3.5 w-3.5 transition', !collapsed && 'rotate-90')} />
        </button>
        <span className="todo-section-title">
          {icon && <span className="mr-1.5">{icon}</span>}
          {name}
        </span>
        {def?.report && (
          <span className="todo-section-badge" title="Tasks finished here go into your accomplishment report">
            <FileText className="h-3 w-3" /> In report
          </span>
        )}
        {!def && <span className="todo-section-badge">removed section</span>}
        {total > 0 && <span className={cn('todo-day-progress', done === total && 'is-done')}>{done}/{total}</span>}
        <button
          className="todo-section-edit"
          onClick={() => window.dispatchEvent(new CustomEvent(SECTIONS_EVENT, { detail: { pageId } }))}
          aria-label="Edit sections"
        >
          Edit
        </button>
      </div>
      <NodeViewContent className={cn('todo-section-body', collapsed && 'hidden')} />
    </NodeViewWrapper>
  )
}

/**
 * A section inside a TODO day, like "💼 Work" or "🏠 Personal". The list's
 * page settings hold each section's name, icon and whether it counts for the
 * accomplishment report; the node keeps a copy of the name in case the
 * section is removed later.
 */
export const TodoSection = Node.create<{ pageId: string }>({
  name: 'todoSection',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,
  addOptions() {
    return { pageId: '' }
  },
  addAttributes() {
    return {
      sectionId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-section'),
        renderHTML: (a) => ({ 'data-section': a.sectionId }),
      },
      name: { default: '', parseHTML: (el) => el.getAttribute('data-name'), renderHTML: (a) => ({ 'data-name': a.name }) },
      icon: { default: '', parseHTML: (el) => el.getAttribute('data-icon'), renderHTML: (a) => ({ 'data-icon': a.icon }) },
    }
  },
  parseHTML() {
    return [{ tag: 'div[data-type="todoSection"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'todoSection' }), 0]
  },
  addNodeView() {
    return ReactNodeViewRenderer(SectionView)
  },
})
