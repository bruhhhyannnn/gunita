import type { JSONContent } from '@tiptap/core'

/** What a link in Notion's Markdown points to, once resolved against the export. */
export type LinkTarget =
  | { kind: 'page'; id: string; title: string }
  | { kind: 'database'; id: string; title: string }
  | { kind: 'file'; url: string | null; name: string; image: boolean }
  | { kind: 'url'; href: string }

export interface MdContext {
  resolve: (href: string) => LinkTarget
}

export interface ParsedPage {
  title: string | null
  /** "Key: value" lines right under the title (database row properties). */
  props: Record<string, string>
  blocks: JSONContent[]
  /** Page / database ids linked on their own line, in order (they become sub-page blocks). */
  embeds: string[]
}

const text = (t: string, marks?: JSONContent['marks']): JSONContent => (marks?.length ? { type: 'text', text: t, marks } : { type: 'text', text: t })

/** Removes empty text nodes (ProseMirror rejects them). */
function compact(nodes: JSONContent[]): JSONContent[] {
  return nodes.filter((n) => n.type !== 'text' || !!n.text)
}

function unescape(s: string) {
  return s
    .replace(/\\([\\`*_{}[\]()#+\-.!|~<>])/g, '$1')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Finds "[label](href)" at i, with balanced parentheses in the href (Notion paths contain "(UX)"). */
function readLink(s: string, i: number): { label: string; href: string; end: number } | null {
  if (s[i] !== '[') return null
  let depth = 0
  let j = i
  for (; j < s.length; j++) {
    if (s[j] === '[') depth++
    else if (s[j] === ']') {
      depth--
      if (depth === 0) break
    }
  }
  if (j >= s.length || s[j + 1] !== '(') return null
  const label = s.slice(i + 1, j)
  let k = j + 2
  let paren = 1
  for (; k < s.length; k++) {
    if (s[k] === '(') paren++
    else if (s[k] === ')') {
      paren--
      if (paren === 0) break
    }
  }
  if (k >= s.length) return null
  return { label, href: s.slice(j + 2, k).trim(), end: k + 1 }
}

type Mark = NonNullable<JSONContent['marks']>[number]

/** Inline Markdown → text nodes with marks. Images found inline are returned separately as blocks. */
export function parseInline(s: string, ctx: MdContext, marks: Mark[] = [], images: JSONContent[] = []): JSONContent[] {
  const out: JSONContent[] = []
  let buf = ''
  const flush = () => {
    if (buf) out.push(text(unescape(buf), marks))
    buf = ''
  }
  const wrap = (inner: string, mark: Mark) => {
    flush()
    out.push(...parseInline(inner, ctx, [...marks, mark], images))
  }
  let i = 0
  while (i < s.length) {
    const rest = s.slice(i)
    if (s[i] === '\\' && i + 1 < s.length) {
      buf += s.slice(i, i + 2)
      i += 2
      continue
    }
    if (rest.startsWith('`')) {
      const end = s.indexOf('`', i + 1)
      if (end > i) {
        flush()
        out.push(text(s.slice(i + 1, end), [...marks.filter((m) => m.type === 'link'), { type: 'code' }]))
        i = end + 1
        continue
      }
    }
    if (rest.startsWith('![')) {
      const link = readLink(s, i + 1)
      if (link) {
        flush()
        const t = ctx.resolve(link.href)
        if (t.kind === 'file' && t.url) images.push({ type: 'image', attrs: { src: t.url, alt: link.label } })
        else if (t.kind === 'url') images.push({ type: 'image', attrs: { src: t.href, alt: link.label } })
        else out.push(text(`[image: ${link.label || 'missing'}]`, [...marks, { type: 'italic' }]))
        i = link.end
        continue
      }
    }
    if (s[i] === '[') {
      const link = readLink(s, i)
      if (link) {
        flush()
        const t = ctx.resolve(link.href)
        const label = unescape(link.label) || link.href
        if (t.kind === 'page' || t.kind === 'database') out.push({ type: 'pageLink', attrs: { id: t.id, label: t.title || label } })
        else if (t.kind === 'file') {
          if (t.url && t.image) images.push({ type: 'image', attrs: { src: t.url, alt: label } })
          else if (t.url) out.push(text(`📎 ${label}`, [...marks, { type: 'link', attrs: { href: t.url } }]))
          else out.push(text(`📎 ${label} (not uploaded)`, [...marks, { type: 'italic' }]))
        } else out.push(...parseInline(link.label, ctx, [...marks, { type: 'link', attrs: { href: t.href } }], images))
        i = link.end
        continue
      }
    }
    const pairs: [string, Mark][] = [
      ['**', { type: 'bold' }],
      ['__', { type: 'bold' }],
      ['~~', { type: 'strike' }],
    ]
    let matched = false
    for (const [tok, mark] of pairs) {
      if (rest.startsWith(tok)) {
        const end = s.indexOf(tok, i + tok.length)
        if (end > i + tok.length) {
          wrap(s.slice(i + tok.length, end), mark)
          i = end + tok.length
          matched = true
        }
        break
      }
    }
    if (matched) continue
    const html = rest.match(/^<(u|b|strong|i|em|s|del|mark)>([\s\S]*?)<\/\1>/i)
    if (html) {
      const tag = html[1].toLowerCase()
      const mark: Mark =
        tag === 'u' ? { type: 'underline' } : tag === 'b' || tag === 'strong' ? { type: 'bold' } : tag === 'i' || tag === 'em' ? { type: 'italic' } : tag === 'mark' ? { type: 'highlight' } : { type: 'strike' }
      wrap(html[2], mark)
      i += html[0].length
      continue
    }
    const tagOnly = rest.match(/^<\/?[a-z][^>]*>/i)
    if (tagOnly && !/^<https?:/i.test(tagOnly[0])) {
      i += tagOnly[0].length // drop other HTML tags
      continue
    }
    const auto = rest.match(/^<(https?:\/\/[^>\s]+)>/)
    if (auto) {
      flush()
      out.push(text(auto[1], [...marks, { type: 'link', attrs: { href: auto[1] } }]))
      i += auto[0].length
      continue
    }
    if ((s[i] === '*' || s[i] === '_') && s[i + 1] && s[i + 1] !== ' ' && s[i + 1] !== s[i]) {
      const end = s.indexOf(s[i], i + 1)
      const wordBoundary = s[i] === '*' || i === 0 || /\W/.test(s[i - 1])
      if (end > i + 1 && s[end - 1] !== ' ' && wordBoundary) {
        wrap(s.slice(i + 1, end), { type: 'italic' })
        i = end + 1
        continue
      }
    }
    buf += s[i]
    i++
  }
  flush()
  // Merge adjacent text nodes with the same marks.
  return out.filter((n) => n.type !== 'text' || n.text)
}

function paragraph(content: JSONContent[]): JSONContent {
  const c = compact(content)
  return c.length ? { type: 'paragraph', content: c } : { type: 'paragraph' }
}

/** Inline content of one line/paragraph, plus any images it contained (as blocks after it). */
function inlineBlock(s: string, ctx: MdContext): JSONContent[] {
  const images: JSONContent[] = []
  const content = parseInline(s, ctx, [], images)
  const onlyImages = content.every((n) => n.type === 'text' && !n.text?.trim())
  if (images.length && onlyImages) return images
  return [paragraph(content), ...images]
}

interface ListLine {
  indent: number
  kind: 'bullet' | 'ordered' | 'task'
  checked: boolean
  text: string
  continuation: string[]
}

const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(?:\[( |x|X)\]\s*)?(.*)$/

function indentOf(line: string) {
  return line.replace(/\t/g, '    ').match(/^ */)![0].length
}

/** Builds nested list nodes from list lines (Notion indents children by 4 spaces). */
function buildList(lines: ListLine[], ctx: MdContext): JSONContent[] {
  const out: JSONContent[] = []
  let i = 0
  const listType = (k: ListLine['kind']) => (k === 'task' ? 'taskList' : k === 'ordered' ? 'orderedList' : 'bulletList')
  while (i < lines.length) {
    const base = lines[i].indent
    const kind = lines[i].kind
    const items: JSONContent[] = []
    while (i < lines.length && lines[i].indent === base && lines[i].kind === kind) {
      const line = lines[i]
      i++
      const children: ListLine[] = []
      while (i < lines.length && lines[i].indent > base) children.push(lines[i++])
      const body = [line.text, ...line.continuation].filter((x, n) => n === 0 || x.trim())
      const inline: JSONContent[] = []
      const images: JSONContent[] = []
      body.forEach((b, n) => {
        if (n > 0) inline.push({ type: 'hardBreak' })
        inline.push(...parseInline(b, ctx, [], images))
      })
      const content: JSONContent[] = [paragraph(inline), ...images, ...(children.length ? buildList(children, ctx) : [])]
      items.push(
        kind === 'task'
          ? { type: 'taskItem', attrs: { checked: line.checked }, content }
          : { type: 'listItem', content },
      )
    }
    if (items.length) out.push({ type: listType(kind), content: items })
    // A line indented less than the list's base (shouldn't happen) starts a new list.
    if (i < lines.length && lines[i].indent < base && out.length === 0) i++
  }
  return out
}

/** Converts a Notion-exported Markdown page into editor JSON blocks. */
export function parseNotionMarkdown(md: string, ctx: MdContext, opts: { readProps?: boolean } = {}): ParsedPage {
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  let i = 0
  let title: string | null = null
  const props: Record<string, string> = {}
  const blocks: JSONContent[] = []
  const embeds: string[] = []

  while (i < lines.length && !lines[i].trim()) i++
  if (lines[i]?.startsWith('# ')) {
    title = unescape(lines[i].slice(2).trim())
    i++
    if (opts.readProps) {
      while (i < lines.length && !lines[i].trim()) i++
      while (i < lines.length && /^[^\s:][^:]{0,60}: /.test(lines[i])) {
        const [k, ...v] = lines[i].split(': ')
        props[k.trim()] = v.join(': ').trim()
        i++
      }
    }
  }

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed) {
      i++
      continue
    }
    // Code fences
    if (/^\s*```/.test(line)) {
      const lang = trimmed.slice(3).trim().split(/\s+/)[0] || null
      const code: string[] = []
      i++
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) code.push(lines[i++])
      i++
      const body = code.join('\n')
      blocks.push({ type: 'codeBlock', attrs: { language: lang && lang !== 'plain' ? lang.toLowerCase() : null }, content: body ? [text(body)] : [] })
      continue
    }
    // Headings
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      const level = Math.min(3, h[1].length)
      const hc = compact(parseInline(h[2], ctx))
      blocks.push(hc.length ? { type: 'heading', attrs: { level }, content: hc } : { type: 'heading', attrs: { level } })
      i++
      continue
    }
    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(trimmed) && !LIST_RE.test(line)) {
      blocks.push({ type: 'horizontalRule' })
      i++
      continue
    }
    // Callouts: <aside> 💡 text </aside>
    if (trimmed.startsWith('<aside')) {
      const inner: string[] = []
      i++
      while (i < lines.length && !lines[i].includes('</aside>')) inner.push(lines[i++])
      i++
      const nonEmpty = inner.map((l) => l.trim()).filter(Boolean)
      let icon = '💡'
      const first = nonEmpty[0] ?? ''
      const em = first.match(/^(\p{Extended_Pictographic}️?)\s*(.*)$/u)
      if (em) {
        icon = em[1]
        nonEmpty[0] = em[2]
      }
      const paras = nonEmpty.filter(Boolean).flatMap((l) => inlineBlock(l, ctx)).filter((b) => b.type === 'paragraph')
      blocks.push({ type: 'callout', attrs: { icon }, content: paras.length ? paras : [paragraph([])] })
      continue
    }
    // Toggles: <details><summary>…</summary> … </details>
    if (trimmed.startsWith('<details')) {
      const inner: string[] = []
      i++
      let depth = 1
      while (i < lines.length) {
        if (lines[i].includes('<details')) depth++
        if (lines[i].includes('</details>')) {
          depth--
          if (depth === 0) break
        }
        inner.push(lines[i++])
      }
      i++
      const joined = inner.join('\n')
      const sum = joined.match(/<summary>([\s\S]*?)<\/summary>/)
      const body = joined.replace(/<summary>[\s\S]*?<\/summary>/, '')
      const sub = parseNotionMarkdown(body, ctx)
      blocks.push({
        type: 'details',
        content: [
          { type: 'detailsSummary', content: sum ? compact(parseInline(sum[1].trim(), ctx)) : [] },
          { type: 'detailsContent', content: sub.blocks.length ? sub.blocks : [paragraph([])] },
        ],
      })
      embeds.push(...sub.embeds)
      continue
    }
    // Tables
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i]
          .trim()
          .replace(/^\||\|$/g, '')
          .split(/(?<!\\)\|/)
          .map((c) => c.trim())
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells)
        i++
      }
      const width = Math.max(...rows.map((r) => r.length))
      blocks.push({
        type: 'table',
        content: rows.map((r, ri) => ({
          type: 'tableRow',
          content: Array.from({ length: width }, (_, ci) => ({
            type: ri === 0 ? 'tableHeader' : 'tableCell',
            content: [paragraph(parseInline(r[ci] ?? '', ctx))],
          })),
        })),
      })
      continue
    }
    // Quotes
    if (/^\s*>/.test(line)) {
      const inner: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i])) inner.push(lines[i++].replace(/^\s*>\s?/, ''))
      const sub = parseNotionMarkdown(inner.join('\n'), ctx)
      blocks.push({ type: 'blockquote', content: sub.blocks.length ? sub.blocks : [paragraph([])] })
      continue
    }
    // Lists (bullets, numbers, to-dos), with nesting and wrapped lines
    if (LIST_RE.test(line)) {
      const items: ListLine[] = []
      while (i < lines.length) {
        const l = lines[i]
        const m = l.match(LIST_RE)
        if (m) {
          const kind: ListLine['kind'] = m[3] !== undefined ? 'task' : /\d/.test(m[2]) ? 'ordered' : 'bullet'
          items.push({ indent: indentOf(m[1]), kind, checked: (m[3] ?? '').toLowerCase() === 'x', text: m[4], continuation: [] })
          i++
          continue
        }
        if (!l.trim()) {
          // A blank line ends the list unless the next line continues it.
          const next = lines[i + 1]
          if (next && LIST_RE.test(next) && indentOf(next) > 0) {
            i++
            continue
          }
          break
        }
        // Wrapped text of the previous item (Notion keeps it at the item's indentation).
        const last = items[items.length - 1]
        if (last && indentOf(l) >= last.indent && indentOf(l) > 0) {
          last.continuation.push(l.trim())
          i++
          continue
        }
        break
      }
      blocks.push(...buildList(items, ctx))
      continue
    }
    // A link alone on a line to a sub-page or database becomes an embedded block.
    const only = readLink(trimmed, 0)
    if (only && only.end === trimmed.length) {
      const t = ctx.resolve(only.href)
      if (t.kind === 'page') {
        blocks.push({ type: 'pageEmbed', attrs: { id: t.id } })
        embeds.push(t.id)
        i++
        continue
      }
      if (t.kind === 'database') {
        blocks.push({ type: 'databaseEmbed', attrs: { id: t.id } })
        embeds.push(t.id)
        i++
        continue
      }
    }
    // Paragraph: consecutive lines form one block with line breaks.
    const para: string[] = [trimmed]
    i++
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*```|\s*>|\||<aside|<details)/.test(lines[i]) && !LIST_RE.test(lines[i])) para.push(lines[i++].trim())
    const images: JSONContent[] = []
    const content: JSONContent[] = []
    para.forEach((p, n) => {
      if (n > 0) content.push({ type: 'hardBreak' })
      content.push(...parseInline(p, ctx, [], images))
    })
    const hasText = content.some((c) => c.type !== 'hardBreak' && (c.type !== 'text' || c.text?.trim()))
    if (hasText) blocks.push(paragraph(content))
    blocks.push(...images)
  }
  return { title, props, blocks, embeds }
}

/** Plain text of a block's inline content (for detecting date lines). */
export function blockText(b: JSONContent): string {
  return (b.content ?? []).map((c) => (c.type === 'text' ? (c.text ?? '') : '')).join('').trim()
}
