import { createFileRoute } from '@tanstack/react-router'
import * as Y from 'yjs'
import { env } from '#/server/env'
import { loadMergedDoc } from '#/server/sync'
import { renderDoc, sharePage } from '#/server/render'

interface Meta {
  title: string
  kind: string
  icon?: string
  cover?: { kind: string; value: string; y?: number }
  parentId: string | null
  trashedAt?: number | null
  props: Record<string, unknown>
  db?: { props: { id: string; name: string; type: string; options?: { id: string; name: string }[] }[] }
}

function notFound() {
  return new Response(sharePage({ title: 'Page not found', body: '<p>This link is no longer shared.</p>', appName: env.APP_NAME || 'Gunita' }), {
    status: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

function readPages(ws: Y.Doc): Map<string, Meta> {
  const out = new Map<string, Meta>()
  ws.getMap<Y.Map<unknown>>('pages').forEach((m, id) => {
    const props: Record<string, unknown> = {}
    m.forEach((v, k) => {
      if (k.startsWith('p:')) props[k.slice(2)] = v
    })
    out.set(id, {
      title: (m.get('title') as string) || 'Untitled',
      kind: (m.get('kind') as string) || 'page',
      icon: m.get('icon') as string | undefined,
      cover: m.get('cover') as Meta['cover'],
      parentId: (m.get('parentId') as string | null) ?? null,
      trashedAt: m.get('trashedAt') as number | null,
      props,
      db: m.get('db') as Meta['db'],
    })
  })
  return out
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

// Read-only public pages. Renders the latest synced version on the server.
export const Route = createFileRoute('/s/$')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const [slug, childId] = (params._splat ?? '').split('/')
        if (!slug) return notFound()
        const share = await env.DB.prepare('SELECT user_id, page_id FROM shares WHERE slug = ?').bind(slug).first<{ user_id: string; page_id: string }>()
        if (!share) return notFound()
        const wsBytes = await loadMergedDoc(share.user_id, 'workspace')
        if (!wsBytes) return notFound()
        const ws = new Y.Doc()
        Y.applyUpdate(ws, wsBytes)
        const pages = readPages(ws)
        const target = childId || share.page_id
        // The target must be the shared page or one of its sub-pages, and not in the trash.
        const inTree = (id: string) => {
          let cur: string | null = id
          const seen = new Set<string>()
          while (cur && !seen.has(cur)) {
            seen.add(cur)
            const p = pages.get(cur)
            if (!p || p.trashedAt) return false
            if (cur === share.page_id) return true
            cur = p.parentId
          }
          return false
        }
        const meta = pages.get(target)
        if (!meta || !inTree(target)) return notFound()
        const linkFor = (id: string) => (inTree(id) ? { href: id === share.page_id ? `/s/${slug}` : `/s/${slug}/${id}`, title: pages.get(id)!.title } : null)

        let body = ''
        const docBytes = await loadMergedDoc(share.user_id, target)
        if (docBytes) {
          const doc = new Y.Doc()
          Y.applyUpdate(doc, docBytes)
          body = renderDoc(doc, { linkFor })
        }
        if (meta.kind === 'database' && meta.db) {
          const rows = [...pages.entries()].filter(([, p]) => p.parentId === target && p.kind === 'row' && !p.trashedAt)
          const props = meta.db.props
          const cell = (p: (typeof props)[number], v: unknown) => {
            if (v == null) return ''
            if (p.options) {
              const ids = Array.isArray(v) ? v : [v]
              return ids.map((id) => p.options!.find((o) => o.id === id)?.name ?? '').join(', ')
            }
            return String(v)
          }
          body += `<table><tr>${props.map((p) => `<th>${esc(p.name)}</th>`).join('')}</tr>${rows
            .map(([id, r]) => `<tr>${props.map((p) => `<td>${p.type === 'title' ? `<a href="/s/${slug}/${id}">${esc(r.title)}</a>` : esc(cell(p, r.props[p.id]))}</td>`).join('')}</tr>`)
            .join('')}</table>`
        }
        const children = [...pages.entries()].filter(([, p]) => p.parentId === target && p.kind !== 'row' && !p.trashedAt)
        if (children.length && !body.includes('class="subpage"')) {
          body += `<hr>${children.map(([id, p]) => `<p><a class="subpage" href="/s/${slug}/${id}">${esc(p.icon ?? '📄')} ${esc(p.title)}</a></p>`).join('')}`
        }
        if (childId) body = `<p><a href="/s/${slug}">← ${esc(pages.get(share.page_id)!.title)}</a></p>` + body
        return new Response(sharePage({ title: meta.title, icon: meta.icon, cover: meta.cover, body, appName: env.APP_NAME || 'Gunita' }), {
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60' },
        })
      },
    },
  },
})
