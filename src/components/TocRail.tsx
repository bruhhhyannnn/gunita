import type { Editor } from '@tiptap/react'
import { useEffect, useState, type RefObject } from 'react'
import { cn } from './ui/cn'

interface Heading {
  level: number
  text: string
  pos: number
}

/** Notion-style table of contents: short lines on the right that expand on hover. */
export function TocRail({ editor, scroller }: { editor: Editor; scroller: RefObject<HTMLDivElement | null> }) {
  const [headings, setHeadings] = useState<Heading[]>([])
  const [active, setActive] = useState(0)

  useEffect(() => {
    const read = () => {
      const hs: Heading[] = []
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading') hs.push({ level: node.attrs.level, text: node.textContent, pos })
        if (node.type.name === 'todoDay') hs.push({ level: 2, text: node.attrs.label || node.attrs.date, pos })
        return node.type.name !== 'heading'
      })
      setHeadings(hs)
    }
    read()
    editor.on('update', read)
    return () => {
      editor.off('update', read)
    }
  }, [editor])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const onScroll = () => {
      let idx = 0
      headings.forEach((h, i) => {
        const dom = editor.view.nodeDOM(h.pos) as HTMLElement | null
        if (dom && dom.getBoundingClientRect().top < 140) idx = i
      })
      setActive(idx)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [editor, headings, scroller])

  if (headings.length < 2) return null
  const go = (h: Heading) => {
    const dom = editor.view.nodeDOM(h.pos) as HTMLElement | null
    dom?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  return (
    <div className="group fixed right-3 top-1/3 z-10 hidden lg:block">
      <div className="flex flex-col items-end gap-2.5 py-2 group-hover:hidden">
        {headings.slice(0, 30).map((h, i) => (
          <div
            key={i}
            className={cn('h-0.5 rounded', i === active ? 'bg-fg' : 'bg-faint')}
            style={{ width: h.level === 1 ? 18 : h.level === 2 ? 14 : 10 }}
          />
        ))}
      </div>
      <div className="hidden max-h-[60vh] w-60 overflow-y-auto rounded-lg bg-popover p-2 shadow-pop group-hover:block">
        {headings.map((h, i) => (
          <button
            key={i}
            onClick={() => go(h)}
            className={cn('block w-full truncate rounded px-2 py-1 text-left text-[13px] hover:bg-hover', i === active ? 'text-accent' : 'text-muted')}
            style={{ paddingLeft: 8 + (h.level - 1) * 12 }}
          >
            {h.text || 'Untitled'}
          </button>
        ))}
      </div>
    </div>
  )
}
