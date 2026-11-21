import type { Snapshot } from './workspace'
import type { PageIndexEntry } from './pageIndex'
import { isoDate } from './dates'

export interface GNode {
  id: string
  name: string
  group: 'page' | 'entity'
  type: string
  date: string
  degree: number
  pageId?: string
  summary?: string
}

export interface GLink {
  id: string
  source: string
  target: string
  kind: 'tree' | 'mention' | 'member' | 'relation'
  confirmed: boolean
  label?: string
  linkId?: string
}

export const NODE_COLORS: Record<string, string> = {
  page: '#c9cdd4',
  todo: '#f2b84b',
  meeting: '#38c6b4',
  database: '#5b9cf5',
  row: '#8a94a6',
  project: '#ff8a4c',
  person: '#ff6fa8',
  topic: '#a98bff',
  course: '#5fd38d',
  org: '#3fc3e6',
}

export const TYPE_LABELS: Record<string, string> = {
  page: 'Page',
  todo: 'TODO list',
  meeting: 'Meeting',
  database: 'Database',
  row: 'Database row',
  project: 'Project',
  person: 'Person',
  topic: 'Topic',
  course: 'Course',
  org: 'Organization',
}

/** Builds the brain graph: pages, AI-found entities, and the links between them. */
export function buildGraph(snap: Snapshot, index: (id: string) => PageIndexEntry | undefined): { nodes: GNode[]; links: GLink[] } {
  const nodes = new Map<string, GNode>()
  const links: GLink[] = []
  const trashed = (id: string): boolean => {
    let p = snap.pages[id]
    const seen = new Set<string>()
    while (p) {
      if (p.trashedAt) return true
      if (!p.parentId || seen.has(p.parentId)) return false
      seen.add(p.parentId)
      p = snap.pages[p.parentId]
    }
    return true
  }
  for (const p of Object.values(snap.pages)) {
    if (trashed(p.id)) continue
    nodes.set(p.id, { id: p.id, name: p.title || 'Untitled', group: 'page', type: p.kind, date: isoDate(new Date(p.createdAt || Date.now())), degree: 0, pageId: p.id })
  }
  for (const e of Object.values(snap.entities)) {
    nodes.set(e.id, { id: e.id, name: e.name, group: 'entity', type: e.type, date: e.firstSeen, degree: 0, summary: e.summary })
  }
  const seen = new Set<string>()
  const add = (l: GLink) => {
    if (!nodes.has(l.source) || !nodes.has(l.target) || l.source === l.target) return
    const key = [l.source, l.target].sort().join('|')
    if (seen.has(key)) return
    seen.add(key)
    links.push(l)
    nodes.get(l.source)!.degree++
    nodes.get(l.target)!.degree++
  }
  // Links you made: [[page links]] and embedded sub-pages
  for (const p of Object.values(snap.pages)) {
    for (const t of index(p.id)?.links ?? []) add({ id: `m:${p.id}:${t}`, source: p.id, target: t, kind: 'mention', confirmed: true })
  }
  // Relations the AI found (confirmable) or you confirmed
  for (const l of Object.values(snap.links)) add({ id: l.id, linkId: l.id, source: l.source, target: l.target, kind: 'relation', confirmed: l.confirmed || l.origin === 'user', label: l.label })
  // Pages each entity appears in
  for (const e of Object.values(snap.entities)) for (const pid of e.pageIds) add({ id: `e:${e.id}:${pid}`, source: e.id, target: pid, kind: 'member', confirmed: false })
  // Page tree (weakest)
  for (const p of Object.values(snap.pages)) if (p.parentId) add({ id: `t:${p.id}`, source: p.parentId, target: p.id, kind: 'tree', confirmed: true })
  return { nodes: [...nodes.values()], links }
}
