import * as Y from 'yjs'
import { createStore, entries, set, del } from 'idb-keyval'
import MiniSearch from 'minisearch'
import type { DocManager } from './docs'
import type { Workspace } from './workspace'

export interface IndexedTask {
  taskId: string
  text: string
  checked: boolean
  status?: string // 'moved' | 'dropped' | 'snoozed' | 'someday' | 'archived'
  templateId?: string
  day?: string // YYYY-MM-DD of the TODO day section it lives in
  section?: string // id of the TODO section (e.g. Work) it lives in
  since?: string
  carry?: number
  depth: number
}

export interface PageIndexEntry {
  id: string
  text: string
  headings: { level: number; text: string }[]
  tasks: IndexedTask[]
  links: string[]
  dates: string[]
  days: string[]
  /** Days that are split into sections (Work, Personal, …). */
  sectionDays?: string[]
  updatedAt: number
}

const MAX_TEXT = 60_000

function inlineText(t: Y.XmlText): string {
  return (t.toDelta() as { insert: unknown }[]).map((d) => (typeof d.insert === 'string' ? d.insert : '')).join('')
}

/** Walks a page body (Tiptap/ProseMirror as Yjs XML) and extracts text, tasks and links. */
export function extract(id: string, doc: Y.Doc): PageIndexEntry {
  const frag = doc.getXmlFragment('default')
  const lines: string[] = []
  const headings: PageIndexEntry['headings'] = []
  const tasks: IndexedTask[] = []
  const links = new Set<string>()
  const dates = new Set<string>()
  const days: string[] = []
  const sectionDays = new Set<string>()

  const textOf = (el: Y.XmlElement | Y.XmlFragment): string => {
    let s = ''
    for (const c of el.toArray()) {
      if (c instanceof Y.XmlText) s += inlineText(c)
      else if (c instanceof Y.XmlElement) {
        if (c.nodeName === 'pageLink') {
          const pid = c.getAttribute('id') as string | undefined
          if (pid) links.add(pid)
          s += (c.getAttribute('label') as string) || ''
        } else if (c.nodeName === 'dateChip') {
          const d = c.getAttribute('date') as string | undefined
          if (d) {
            dates.add(d)
            s += d
          }
        } else if (c.nodeName === 'hardBreak') s += '\n'
        else if (!isBlock(c.nodeName)) s += textOf(c)
      }
    }
    return s
  }

  const walk = (el: Y.XmlElement | Y.XmlFragment, ctx: { day?: string; section?: string; depth: number }) => {
    for (const c of el.toArray()) {
      if (!(c instanceof Y.XmlElement)) continue
      const name = c.nodeName
      if (name === 'todoDay') {
        const day = c.getAttribute('date') as string
        if (day) days.push(day)
        walk(c, { ...ctx, day })
        continue
      }
      if (name === 'todoSection') {
        if (ctx.day) sectionDays.add(ctx.day)
        walk(c, { ...ctx, section: (c.getAttribute('sectionId') as string) || undefined })
        continue
      }
      if (name === 'taskItem') {
        const para = c.toArray().find((x) => x instanceof Y.XmlElement && x.nodeName === 'paragraph') as
          | Y.XmlElement
          | undefined
        const text = para ? textOf(para) : ''
        tasks.push({
          taskId: (c.getAttribute('taskId') as string) || '',
          text,
          checked: [true, 'true'].includes(c.getAttribute('checked') as never),
          status: (c.getAttribute('status') as string) || undefined,
          templateId: (c.getAttribute('templateId') as string) || undefined,
          day: ctx.day,
          section: ctx.section,
          since: (c.getAttribute('since') as string) || undefined,
          carry: Number(c.getAttribute('carry') || 0) || undefined,
          depth: ctx.depth,
        })
        lines.push(text)
        for (const sub of c.toArray()) {
          if (sub instanceof Y.XmlElement && sub !== para) walk(sub, { ...ctx, depth: ctx.depth + 1 })
        }
        continue
      }
      if (name === 'pageEmbed' || name === 'databaseEmbed') {
        const pid = c.getAttribute('id') as string | undefined
        if (pid) links.add(pid)
        continue
      }
      if (isTextBlock(name)) {
        const t = textOf(c)
        if (name === 'heading') headings.push({ level: Number(c.getAttribute('level') || 1), text: t })
        if (t) lines.push(t)
        continue
      }
      walk(c, ctx)
    }
  }
  walk(frag, { depth: 0 })
  let text = lines.join('\n')
  if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT)
  return { id, text, headings, tasks, links: [...links], dates: [...dates], days, sectionDays: [...sectionDays], updatedAt: Date.now() }
}

function isTextBlock(n: string) {
  return n === 'paragraph' || n === 'heading' || n === 'codeBlock' || n === 'detailsSummary'
}

function isBlock(n: string) {
  return isTextBlock(n) || n.endsWith('List') || n === 'listItem' || n === 'taskItem' || n === 'blockquote'
}

/**
 * Keeps derived data for every page (plain text, tasks, links) in IndexedDB, and
 * a full-text search index in memory. Used by search, Start Today, AI and the graph.
 */
export class PageIndex {
  private kv: ReturnType<typeof createStore>
  private map = new Map<string, PageIndexEntry>()
  private search: MiniSearch<{ id: string; title: string; text: string }>
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  private listeners = new Set<() => void>()
  private version = 0
  readonly ready: Promise<void>

  constructor(
    private docs: DocManager,
    private ws: Workspace,
    userId: string,
  ) {
    const kv = createStore(`gunita-${userId}-index`, 'kv')
    this.kv = kv
    this.search = new MiniSearch({
      fields: ['title', 'text'],
      storeFields: ['id'],
      searchOptions: { boost: { title: 3 }, prefix: true, fuzzy: 0.15 },
    })
    this.ready = (async () => {
      for (const [k, v] of await entries<string, PageIndexEntry>(kv)) this.map.set(k, v)
      this.rebuildSearch()
    })()
    docs.onUpdate((docId) => {
      if (docId !== 'workspace') this.schedule(docId)
    })
    ws.subscribe(() => this.titlesChanged())
  }

  private lastTitles = ''

  private titlesChanged() {
    const titles = Object.values(this.ws.getSnapshot().pages)
      .map((p) => p.id + p.title)
      .join()
    if (titles !== this.lastTitles) {
      this.lastTitles = titles
      this.rebuildSearchSoon()
    }
  }

  private searchTimer: ReturnType<typeof setTimeout> | null = null
  private rebuildSearchSoon() {
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => this.rebuildSearch(), 400)
  }

  private rebuildSearch() {
    this.search.removeAll()
    const pages = this.ws.getSnapshot().pages
    const docs = Object.values(pages)
      .filter((p) => !p.trashedAt)
      .map((p) => ({ id: p.id, title: p.title || 'Untitled', text: this.map.get(p.id)?.text ?? '' }))
    this.search.addAll(docs)
    this.bump()
  }

  schedule(docId: string, ms = 800) {
    const t = this.timers.get(docId)
    if (t) clearTimeout(t)
    this.timers.set(
      docId,
      setTimeout(() => {
        this.timers.delete(docId)
        void this.reindex(docId)
      }, ms),
    )
  }

  async reindex(docId: string) {
    const entry = await this.docs.withDoc(docId, (doc) => extract(docId, doc))
    this.map.set(docId, entry)
    await set(docId, entry, this.kv)
    this.rebuildSearchSoon()
  }

  /** Makes sure every page has an index entry (e.g. after first sync on a new device). */
  async fillMissing() {
    const pages = Object.values(this.ws.getSnapshot().pages)
    for (const p of pages) if (!this.map.has(p.id)) await this.reindex(p.id)
  }

  async remove(docId: string) {
    this.map.delete(docId)
    await del(docId, this.kv)
    this.rebuildSearchSoon()
  }

  get(id: string) {
    return this.map.get(id)
  }

  all() {
    return [...this.map.values()]
  }

  query(q: string, limit = 20) {
    if (!q.trim()) return []
    return this.search.search(q).slice(0, limit) as unknown as { id: string; score: number; match: Record<string, string[]> }[]
  }

  /** Text snippet around the first match, for search results. */
  snippet(id: string, q: string, len = 120) {
    const text = this.map.get(id)?.text ?? ''
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    const lower = text.toLowerCase()
    let pos = -1
    for (const w of words) {
      pos = lower.indexOf(w)
      if (pos >= 0) break
    }
    if (pos < 0) return text.slice(0, len)
    const start = Math.max(0, pos - 40)
    return (start > 0 ? '…' : '') + text.slice(start, start + len).replace(/\n/g, ' ')
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l)
    return () => {
      this.listeners.delete(l)
    }
  }

  getVersion = () => this.version

  private bump() {
    this.version++
    this.listeners.forEach((l) => l())
  }
}
