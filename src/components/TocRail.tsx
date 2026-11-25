import type { Editor } from '@tiptap/react'
import { useEffect, useRef, useState, type RefObject } from 'react'
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
  // Latest positions of the headings (they move as you type above them).
  const positions = useRef<number[]>([])

  useEffect(() => {
    let last = ''
    const read = () => {
      const hs: Heading[] = []
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading') hs.push({ level: node.attrs.level, text: node.textContent, pos })
        if (node.type.name === 'todoDay') {
          hs.push({ level: 2, text: node.attrs.label || node.attrs.date, pos })
          return false // days hold tasks, not headings
        }
        return node.type.name !== 'heading'
      })
      // Only re-render when the headings themselves changed, not on every keystroke.
      const sig = hs.map((h) => `${h.level}:${h.text}`).join('\n')
      if (sig === last) {
        positions.current = hs.map((h) => h.pos)
        return
      }
      last = sig
      positions.current = hs.map((h) => h.pos)
      setHeadings(hs)
    }
    read()
    // Read after typing pauses: on long pages this walks the whole document.
    let timer: ReturnType<typeof setTimeout> | null = null
    const onUpdate = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(read, 400)
    }
    editor.on('update', onUpdate)
    return () => {
      if (timer) clearTimeout(timer)
      editor.off('update', onUpdate)
    }
  }, [editor])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const onScroll = () => {
      let idx = 0
      headings.forEach((h, i) => {
        const dom = editor.view.nodeDOM(positions.current[i] ?? h.pos) as HTMLElement | null
        if (dom && dom.getBoundingClientRect().top < 140) idx = i
      })
      setActive(idx)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [editor, headings, scroller])

  if (headings.length < 2) return null
  const go = (h: Heading, i: number) => {
    const dom = editor.view.nodeDOM(positions.current[i] ?? h.pos) as HTMLElement | null
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
            onClick={() => go(h, i)}
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
