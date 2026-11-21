import { Extension, type Editor, type Range } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { PluginKey } from '@tiptap/pm/state'
import {
  AlertCircle,
  Calendar,
  CheckSquare,
  ChevronRight,
  Code2,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  ImageIcon,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Table,
  Table2,
  Type,
} from 'lucide-react'
import { getApp } from '#/lib/app'
import { createPageOfKind } from '#/lib/actions'
import { addDays, isoDate, relativeDate, shortDate } from '#/lib/dates'
import { PageIcon } from '#/components/PageIcon'
import { suggestionRenderer, type SuggestItem } from './suggest'
import { pickAndUploadImage } from './uploads'

export interface EditorContext {
  pageId: string
}

function slashItems(editor: Editor, ctx: EditorContext): (SuggestItem & { keywords?: string })[] {
  let range: Range = { from: 0, to: 0 }
  const chain = () => editor.chain().focus().deleteRange(range)
  const wrap = (fn: () => void) => (r: Range) => {
    range = r
    fn()
  }
  const items: (Omit<SuggestItem, 'run'> & { keywords?: string; run: () => void })[] = [
    { id: 'text', group: 'Basic blocks', title: 'Text', icon: <Type />, run: () => chain().setParagraph().run() },
    { id: 'h1', group: 'Basic blocks', title: 'Heading 1', keywords: 'title big', icon: <Heading1 />, run: () => chain().setHeading({ level: 1 }).run() },
    { id: 'h2', group: 'Basic blocks', title: 'Heading 2', icon: <Heading2 />, run: () => chain().setHeading({ level: 2 }).run() },
    { id: 'h3', group: 'Basic blocks', title: 'Heading 3', icon: <Heading3 />, run: () => chain().setHeading({ level: 3 }).run() },
    { id: 'todo', group: 'Basic blocks', title: 'To-do list', keywords: 'task checkbox check', icon: <CheckSquare />, run: () => chain().toggleTaskList().run() },
    { id: 'bullet', group: 'Basic blocks', title: 'Bulleted list', keywords: 'ul unordered', icon: <List />, run: () => chain().toggleBulletList().run() },
    { id: 'number', group: 'Basic blocks', title: 'Numbered list', keywords: 'ol ordered', icon: <ListOrdered />, run: () => chain().toggleOrderedList().run() },
    { id: 'toggle', group: 'Basic blocks', title: 'Toggle list', keywords: 'details collapse', icon: <ChevronRight />, run: () => chain().setDetails().run() },
    {
      id: 'page',
      group: 'Basic blocks',
      title: 'Page',
      subtitle: 'Embed a sub-page inside this page',
      keywords: 'subpage new',
      icon: <FileText />,
      run: () => {
        const id = createPageOfKind('page', { parentId: ctx.pageId })
        chain().insertContent({ type: 'pageEmbed', attrs: { id } }).run()
      },
    },
    {
      id: 'callout',
      group: 'Basic blocks',
      title: 'Callout',
      keywords: 'note info box',
      icon: <AlertCircle />,
      run: () => chain().insertContent({ type: 'callout', content: [{ type: 'paragraph' }] }).run(),
    },
    { id: 'quote', group: 'Basic blocks', title: 'Quote', icon: <Quote />, run: () => chain().toggleBlockquote().run() },
    { id: 'divider', group: 'Basic blocks', title: 'Divider', keywords: 'hr line rule', icon: <Minus />, run: () => chain().setHorizontalRule().run() },
    { id: 'code', group: 'Basic blocks', title: 'Code', keywords: 'snippet pre', icon: <Code2 />, run: () => chain().toggleCodeBlock().run() },
    {
      id: 'table',
      group: 'Basic blocks',
      title: 'Table',
      subtitle: 'Simple table (use Database for properties)',
      icon: <Table />,
      run: () => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    {
      id: 'link',
      group: 'Basic blocks',
      title: 'Link to page',
      keywords: 'mention reference',
      icon: <Link2 />,
      run: () => chain().insertContent('[[').run(),
    },
    {
      id: 'image',
      group: 'Media',
      title: 'Image',
      subtitle: 'Upload or paste an image',
      keywords: 'photo picture upload',
      icon: <ImageIcon />,
      run: () => {
        chain().run()
        void pickAndUploadImage(editor)
      },
    },
    {
      id: 'database',
      group: 'Database',
      title: 'Database – Inline',
      subtitle: 'Table, board or calendar inside this page',
      keywords: 'table board kanban calendar',
      icon: <Table2 />,
      run: () => {
        const id = createPageOfKind('database', { parentId: ctx.pageId })
        chain().insertContent({ type: 'databaseEmbed', attrs: { id } }).run()
      },
    },
    {
      id: 'date',
      group: 'Inline',
      title: 'Date',
      subtitle: "Today's date, e.g. @Today",
      keywords: 'today mention',
      icon: <Calendar />,
      run: () => chain().insertContent([{ type: 'dateChip', attrs: { date: isoDate() } }, { type: 'text', text: ' ' }]).run(),
    },
  ]
  return items.map((it) => ({ ...it, run: wrap(it.run) }))
}

function matches(it: { title: string; keywords?: string; id: string }, q: string) {
  const s = `${it.title} ${it.keywords ?? ''} ${it.id}`.toLowerCase()
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((w) => s.includes(w))
}

export const SlashCommands = Extension.create<{ ctx: EditorContext }>({
  name: 'slashCommands',
  addOptions() {
    return { ctx: { pageId: '' } }
  },
  addProseMirrorPlugins() {
    const ctx = this.options.ctx
    return [
      Suggestion<SuggestItem>({
        editor: this.editor,
        pluginKey: new PluginKey('slash'),
        char: '/',
        allowSpaces: false,
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from)
          return $from.parent.type.name !== 'codeBlock'
        },
        items: ({ query, editor }) => slashItems(editor, ctx).filter((it) => !query || matches(it, query)),
        command: ({ range, props }) => props.run(range),
        render: suggestionRenderer('No matching blocks'),
      }),
    ]
  },
})

// ---------- [[ page links and @ mentions ----------

function pageItems(editor: Editor, query: string, ctx: EditorContext, limit = 8): SuggestItem[] {
  const { ws, index } = getApp()
  const pages = ws.getSnapshot().pages
  const found = query.trim()
    ? index
        .query(query, 20)
        .map((r) => pages[r.id])
        .filter(Boolean)
    : Object.values(pages).sort((a, b) => b.updatedAt - a.updatedAt)
  const items: SuggestItem[] = found
    .filter((p) => p && !p.trashedAt && p.id !== ctx.pageId)
    .slice(0, limit)
    .map((p) => ({
      id: 'page-' + p.id,
      group: 'Pages',
      title: p.title || 'Untitled',
      subtitle: ws
        .ancestors(p.id)
        .map((a) => a.title || 'Untitled')
        .join(' / '),
      icon: <PageIcon icon={p.icon} kind={p.kind} size={16} />,
      run: (range: Range) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent([{ type: 'pageLink', attrs: { id: p.id, label: p.title } }, { type: 'text', text: ' ' }])
          .run(),
    }))
  if (query.trim()) {
    items.push({
      id: 'new',
      group: 'Create',
      title: `New page "${query.trim()}"`,
      icon: <FileText />,
      run: (range: Range) => {
        const id = createPageOfKind('page', { parentId: ctx.pageId, title: query.trim() })
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent([{ type: 'pageLink', attrs: { id, label: query.trim() } }, { type: 'text', text: ' ' }])
          .run()
      },
    })
  }
  return items
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function dateItems(editor: Editor, query: string): SuggestItem[] {
  const today = isoDate()
  const q = query.toLowerCase().trim()
  const candidates: string[] = [today, addDays(today, 1), addDays(today, -1)]
  const dow = new Date().getDay()
  WEEKDAYS.forEach((w, i) => {
    if (q && (w.startsWith(q.replace(/^(next|last)\s*/, '')) || q.includes(w))) {
      let diff = (i - dow + 7) % 7 || 7
      if (q.startsWith('last')) diff -= 7
      candidates.push(addDays(today, diff))
    }
  })
  if (/^\d{4}-\d{2}-\d{2}$/.test(q)) candidates.push(q)
  const seen = new Set<string>()
  return candidates
    .filter((d) => !seen.has(d) && seen.add(d))
    .map((d) => ({ d, label: relativeDate(d) }))
    .filter(({ d, label }) => !q || label.toLowerCase().includes(q) || d.includes(q) || /^(next|last)?\s*[a-z]+$/.test(q))
    .slice(0, 5)
    .map(({ d, label }) => ({
      id: 'date-' + d,
      group: 'Date',
      title: label,
      subtitle: shortDate(d),
      icon: <Calendar />,
      run: (range: Range) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent([{ type: 'dateChip', attrs: { date: d } }, { type: 'text', text: ' ' }])
          .run(),
    }))
}

export const Mentions = Extension.create<{ ctx: EditorContext }>({
  name: 'mentions',
  addOptions() {
    return { ctx: { pageId: '' } }
  },
  addProseMirrorPlugins() {
    const ctx = this.options.ctx
    return [
      Suggestion<SuggestItem>({
        editor: this.editor,
        pluginKey: new PluginKey('pageLinkSuggest'),
        char: '[[',
        allowSpaces: true,
        items: ({ query, editor }) => pageItems(editor, query.replace(/\]+$/, ''), ctx),
        command: ({ range, props }) => props.run(range),
        render: suggestionRenderer(),
      }),
      Suggestion<SuggestItem>({
        editor: this.editor,
        pluginKey: new PluginKey('atSuggest'),
        char: '@',
        allowSpaces: true,
        items: ({ query, editor }) => {
          if (query.length > 24) return []
          return [...dateItems(editor, query), ...pageItems(editor, query, ctx, 5).filter((i) => i.id !== 'new')]
        },
        command: ({ range, props }) => props.run(range),
        render: suggestionRenderer(),
      }),
    ]
  },
})
