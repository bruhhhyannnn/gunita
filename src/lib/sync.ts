import * as Y from 'yjs'
import { createStore, get, set, del } from 'idb-keyval'
import { SYNC_ORIGIN, type DocManager } from './docs'
import { fromB64, toB64 } from './b64'

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'signed-out' | 'error'

interface SyncState {
  status: SyncStatus
  lastSyncedAt: number | null
  pending: number
  error?: string
}

const BATCH = 20

/**
 * Pushes local Yjs changes to /api/sync and pulls changes made on other devices.
 * Works offline: edits are stored in IndexedDB and the list of unsynced docs is
 * persisted, so nothing is lost between reloads.
 */
export class SyncEngine {
  private kv: ReturnType<typeof createStore>
  private dirty = new Set<string>()
  private pull = new Set<string>()
  private edits = new Map<string, number>()
  private running = false
  private again = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private interval: ReturnType<typeof setInterval> | null = null
  private state: SyncState = { status: 'idle', lastSyncedAt: null, pending: 0 }
  private listeners = new Set<() => void>()
  private loaded: Promise<void>
  private signedOut = false
  /** Called with doc ids that received remote changes. */
  onRemoteChange: ((docIds: string[]) => void) | null = null

  constructor(
    private docs: DocManager,
    userId: string,
  ) {
    const kv = createStore(`gunita-${userId}-sync`, 'kv')
    this.kv = kv
    this.loaded = (async () => {
      const [dirty, pull] = await Promise.all([get<string[]>('dirty', kv), get<string[]>('pull', kv)])
      dirty?.forEach((d) => this.dirty.add(d))
      pull?.forEach((d) => this.pull.add(d))
    })()

    docs.onUpdate((docId, origin) => {
      if (origin === SYNC_ORIGIN) return
      this.dirty.add(docId)
      this.edits.set(docId, (this.edits.get(docId) ?? 0) + 1)
      void this.persistSets()
      this.schedule(1500)
    })
  }

  start() {
    const kick = () => this.schedule(0)
    window.addEventListener('online', kick)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') kick()
    })
    this.interval = setInterval(() => {
      if (document.visibilityState === 'visible') kick()
    }, 20_000)
    kick()
  }

  stop() {
    if (this.interval) clearInterval(this.interval)
    if (this.timer) clearTimeout(this.timer)
  }

  setSignedOut(v: boolean) {
    this.signedOut = v
    this.update({ status: v ? 'signed-out' : 'idle' })
    if (!v) this.schedule(0)
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l)
    return () => {
      this.listeners.delete(l)
    }
  }

  getState = () => this.state

  private update(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch, pending: this.dirty.size }
    this.listeners.forEach((l) => l())
  }

  schedule(ms: number) {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.run(), ms)
  }

  private async persistSets() {
    await set('dirty', [...this.dirty], this.kv)
    await set('pull', [...this.pull], this.kv)
    this.update({})
  }

  private svKey(docId: string) {
    return 'sv:' + docId
  }

  /** Forget everything for a deleted doc. */
  async forget(docId: string) {
    this.dirty.delete(docId)
    this.pull.delete(docId)
    await del(this.svKey(docId), this.kv)
    await this.persistSets()
  }

  async run(): Promise<void> {
    await this.loaded
    if (this.signedOut) return
    if (this.running) {
      this.again = true
      return
    }
    if (!navigator.onLine) {
      this.update({ status: 'offline' })
      return
    }
    this.running = true
    this.update({ status: 'syncing' })
    try {
      let cursor = Number(localStorage.getItem(this.cursorKey()) || 0)
      let first = true
      while (first || this.dirty.size || this.pull.size) {
        first = false
        // The workspace doc goes first: it holds the page tree.
        const ids = [...new Set([...this.dirty, ...this.pull])].sort((a, b) =>
          a === 'workspace' ? -1 : b === 'workspace' ? 1 : 0,
        )
        const batch = ids.slice(0, BATCH)
        const editMarks = new Map(batch.map((id) => [id, this.edits.get(id) ?? 0]))
        const reqDocs = await Promise.all(
          batch.map((id) =>
            this.docs.withDoc(id, async (doc) => {
              const serverSv = await get<Uint8Array>(this.svKey(id), this.kv)
              const sv = Y.encodeStateVector(doc)
              const entry: { id: string; sv: string; update?: string } = { id, sv: toB64(sv) }
              if (this.dirty.has(id)) entry.update = toB64(Y.encodeStateAsUpdate(doc, serverSv))
              return entry
            }),
          ),
        )
        const res = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cursor, docs: reqDocs }),
        })
        if (res.status === 401) {
          this.signedOut = true
          this.update({ status: 'signed-out' })
          return
        }
        if (!res.ok) throw new Error(`Sync failed (${res.status})`)
        const data = (await res.json()) as {
          docs: { id: string; update?: string; sv: string }[]
          changed: string[]
          cursor: number
        }
        const remoteChanged: string[] = []
        for (const d of data.docs) {
          if (d.update) {
            await this.docs.withDoc(d.id, (doc) => Y.applyUpdate(doc, fromB64(d.update!), SYNC_ORIGIN))
            remoteChanged.push(d.id)
          }
          await set(this.svKey(d.id), fromB64(d.sv), this.kv)
          if ((this.edits.get(d.id) ?? 0) === editMarks.get(d.id)) this.dirty.delete(d.id)
          this.pull.delete(d.id)
        }
        const inBatch = new Set(batch)
        for (const id of data.changed) if (!inBatch.has(id)) this.pull.add(id)
        cursor = data.cursor
        localStorage.setItem(this.cursorKey(), String(cursor))
        await this.persistSets()
        if (remoteChanged.length) this.onRemoteChange?.(remoteChanged)
      }
      this.update({ status: 'idle', lastSyncedAt: Date.now(), error: undefined })
    } catch (e) {
      this.update({ status: navigator.onLine ? 'error' : 'offline', error: (e as Error).message })
    } finally {
      this.running = false
      if (this.again) {
        this.again = false
        this.schedule(500)
      }
    }
  }

  private cursorKey() {
    return `gunita:cursor:${this.docs.userId}`
  }
}
