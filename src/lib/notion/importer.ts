import type { JSONContent } from '@tiptap/core'
import { getApp } from '#/lib/app'
import { newId, shortId } from '#/lib/ids'
import { isoDate } from '#/lib/dates'
import { OPTION_COLORS } from '#/lib/database'
import { validateDoc, writePageDoc } from '#/lib/editorSchema'
import type { DatabaseSchema, PropDef, TemplateItem } from '#/lib/types'
import { uploadFile } from '#/editor/uploads'
import { parseCsv } from './csv'
import { basename, dirname, readExport, resolvePath, splitName } from './zip'
import { blockText, parseNotionMarkdown, type LinkTarget, type ParsedPage } from './markdown'

type Kind = 'page' | 'todo' | 'database' | 'row'

interface PlanPage {
  key: string
  newId: string
  title: string
  kind: Kind
  parentKey: string | null
  mdPath?: string
  csvPath?: string
  dateLines: number
}

export interface TodoCandidate {
  key: string
  title: string
  days: number
}

export interface ImportPlan {
  files: Map<string, Uint8Array>
  pages: Map<string, PlanPage>
  attachments: string[]
  attachmentBytes: number
  todoCandidates: TodoCandidate[]
  counts: { pages: number; databases: number; rows: number }
}

export interface ImportOptions {
  /** Put everything inside one "Imported from Notion" page (easy to delete when testing). */
  container: boolean
  /** Which detected pages become TODO lists. */
  todoKeys: string[]
  /** For TODO lists: carry unfinished tasks only from the latest day ('latest') or from every day ('all'). */
  carry: 'latest' | 'all'
}

export interface Progress {
  step: string
  done: number
  total: number
}

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December'
const DATE_LINE = new RegExp(`^@?(?:(?:${MONTHS}) \\d{1,2}, \\d{4}|\\d{4}-\\d{2}-\\d{2})$`)
const IMAGE = /\.(png|jpe?g|gif|webp|svg|bmp)$/i

export function parseDateLine(s: string): string | null {
  const t = s.trim().replace(/^@/, '')
  if (!DATE_LINE.test(s.trim())) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const d = new Date(t)
  return isNaN(d.getTime()) ? null : isoDate(d)
}

function decode(b: Uint8Array) {
  return new TextDecoder('utf-8').decode(b)
}

function folderKey(dir: string, base: string) {
  return dir ? `${dir}/${base}` : base
}

/** Reads the export and works out the page tree, databases and TODO lists, without changing anything. */
export function analyzeExport(bytes: Uint8Array): ImportPlan {
  const files = readExport(bytes)
  const pages = new Map<string, PlanPage>()
  const folderOwner = new Map<string, string>()
  const csvById = new Map<string, string>()

  for (const path of files.keys()) {
    if (!path.toLowerCase().endsWith('.csv') || path.startsWith('attachments/')) continue
    const { id } = splitName(basename(path))
    const key = id ?? path
    // Prefer "<name> <id>_all.csv" (every row) over the filtered view export.
    if (!csvById.has(key) || /_all\.csv$/i.test(path)) csvById.set(key, path)
  }

  for (const [path, data] of files) {
    if (!path.toLowerCase().endsWith('.md') || path.startsWith('attachments/')) continue
    const { base, id } = splitName(basename(path))
    const key = id ?? path
    const text = decode(data)
    const title = text.match(/^\s*#\s+(.+)$/m)?.[1]?.trim() ?? base
    const dateLines = text.split('\n').filter((l) => DATE_LINE.test(l.trim())).length
    pages.set(key, { key, newId: newId(), title, kind: csvById.has(key) ? 'database' : 'page', parentKey: null, mdPath: path, csvPath: csvById.get(key), dateLines })
    folderOwner.set(folderKey(dirname(path), base), key)
  }
  // Databases exported without their own page (linked from a parent page).
  for (const [key, path] of csvById) {
    if (pages.has(key)) continue
    const { base } = splitName(basename(path))
    pages.set(key, { key, newId: newId(), title: base, kind: 'database', parentKey: null, csvPath: path, dateLines: 0 })
    folderOwner.set(folderKey(dirname(path), base), key)
  }
  // Parents come from folders: "A/B 123.md" lives inside the page "A 456.md".
  for (const p of pages.values()) {
    const dir = dirname(p.mdPath ?? p.csvPath ?? '')
    const owner = folderOwner.get(dir)
    if (owner && owner !== p.key) {
      p.parentKey = owner
      if (pages.get(owner)?.kind === 'database' && p.mdPath) p.kind = 'row'
    }
  }

  const attachments = new Set<string>()
  for (const p of pages.values()) {
    if (!p.mdPath) continue
    const text = decode(files.get(p.mdPath)!)
    for (const m of text.matchAll(/\]\(([^)\s]*attachments\/[^)]*?\.[a-z0-9]{2,5})\)/gi)) {
      const path = resolvePath(p.mdPath, m[1])
      if (files.has(path)) attachments.add(path)
    }
  }
  let rows = 0
  for (const p of pages.values()) if (p.kind === 'database' && p.csvPath) rows += Math.max(0, parseCsv(decode(files.get(p.csvPath)!)).length - 1)
  const list = [...pages.values()]
  return {
    files,
    pages,
    attachments: [...attachments],
    attachmentBytes: [...attachments].reduce((n, a) => n + (files.get(a)?.length ?? 0), 0),
    todoCandidates: list.filter((p) => p.kind === 'page' && p.dateLines >= 2).map((p) => ({ key: p.key, title: p.title, days: p.dateLines })),
    counts: { pages: list.filter((p) => p.kind === 'page').length, databases: list.filter((p) => p.kind === 'database').length, rows },
  }
}

// ---------- Databases ----------

function inferSchema(header: string[], rows: string[][]): { schema: DatabaseSchema; value: (col: number, raw: string) => unknown } {
  const props: PropDef[] = []
  const converters: ((raw: string) => unknown)[] = []
  header.forEach((name, col) => {
    const values = rows.map((r) => (r[col] ?? '').trim()).filter(Boolean)
    const distinct = [...new Set(values)]
    const id = col === 0 ? 'title' : shortId()
    const opts = (names: string[]) => names.map((n, i) => ({ id: shortId(), name: n, color: OPTION_COLORS[i % OPTION_COLORS.length] }))
    if (col === 0) {
      props.push({ id, name: name || 'Name', type: 'title' })
      converters.push((raw) => raw)
    } else if (values.length && values.every((v) => /^(yes|no)$/i.test(v))) {
      props.push({ id, name, type: 'checkbox' })
      converters.push((raw) => /^yes$/i.test(raw) || undefined)
    } else if (values.length && values.every((v) => !isNaN(new Date(v.split(' → ')[0].replace(/\s\(GMT[^)]*\)/, '')).getTime()) && /\d{4}/.test(v) && !/^\d+(\.\d+)?$/.test(v))) {
      props.push({ id, name, type: 'date' })
      converters.push((raw) => (raw ? isoDate(new Date(raw.split(' → ')[0].replace(/\s\(GMT[^)]*\)/, ''))) : undefined))
    } else if (values.length && values.every((v) => /^-?[\d,]*\.?\d+$/.test(v))) {
      props.push({ id, name, type: 'number' })
      converters.push((raw) => (raw ? Number(raw.replace(/,/g, '')) : undefined))
    } else if (values.length && values.every((v) => /^https?:\/\//.test(v))) {
      props.push({ id, name, type: 'url' })
      converters.push((raw) => raw || undefined)
    } else if (values.some((v) => v.includes(', ')) && new Set(values.flatMap((v) => v.split(', '))).size <= 30) {
      const options = opts([...new Set(values.flatMap((v) => v.split(', ').map((x) => x.trim())))])
      props.push({ id, name, type: 'multiSelect', options })
      converters.push((raw) => {
        const ids = raw.split(', ').map((x) => options.find((o) => o.name === x.trim())?.id).filter(Boolean)
        return ids.length ? ids : undefined
      })
    } else if (values.length && distinct.length <= Math.max(6, Math.ceil(rows.length / 2)) && distinct.every((v) => v.length <= 40)) {
      const options = opts(distinct)
      props.push({ id, name, type: /status/i.test(name) ? 'status' : 'select', options })
      converters.push((raw) => options.find((o) => o.name === raw.trim())?.id)
    } else {
      props.push({ id, name, type: 'text' })
      converters.push((raw) => raw || undefined)
    }
  })
  return { schema: { props, views: [{ id: shortId(), name: 'Table', type: 'table' }] }, value: (col, raw) => converters[col](raw.trim()) }
}

// ---------- TODO lists ----------

function walkTasks(blocks: JSONContent[], fn: (item: JSONContent, depth: number) => void, depth = 0) {
  for (const b of blocks) {
    if (b.type === 'taskList' || b.type === 'bulletList' || b.type === 'orderedList') {
      for (const item of b.content ?? []) {
        if (item.type === 'taskItem') fn(item, depth)
        walkTasks(item.content ?? [], fn, depth + 1)
      }
    } else if (b.content && b.type !== 'paragraph' && b.type !== 'heading') walkTasks(b.content, fn, depth)
  }
}

function taskText(item: JSONContent) {
  return blockText(item.content?.[0] ?? {}).toLowerCase()
}

/** Drops blank to-dos (Notion keeps an empty "- [ ]" at the end of lists). */
function dropEmptyTasks(blocks: JSONContent[]): JSONContent[] {
  return blocks
    .map((b) => {
      if (b.type !== 'taskList') return b.content && b.type !== 'paragraph' && b.type !== 'heading' ? { ...b, content: dropEmptyTasks(b.content) } : b
      const items = (b.content ?? [])
        .map((item) => ({ ...item, content: [item.content?.[0] ?? { type: 'paragraph' }, ...dropEmptyTasks(item.content?.slice(1) ?? [])] }))
        .filter((item) => blockText(item.content[0]) || item.content.length > 1)
      return items.length ? { ...b, content: items } : null
    })
    .filter(Boolean) as JSONContent[]
}

/** Splits a Notion TODO page at its date lines into Gunita day sections, and infers the daily template. */
export function convertTodo(input: JSONContent[], carry: 'latest' | 'all'): { blocks: JSONContent[]; template: TemplateItem[] } {
  const blocks = dropEmptyTasks(input)
  const preamble: JSONContent[] = []
  const days = new Map<string, JSONContent[]>()
  let current: JSONContent[] | null = null
  for (const b of blocks) {
    const date = b.type === 'paragraph' ? parseDateLine(blockText(b)) : null
    if (date) {
      if (!days.has(date)) days.set(date, [])
      current = days.get(date)!
      continue
    }
    if (current) current.push(b)
    else preamble.push(b)
  }
  const ordered = [...days.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  // Template: top-level tasks you wrote on at least half of the days (and on the latest one).
  const counts = new Map<string, number>()
  for (const [, bs] of ordered) {
    const seen = new Set<string>()
    walkTasks(bs, (item, depth) => {
      if (depth === 0 && taskText(item)) seen.add(taskText(item))
    })
    seen.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1))
  }
  const threshold = Math.max(2, Math.ceil(ordered.length * 0.5))
  const template: TemplateItem[] = []
  const templateIds = new Map<string, string>()
  if (ordered.length) {
    walkTasks(ordered[0][1], (item, depth) => {
      const t = taskText(item)
      if (depth === 0 && t && (counts.get(t) ?? 0) >= threshold && !templateIds.has(t)) {
        const id = newId()
        templateIds.set(t, id)
        template.push({ id, text: blockText(item.content?.[0] ?? {}), repeat: { kind: 'daily' } })
      }
    })
  }
  ordered.forEach(([date, bs], index) => {
    walkTasks(bs, (item, depth) => {
      const attrs: Record<string, unknown> = { ...(item.attrs ?? {}), taskId: newId(), since: date }
      if (depth === 0 && templateIds.has(taskText(item))) attrs.templateId = templateIds.get(taskText(item))
      // Older unfinished tasks stay visible but aren't carried into today.
      if (carry === 'latest' && index > 0 && !attrs.checked) attrs.status = 'archived'
      item.attrs = attrs
    })
  })
  return {
    blocks: [
      ...preamble,
      ...ordered.map(([date, bs]) => ({ type: 'todoDay', attrs: { date }, content: bs.length ? bs : [{ type: 'paragraph' }] })),
    ],
    template,
  }
}

// ---------- Running the import ----------

function plainFallback(blocks: JSONContent[]): JSONContent {
  const lines: string[] = []
  const walk = (n: JSONContent) => {
    if (n.type === 'text') lines.push(n.text ?? '')
    n.content?.forEach(walk)
    if (n.type === 'paragraph' || n.type === 'heading') lines.push('\n')
  }
  blocks.forEach(walk)
  return {
    type: 'doc',
    content: lines
      .join('')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => ({ type: 'paragraph', content: [{ type: 'text', text: l }] })),
  }
}

async function writeSafely(pageId: string, blocks: JSONContent[], warnings: string[], title: string) {
  const doc: JSONContent = { type: 'doc', content: blocks.length ? blocks : [{ type: 'paragraph' }] }
  try {
    validateDoc(doc)
    await writePageDoc(pageId, doc)
  } catch (e) {
    warnings.push(`“${title}” had content Gunita couldn't map exactly (${(e as Error).message.slice(0, 80)}); imported as plain text.`)
    await writePageDoc(pageId, plainFallback(blocks))
  }
}

/** Creates the pages, databases and files from an analyzed export. */
export async function runImport(plan: ImportPlan, opts: ImportOptions, onProgress: (p: Progress) => void): Promise<{ created: number; warnings: string[]; rootId: string | null; todoIds: string[] }> {
  const { ws } = getApp()
  const warnings: string[] = []
  const { files, pages } = plan

  // 1. Files
  const uploaded = new Map<string, string>()
  if (plan.attachments.length) {
    if (!navigator.onLine) warnings.push('You were offline, so images and files were not uploaded.')
    else {
      let done = 0
      const queue = [...plan.attachments]
      const worker = async () => {
        for (let path = queue.shift(); path; path = queue.shift()) {
          const bytes = files.get(path)!
          const name = basename(path)
          const type = IMAGE.test(name) ? `image/${name.split('.').pop()!.toLowerCase().replace('jpg', 'jpeg').replace('svg', 'svg+xml')}` : name.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream'
          try {
            const up = await uploadFile(new File([bytes as BlobPart], name, { type }))
            uploaded.set(path, up.url)
          } catch (e) {
            warnings.push(`Couldn't upload ${name}: ${(e as Error).message}`)
          }
          onProgress({ step: 'Uploading images and files', done: ++done, total: plan.attachments.length })
        }
      }
      await Promise.all([worker(), worker(), worker()])
    }
  }

  // 2. Parse every page's Markdown
  const byPath = new Map<string, PlanPage>()
  const dbByCsv = new Map<string, PlanPage>()
  for (const p of pages.values()) {
    if (p.mdPath) byPath.set(p.mdPath, p)
    if (p.csvPath) dbByCsv.set(p.csvPath, p)
  }
  const parsed = new Map<string, ParsedPage>()
  for (const p of pages.values()) {
    if (!p.mdPath) continue
    const resolve = (href: string): LinkTarget => {
      if (/^(https?:|mailto:)/i.test(href)) return { kind: 'url', href }
      const path = resolvePath(p.mdPath!, href.split('#')[0])
      const page = byPath.get(path)
      if (page) return { kind: 'page', id: page.newId, title: page.title }
      const csvKey = splitName(basename(path)).id
      const db = dbByCsv.get(path) ?? (csvKey ? pages.get(csvKey) : undefined)
      if (db && path.endsWith('.csv')) return { kind: 'database', id: db.newId, title: db.title }
      if (files.has(path)) return { kind: 'file', url: uploaded.get(path) ?? null, name: basename(path), image: IMAGE.test(path) }
      return { kind: 'url', href }
    }
    parsed.set(p.key, parseNotionMarkdown(decode(files.get(p.mdPath)!), { resolve }, { readProps: p.kind === 'row' }))
  }

  // 3. Create pages, parents first, children in the order the parent links them.
  let rootId: string | null = null
  if (opts.container) rootId = ws.createPage({ title: 'Imported from Notion', icon: '📥' })
  const children = new Map<string | null, PlanPage[]>()
  for (const p of pages.values()) {
    if (p.kind === 'row') continue
    const k = p.parentKey && pages.has(p.parentKey) ? p.parentKey : null
    if (!children.has(k)) children.set(k, [])
    children.get(k)!.push(p)
  }
  const sortKids = (parentKey: string | null, list: PlanPage[]) => {
    const order = parentKey ? (parsed.get(parentKey)?.embeds ?? []) : []
    return [...list].sort((a, b) => {
      const ia = order.indexOf(a.newId)
      const ib = order.indexOf(b.newId)
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib)
      return a.title.localeCompare(b.title)
    })
  }
  const total = [...pages.values()].length
  let created = 0
  const todoIds: string[] = []
  const create = async (parentKey: string | null, parentId: string | null) => {
    for (const p of sortKids(parentKey, children.get(parentKey) ?? [])) {
      const isTodo = p.kind === 'page' && opts.todoKeys.includes(p.key)
      const parsedPage = parsed.get(p.key)
      onProgress({ step: `Importing “${p.title}”`, done: created, total })
      if (p.kind === 'database') {
        const csv = p.csvPath ? parseCsv(decode(files.get(p.csvPath)!)) : [['Name']]
        const [header, ...rows] = csv
        const { schema, value } = inferSchema(header, rows)
        ws.createPage({ id: p.newId, kind: 'database', title: p.title, parentId, db: schema })
        // Row pages (with their own content) live in the database's folder.
        const rowPages = [...pages.values()].filter((r) => r.kind === 'row' && r.parentKey === p.key)
        const used = new Set<string>()
        for (const row of rows) {
          const title = row[0] ?? ''
          const md = rowPages.find((r) => !used.has(r.key) && r.title.trim() === title.trim())
          if (md) used.add(md.key)
          const id = md?.newId ?? newId()
          const props: Record<string, unknown> = {}
          header.forEach((_, col) => {
            if (col === 0) return
            const v = value(col, row[col] ?? '')
            if (v !== undefined) props[schema.props[col].id] = v
          })
          ws.createPage({ id, kind: 'row', parentId: p.newId, title, props })
          if (md && parsed.get(md.key)?.blocks.length) await writeSafely(id, parsed.get(md.key)!.blocks, warnings, title)
          created++
        }
      } else {
        let blocks = parsedPage?.blocks ?? []
        let template: TemplateItem[] | undefined
        if (isTodo) {
          const t = convertTodo(blocks, opts.carry)
          blocks = t.blocks
          template = t.template
        }
        ws.createPage({
          id: p.newId,
          kind: isTodo ? 'todo' : 'page',
          title: p.title,
          // TODO lists are daily drivers: keep them at the top of the sidebar.
          parentId: isTodo ? null : parentId,
          ...(isTodo ? { template, autoStart: true } : {}),
        })
        if (isTodo) todoIds.push(p.newId)
        await writeSafely(p.newId, blocks, warnings, p.title)
      }
      created++
      await create(p.key, p.newId)
    }
  }
  await create(null, rootId)
  onProgress({ step: 'Done', done: total, total })
  // Hundreds of pages were made one by one; Ctrl+Z shouldn't unpick them. (Delete
  // the "Imported from Notion" page to remove the import.)
  getApp().wsUndo.clear()
  return { created, warnings, rootId, todoIds }
}
