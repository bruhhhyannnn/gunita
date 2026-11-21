import { getApp } from '#/lib/app'
import { newId } from '#/lib/ids'
import { isoDate } from '#/lib/dates'
import type { Entity, EntityType, GraphLink, MemoryFact } from '#/lib/types'
import type { ReflectBody } from '#/routes/api/ai/reflect'
import { postJson } from './client'

interface Reflection {
  entities: { name: string; type: EntityType; summary: string; pageIds: string[] }[]
  links: { source: string; target: string; label: string }[]
  facts: { text: string; sourceIds: string[] }[]
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * Asks the AI to read recently changed notes and update the brain: entities,
 * links between them and facts it should remember. Only pages it may read are sent.
 */
export async function reflect(opts: { full?: boolean } = {}): Promise<{ entities: number; links: number; facts: number }> {
  const { ws, index } = getApp()
  const snap = ws.getSnapshot()
  const since = opts.full ? 0 : (snap.settings.lastReflectAt ?? 0)
  const visible = Object.values(snap.pages).filter((p) => ws.aiVisible(p.id) && p.kind !== 'database')
  const changed = visible.filter((p) => p.updatedAt > since).sort((a, b) => b.updatedAt - a.updatedAt)
  if (!changed.length) return { entities: 0, links: 0, facts: 0 }

  let budget = 120_000
  const pages: ReflectBody['pages'] = []
  for (const p of changed) {
    const entry = index.get(p.id)
    const text = (entry?.text ?? '').slice(0, 3000)
    const openTasks = entry?.tasks.filter((t) => !t.checked && !t.status && t.text).slice(0, 15).map((t) => (t.carry ? `${t.text} (carried ${t.carry}×)` : t.text))
    const size = text.length + p.title.length + 200
    if (size > budget) break
    budget -= size
    pages.push({ id: p.id, title: p.title || 'Untitled', kind: p.kind, created: isoDate(new Date(p.createdAt)), text, openTasks })
  }

  const r = await postJson<Reflection>('/api/ai/reflect', {
    today: isoDate(),
    pages,
    entities: Object.values(snap.entities).map((e) => ({ name: e.name, type: e.type })),
    facts: Object.values(snap.memory).map((m) => m.text),
  } satisfies ReflectBody)

  const validPage = (id: string) => !!snap.pages[id]
  const byName = new Map(Object.values(ws.getSnapshot().entities).map((e) => [norm(e.name), e]))
  let added = { entities: 0, links: 0, facts: 0 }
  ws.doc.transact(() => {
    for (const e of r.entities) {
      const key = norm(e.name)
      if (!key) continue
      const existing = byName.get(key)
      const pageIds = e.pageIds.filter(validPage)
      if (existing) {
        const next: Entity = { ...existing, summary: e.summary || existing.summary, pageIds: [...new Set([...existing.pageIds, ...pageIds])] }
        ws.entities.set(existing.id, next)
        byName.set(key, next)
      } else {
        const ent: Entity = { id: 'e_' + newId(), name: e.name.trim(), type: e.type, summary: e.summary, pageIds, createdAt: Date.now(), firstSeen: isoDate() }
        ws.entities.set(ent.id, ent)
        byName.set(key, ent)
        added.entities++
      }
    }
    const resolve = (ref: string) => (validPage(ref) ? ref : byName.get(norm(ref))?.id)
    const existingLinks = Object.values(ws.getSnapshot().links)
    for (const l of r.links) {
      const s = resolve(l.source)
      const t = resolve(l.target)
      if (!s || !t || s === t) continue
      if (existingLinks.some((x) => (x.source === s && x.target === t) || (x.source === t && x.target === s))) continue
      const link: GraphLink = { id: 'l_' + newId(), source: s, target: t, label: l.label, origin: 'ai', confirmed: false, createdAt: Date.now() }
      ws.links.set(link.id, link)
      existingLinks.push(link)
      added.links++
    }
    const known = new Set(Object.values(ws.getSnapshot().memory).map((m) => norm(m.text)))
    for (const f of r.facts) {
      if (!f.text.trim() || known.has(norm(f.text))) continue
      const fact: MemoryFact = { id: 'm_' + newId(), text: f.text.trim(), sourceIds: f.sourceIds.filter(validPage), createdAt: Date.now(), updatedAt: Date.now(), origin: 'ai' }
      ws.memory.set(fact.id, fact)
      added.facts++
    }
    ws.settings.set('lastReflectAt', Date.now())
  })
  return added
}

let running = false

/** Runs a reflection at most about once a day, in the background. */
export function maybeReflectDaily() {
  const { ws, config } = getApp()
  if (running || !config?.claudeConfigured || !navigator.onLine) return
  const last = ws.getSnapshot().settings.lastReflectAt ?? 0
  if (Date.now() - last < 20 * 3600_000) return
  running = true
  void reflect()
    .catch(() => {})
    .finally(() => (running = false))
}
