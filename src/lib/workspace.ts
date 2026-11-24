import * as Y from 'yjs'
import { generateKeyBetween } from 'fractional-indexing'
import { newId } from './ids'
import type {
  DatabaseSchema,
  Entity,
  GraphLink,
  InboxItem,
  MemoryFact,
  PageKind,
  PageMeta,
  Settings,
  TemplateItem,
} from './types'

export const WORKSPACE_DOC = 'workspace'

const PROP_PREFIX = 'p:'

type PageMap = Y.Map<unknown>

export interface Snapshot {
  version: number
  pages: Record<string, PageMeta>
  memory: Record<string, MemoryFact>
  entities: Record<string, Entity>
  links: Record<string, GraphLink>
  inbox: InboxItem[]
  settings: Settings
}

function readPage(id: string, m: PageMap): PageMeta {
  const props: Record<string, unknown> = {}
  const base: Record<string, unknown> = {}
  m.forEach((v, k) => {
    if (k.startsWith(PROP_PREFIX)) props[k.slice(PROP_PREFIX.length)] = v
    else base[k] = v
  })
  return {
    id,
    kind: (base.kind as PageKind) ?? 'page',
    title: (base.title as string) ?? '',
    icon: base.icon as string | undefined,
    cover: base.cover as PageMeta['cover'],
    parentId: (base.parentId as string | null) ?? null,
    order: (base.order as string) ?? 'a0',
    createdAt: (base.createdAt as number) ?? 0,
    updatedAt: (base.updatedAt as number) ?? 0,
    favorite: base.favorite as boolean | undefined,
    hiddenFromAI: base.hiddenFromAI as boolean | undefined,
    trashedAt: (base.trashedAt as number | null) ?? null,
    shareSlug: (base.shareSlug as string | null) ?? null,
    fullWidth: base.fullWidth as boolean | undefined,
    db: base.db as DatabaseSchema | undefined,
    template: base.template as TemplateItem[] | undefined,
    autoStart: base.autoStart as boolean | undefined,
    meeting: base.meeting as PageMeta['meeting'],
    report: base.report as PageMeta['report'],
    reportFor: base.reportFor as PageMeta['reportFor'],
    props,
  }
}

function mapToRecord<T>(m: Y.Map<T>): Record<string, T> {
  const out: Record<string, T> = {}
  m.forEach((v, k) => (out[k] = v))
  return out
}

/**
 * The workspace doc holds everything except page bodies: the page tree,
 * database schemas and rows' properties, TODO templates, AI memory and the graph.
 * React reads it through an immutable snapshot that is rebuilt incrementally.
 */
export class Workspace {
  readonly pages: Y.Map<PageMap>
  readonly memory: Y.Map<MemoryFact>
  readonly entities: Y.Map<Entity>
  readonly links: Y.Map<GraphLink>
  readonly inbox: Y.Array<InboxItem>
  readonly settings: Y.Map<unknown>
  private snap: Snapshot
  private listeners = new Set<() => void>()

  constructor(readonly doc: Y.Doc) {
    this.pages = doc.getMap('pages')
    this.memory = doc.getMap('memory')
    this.entities = doc.getMap('entities')
    this.links = doc.getMap('links')
    this.inbox = doc.getArray('inbox')
    this.settings = doc.getMap('settings')
    this.snap = this.fullSnapshot(0)

    this.pages.observeDeep((events) => {
      const changed = new Set<string>()
      for (const e of events) {
        if (e.target === this.pages) (e as Y.YMapEvent<unknown>).keysChanged.forEach((k) => changed.add(k))
        else if (e.path.length) changed.add(String(e.path[0]))
      }
      const pages = { ...this.snap.pages }
      for (const id of changed) {
        const m = this.pages.get(id)
        if (m) pages[id] = readPage(id, m)
        else delete pages[id]
      }
      this.emit({ pages })
    })
    this.memory.observe(() => this.emit({ memory: mapToRecord(this.memory) }))
    this.entities.observe(() => this.emit({ entities: mapToRecord(this.entities) }))
    this.links.observe(() => this.emit({ links: mapToRecord(this.links) }))
    this.inbox.observe(() => this.emit({ inbox: this.inbox.toArray() }))
    this.settings.observe(() => this.emit({ settings: this.settings.toJSON() as Settings }))
  }

  private fullSnapshot(version: number): Snapshot {
    const pages: Record<string, PageMeta> = {}
    this.pages.forEach((m, id) => (pages[id] = readPage(id, m)))
    return {
      version,
      pages,
      memory: mapToRecord(this.memory),
      entities: mapToRecord(this.entities),
      links: mapToRecord(this.links),
      inbox: this.inbox.toArray(),
      settings: this.settings.toJSON() as Settings,
    }
  }

  /** Call after the doc finished loading from IndexedDB or a big sync. */
  refresh() {
    this.snap = this.fullSnapshot(this.snap.version + 1)
    this.listeners.forEach((l) => l())
  }

  private emit(patch: Partial<Snapshot>) {
    this.snap = { ...this.snap, ...patch, version: this.snap.version + 1 }
    this.listeners.forEach((l) => l())
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l)
    return () => {
      this.listeners.delete(l)
    }
  }

  getSnapshot = () => this.snap

  // ---------- Queries ----------

  page(id: string | null | undefined): PageMeta | undefined {
    return id ? this.snap.pages[id] : undefined
  }

  children(parentId: string | null, opts: { includeRows?: boolean; includeTrashed?: boolean } = {}): PageMeta[] {
    return Object.values(this.snap.pages)
      .filter(
        (p) =>
          p.parentId === parentId &&
          (opts.includeTrashed || !p.trashedAt) &&
          (opts.includeRows || p.kind !== 'row'),
      )
      .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : a.id < b.id ? -1 : 1))
  }

  ancestors(id: string): PageMeta[] {
    const out: PageMeta[] = []
    let p = this.page(id)
    const seen = new Set<string>()
    while (p?.parentId && !seen.has(p.parentId)) {
      seen.add(p.parentId)
      const parent = this.page(p.parentId)
      if (!parent) break
      out.unshift(parent)
      p = parent
    }
    return out
  }

  /** True if the page or any ancestor is in the trash. */
  isTrashed(id: string): boolean {
    const p = this.page(id)
    if (!p) return true
    if (p.trashedAt) return true
    return this.ancestors(id).some((a) => a.trashedAt)
  }

  descendants(id: string): string[] {
    const out: string[] = []
    const walk = (pid: string) => {
      for (const p of Object.values(this.snap.pages)) {
        if (p.parentId === pid) {
          out.push(p.id)
          walk(p.id)
        }
      }
    }
    walk(id)
    return out
  }

  /** Is AI allowed to read this page? Hidden pages hide their sub-pages too. */
  aiVisible(id: string): boolean {
    const p = this.page(id)
    if (!p || this.isTrashed(id)) return false
    if (p.hiddenFromAI) return false
    return !this.ancestors(id).some((a) => a.hiddenFromAI)
  }

  // ---------- Mutations ----------

  createPage(
    init: Partial<Omit<PageMeta, 'id' | 'props'>> & {
      kind?: PageKind
      props?: Record<string, unknown>
      after?: string | null
      id?: string
    } = {},
  ): string {
    const id = init.id ?? newId()
    const parentId = init.parentId ?? null
    const siblings = this.children(parentId, { includeRows: true, includeTrashed: true })
    let order: string
    if (init.after !== undefined && init.after !== null) {
      const idx = siblings.findIndex((s) => s.id === init.after)
      const a = siblings[idx]?.order ?? null
      const b = siblings[idx + 1]?.order ?? null
      order = generateKeyBetween(a, b)
    } else {
      order = generateKeyBetween(siblings.at(-1)?.order ?? null, null)
    }
    const now = Date.now()
    this.doc.transact(() => {
      const m = new Y.Map<unknown>()
      const fields: Record<string, unknown> = {
        kind: init.kind ?? 'page',
        title: init.title ?? '',
        parentId,
        order,
        createdAt: now,
        updatedAt: now,
      }
      for (const k of ['icon', 'cover', 'db', 'template', 'autoStart', 'meeting', 'fullWidth', 'hiddenFromAI', 'report', 'reportFor'] as const) {
        if (init[k] !== undefined) fields[k] = init[k]
      }
      for (const [k, v] of Object.entries(fields)) m.set(k, v)
      for (const [k, v] of Object.entries(init.props ?? {})) m.set(PROP_PREFIX + k, v)
      this.pages.set(id, m)
    })
    return id
  }

  updatePage(id: string, patch: Partial<Omit<PageMeta, 'id' | 'props'>>) {
    const m = this.pages.get(id)
    if (!m) return
    this.doc.transact(() => {
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) m.delete(k)
        else m.set(k, v)
      }
      m.set('updatedAt', Date.now())
    })
  }

  touch(id: string) {
    const m = this.pages.get(id)
    if (m) m.set('updatedAt', Date.now())
  }

  setProp(pageId: string, propId: string, value: unknown) {
    const m = this.pages.get(pageId)
    if (!m) return
    this.doc.transact(() => {
      if (value === undefined || value === null || value === '') m.delete(PROP_PREFIX + propId)
      else m.set(PROP_PREFIX + propId, value)
      m.set('updatedAt', Date.now())
    })
  }

  /** Moves a page under `parentId`, placed before `beforeId` (or at the end). */
  movePage(id: string, parentId: string | null, beforeId?: string | null) {
    if (id === parentId) return
    if (parentId && (parentId === id || this.descendants(id).includes(parentId))) return
    const siblings = this.children(parentId, { includeRows: true, includeTrashed: true }).filter((s) => s.id !== id)
    let a: string | null = null
    let b: string | null = null
    if (beforeId) {
      const idx = siblings.findIndex((s) => s.id === beforeId)
      b = siblings[idx]?.order ?? null
      a = idx > 0 ? siblings[idx - 1].order : null
    } else {
      a = siblings.at(-1)?.order ?? null
    }
    this.updatePage(id, { parentId, order: generateKeyBetween(a, b) })
  }

  trashPage(id: string) {
    this.updatePage(id, { trashedAt: Date.now(), favorite: undefined })
  }

  restorePage(id: string) {
    const p = this.page(id)
    if (!p) return
    // Restore to the top level if the parent is gone or still trashed.
    const parentOk = p.parentId && this.page(p.parentId) && !this.isTrashed(p.parentId)
    this.updatePage(id, { trashedAt: null, ...(parentOk ? {} : { parentId: null }) })
  }

  /** Removes the page and all sub-pages from the workspace. Returns removed ids. */
  deleteForever(id: string): string[] {
    const ids = [id, ...this.descendants(id)]
    this.doc.transact(() => ids.forEach((i) => this.pages.delete(i)))
    return ids
  }

  setSettings(patch: Partial<Settings>) {
    this.doc.transact(() => {
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) this.settings.delete(k)
        else this.settings.set(k, v)
      }
    })
  }

  // ---------- Inbox (tasks waiting for the next Start Today) ----------

  addInbox(items: Omit<InboxItem, 'id' | 'createdAt'>[]) {
    this.inbox.push(items.map((i) => ({ ...i, id: newId(), createdAt: Date.now() })))
  }

  takeInbox(listId: string, isFirstList: boolean): InboxItem[] {
    const all = this.inbox.toArray()
    const mine = all.filter((i) => i.listId === listId || (!i.listId && isFirstList))
    if (!mine.length) return []
    this.doc.transact(() => {
      for (let i = this.inbox.length - 1; i >= 0; i--) {
        if (mine.some((m) => m.id === this.inbox.get(i).id)) this.inbox.delete(i, 1)
      }
    })
    return mine
  }
}
