import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'

export const SYNC_ORIGIN = Symbol('sync')

interface Entry {
  doc: Y.Doc
  idb: IndexeddbPersistence
  ready: Promise<void>
  refs: number
  lastUsed: number
}

type UpdateListener = (docId: string, origin: unknown) => void

/**
 * Keeps Yjs docs in memory and persisted in IndexedDB. Every page body is a doc,
 * and so is the workspace (page tree, databases, memory, graph).
 */
export class DocManager {
  private entries = new Map<string, Entry>()
  private listeners = new Set<UpdateListener>()
  private readonly keepWarm = 24

  constructor(readonly userId: string) {}

  private dbName(docId: string) {
    return `gunita-${this.userId}-${docId}`
  }

  private load(docId: string): Entry {
    let e = this.entries.get(docId)
    if (e) {
      e.lastUsed = Date.now()
      return e
    }
    const doc = new Y.Doc({ guid: docId })
    const idb = new IndexeddbPersistence(this.dbName(docId), doc)
    const ready = idb.whenSynced.then(() => undefined)
    doc.on('update', (_u: Uint8Array, origin: unknown) => {
      // y-indexeddb applies stored updates with itself as origin; those are not new edits.
      if (origin === idb) return
      for (const l of this.listeners) l(docId, origin)
    })
    e = { doc, idb, ready, refs: 0, lastUsed: Date.now() }
    this.entries.set(docId, e)
    return e
  }

  /** Opens a doc and keeps it in memory until `release`. */
  open(docId: string): { doc: Y.Doc; ready: Promise<void> } {
    const e = this.load(docId)
    e.refs++
    return { doc: e.doc, ready: e.ready }
  }

  release(docId: string) {
    const e = this.entries.get(docId)
    if (!e) return
    e.refs = Math.max(0, e.refs - 1)
    e.lastUsed = Date.now()
    this.evict()
  }

  /** Runs `fn` with a loaded doc, without keeping it open afterwards. */
  async withDoc<T>(docId: string, fn: (doc: Y.Doc) => T | Promise<T>): Promise<T> {
    const { doc, ready } = this.open(docId)
    try {
      await ready
      return await fn(doc)
    } finally {
      this.release(docId)
    }
  }

  isOpen(docId: string) {
    return (this.entries.get(docId)?.refs ?? 0) > 0
  }

  onUpdate(l: UpdateListener) {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }

  private evict() {
    const idle = [...this.entries.entries()].filter(([, e]) => e.refs === 0).sort((a, b) => a[1].lastUsed - b[1].lastUsed)
    while (idle.length > this.keepWarm) {
      const [id, e] = idle.shift()!
      this.entries.delete(id)
      void e.idb.destroy()
      e.doc.destroy()
    }
  }

  /** Deletes a doc's local copy (used when a page is deleted forever). */
  async purge(docId: string) {
    const e = this.entries.get(docId)
    if (e) {
      this.entries.delete(docId)
      await e.idb.clearData()
      e.doc.destroy()
    } else {
      const idb = new IndexeddbPersistence(this.dbName(docId), new Y.Doc())
      await idb.whenSynced
      await idb.clearData()
    }
  }
}
