import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react'
import { ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { isoDate, longDate, relativeDate } from '#/lib/dates'
import { cn } from '#/components/ui/cn'

function collapsedKey(date: string) {
  return `gunita:day-collapsed:${date}`
}

function countTasks(node: ReactNodeViewProps['node']) {
  let done = 0
  let total = 0
  node.descendants((n) => {
    if (n.type.name === 'taskItem') {
      const s = n.attrs.status as string | null
      if (s === 'moved' || s === 'dropped') return true
      total++
      if (n.attrs.checked) done++
    }
    return true
  })
  return { done, total }
}

function TodoDayView({ node }: ReactNodeViewProps) {
  const date = node.attrs.date as string
  const someday = date === 'someday'
  const today = isoDate()
  const isToday = date === today
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(collapsedKey(date)) === '1')
    } catch {
      /* ignore */
    }
  }, [date])
  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    try {
      if (next) localStorage.setItem(collapsedKey(date), '1')
      else localStorage.removeItem(collapsedKey(date))
    } catch {
      /* ignore */
    }
  }
  const { done, total } = countTasks(node)
  return (
    <NodeViewWrapper as="section" data-type="todoDay" data-date={date} className={cn('todo-day', isToday && 'is-today', someday && 'is-someday')}>
      <header contentEditable={false} className="todo-day-header group/day">
        <button onClick={toggle} className="todo-day-toggle" aria-label={collapsed ? 'Expand day' : 'Collapse day'}>
          <ChevronRight className={cn('h-4 w-4 transition', !collapsed && 'rotate-90')} />
        </button>
        <span className="todo-day-title">
          {someday ? '🌙 Someday' : isToday ? '☀️ Today' : `@${relativeDate(date)}`}
        </span>
        {!someday && <span className="todo-day-date">{longDate(date)}</span>}
        {total > 0 && (
          <span className={cn('todo-day-progress', done === total && 'is-done')}>
            {done}/{total}
          </span>
        )}
      </header>
      <NodeViewContent className={cn('todo-day-body', collapsed && 'hidden')} />
    </NodeViewWrapper>
  )
}

/** A day section in a TODO list. Days are stacked newest first on one page. */
export const TodoDay = Node.create({
  name: 'todoDay',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,
  draggable: true,
  addAttributes() {
    return {
      date: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-date'),
        renderHTML: (a) => ({ 'data-date': a.date }),
      },
    }
  },
  parseHTML() {
    return [{ tag: 'section[data-type="todoDay"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['section', mergeAttributes(HTMLAttributes, { 'data-type': 'todoDay' }), 0]
  },
  addNodeView() {
    return ReactNodeViewRenderer(TodoDayView)
  },
})
