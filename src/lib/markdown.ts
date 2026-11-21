import * as Y from 'yjs'
import { zipSync, strToU8 } from 'fflate'
import { getApp } from './app'
import type { PageMeta, PropDef } from './types'

type Delta = { insert: unknown; attributes?: Record<string, Record<string, unknown> | boolean> }

function inline(el: Y.XmlElement | Y.XmlFragment, titleOf: (id: string) => string): string {
  let s = ''
  for (const c of el.toArray()) {
    if (c instanceof Y.XmlText) {
      for (const d of c.toDelta() as Delta[]) {
        if (typeof d.insert !== 'string') continue
        let t = d.insert
        const a = d.attributes ?? {}
        if (a.code) t = '`' + t + '`'
        else {
          if (a.bold) t = `**${t}**`
          if (a.italic) t = `*${t}*`
          if (a.strike) t = `~~${t}~~`
          if (a.highlight) t = `==${t}==`
        }
        if (a.link && typeof a.link === 'object') t = `[${t}](${(a.link as { href?: string }).href ?? ''})`
        s += t
      }
    } else if (c instanceof Y.XmlElement) {
      if (c.nodeName === 'pageLink') s += `[[${titleOf(c.getAttribute('id') as string) || c.getAttribute('label') || 'page'}]]`
      else if (c.nodeName === 'dateChip') s += `@${c.getAttribute('date')}`
      else if (c.nodeName === 'hardBreak') s += '  \n'
      else s += inline(c, titleOf)
    }
  }
  return s
}

/** Converts a page body (Yjs XML from Tiptap) to Markdown. */
export function docToMarkdown(doc: Y.Doc, titleOf: (id: string) => string = () => ''): string {
  const out: string[] = []
  const block = (el: Y.XmlElement, indent: string, listPrefix?: string): string[] => {
    const name = el.nodeName
    const kids = el.toArray().filter((x): x is Y.XmlElement => x instanceof Y.XmlElement)
    switch (name) {
      case 'paragraph':
        return [indent + (listPrefix ?? '') + inline(el, titleOf)]
      case 'heading':
        return [indent + '#'.repeat(Number(el.getAttribute('level') || 1)) + ' ' + inline(el, titleOf)]
      case 'blockquote':
        return kids.flatMap((k) => block(k, indent)).map((l) => '> ' + l)
      case 'callout':
        return kids.flatMap((k) => block(k, indent)).map((l, i) => '> ' + (i === 0 ? `${el.getAttribute('icon') || '💡'} ` : '') + l)
      case 'codeBlock':
        return [indent + '```' + (el.getAttribute('language') || ''), ...inline(el, titleOf).split('\n').map((l) => indent + l), indent + '```']
      case 'horizontalRule':
        return [indent + '---']
      case 'image':
        return [indent + `![${el.getAttribute('alt') || ''}](${el.getAttribute('src')})`]
      case 'pageEmbed':
      case 'databaseEmbed':
        return [indent + `[[${titleOf(el.getAttribute('id') as string) || 'Untitled'}]]`]
      case 'bulletList':
      case 'orderedList':
      case 'taskList': {
        const lines: string[] = []
        kids.forEach((item, i) => {
          let prefix = name === 'orderedList' ? `${i + 1}. ` : '- '
          if (item.nodeName === 'taskItem') {
            const raw = item.getAttribute('checked') as unknown
            const checked = raw === true || raw === 'true'
            prefix = checked ? '- [x] ' : '- [ ] '
          }
          const parts = item.toArray().filter((x): x is Y.XmlElement => x instanceof Y.XmlElement)
          parts.forEach((p, j) => {
            if (j === 0 && p.nodeName === 'paragraph') {
              let line = inline(p, titleOf)
              const status = item.getAttribute('status') as string | undefined
              if (status === 'moved') line = `~~${line}~~ (→ moved to ${item.getAttribute('movedTo')})`
              else if (status === 'dropped') line = `~~${line}~~ (dropped)`
              else if (status === 'snoozed') line += ` (snoozed until ${item.getAttribute('snoozeUntil')})`
              lines.push(indent + prefix + line)
            } else lines.push(...block(p, indent + '  '))
          })
        })
        return lines
      }
      case 'details': {
        const summary = kids.find((k) => k.nodeName === 'detailsSummary')
        const content = kids.find((k) => k.nodeName === 'detailsContent')
        return [
          indent + `<details><summary>${summary ? inline(summary, titleOf) : ''}</summary>`,
          '',
          ...(content ? content.toArray().filter((x): x is Y.XmlElement => x instanceof Y.XmlElement).flatMap((k) => [...block(k, indent), '']) : []),
          indent + '</details>',
        ]
      }
      case 'table': {
        const rows = kids.map((r) =>
          r
            .toArray()
            .filter((x): x is Y.XmlElement => x instanceof Y.XmlElement)
            .map((cell) => inline(cell.toArray()[0] instanceof Y.XmlElement ? (cell.toArray()[0] as Y.XmlElement) : cell, titleOf).replace(/\|/g, '\\|')),
        )
        if (!rows.length) return []
        const head = rows[0]
        return [
          '| ' + head.join(' | ') + ' |',
          '| ' + head.map(() => '---').join(' | ') + ' |',
          ...rows.slice(1).map((r) => '| ' + r.join(' | ') + ' |'),
        ]
      }
      case 'todoDay': {
        const lines = ['## ' + (el.getAttribute('date') as string)]
        for (const k of kids) lines.push(...block(k, indent), '')
        return lines
      }
      default:
        return kids.flatMap((k) => block(k, indent))
    }
  }
  for (const c of doc.getXmlFragment('default').toArray()) {
    if (c instanceof Y.XmlElement) {
      out.push(...block(c, ''))
      out.push('')
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

function propText(p: PropDef, v: unknown): string {
  if (v == null) return ''
  if (p.type === 'select' || p.type === 'status') return p.options?.find((o) => o.id === v)?.name ?? ''
  if (p.type === 'multiSelect') return ((v as string[]) ?? []).map((id) => p.options?.find((o) => o.id === id)?.name ?? '').filter(Boolean).join(', ')
  if (p.type === 'checkbox') return v ? 'Yes' : 'No'
  return String(v)
}

function csvCell(s: string) {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function databaseCsv(db: PageMeta, rows: PageMeta[]): string {
  const props = db.db?.props ?? []
  const lines = [props.map((p) => csvCell(p.name)).join(',')]
  for (const r of rows) lines.push(props.map((p) => csvCell(p.type === 'title' ? r.title : propText(p, r.props[p.id]))).join(','))
  return lines.join('\n') + '\n'
}

function safeName(s: string) {
  return (s || 'Untitled').replace(/[\\/:*?"<>|]/g, '-').slice(0, 80)
}

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export async function pageMarkdown(id: string): Promise<string> {
  const { ws, docs } = getApp()
  const page = ws.page(id)
  const titleOf = (pid: string) => ws.page(pid)?.title ?? ''
  const body = await docs.withDoc(id, (d) => docToMarkdown(d, titleOf))
  return `# ${page?.title || 'Untitled'}\n\n${body}`
}

export async function exportPageMarkdown(id: string) {
  const page = getApp().ws.page(id)
  download(`${safeName(page?.title ?? '')}.md`, await pageMarkdown(id), 'text/markdown')
}

/** Exports every page as Markdown (databases as CSV) in a zip, mirroring the page tree. */
export async function exportAll() {
  const { ws } = getApp()
  const files: Record<string, Uint8Array> = {}
  const used = new Set<string>()
  const walk = async (parentId: string | null, dir: string) => {
    for (const p of ws.children(parentId, { includeRows: true })) {
      let name = safeName(p.title)
      let n = 2
      while (used.has(dir + name)) name = `${safeName(p.title)} ${n++}`
      used.add(dir + name)
      if (p.kind === 'database') {
        const rows = ws.children(p.id, { includeRows: true }).filter((r) => r.kind === 'row')
        files[`${dir}${name}.csv`] = strToU8(databaseCsv(p, rows))
      }
      files[`${dir}${name}.md`] = strToU8(await pageMarkdown(p.id))
      if (ws.children(p.id, { includeRows: true }).length) await walk(p.id, `${dir}${name}/`)
    }
  }
  await walk(null, 'Gunita/')
  download(`gunita-export-${new Date().toISOString().slice(0, 10)}.zip`, zipSync(files) as BlobPart, 'application/zip')
}
