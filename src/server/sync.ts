import * as Y from 'yjs'
import { env } from './env'
import { b64decode, b64encode, toBytes } from './util'

const COMPACT_AFTER = 40
/** On the fast path, look at the whole doc (and compact it) about once every this many pushes. */
const CHECK_EVERY = 16
/** Days of page history kept (one snapshot per page per day it changed). */
export const HISTORY_DAYS = 30

// ---------- Big page data lives in R2 ----------
// A D1 row holds at most 2 MB. Updates (and compacted pages) bigger than this
// go to R2, and the D1 row keeps a short pointer instead.

const POINTER = new TextEncoder().encode('gunita-r2:')

function inlineMax() {
  const n = Number(env.SYNC_INLINE_MAX)
  return n > 0 ? n : 1_000_000
}

function pointerKey(b: Uint8Array): string | null {
  if (b.length <= POINTER.length || b.length > 300) return null
  for (let i = 0; i < POINTER.length; i++) if (b[i] !== POINTER[i]) return null
  return new TextDecoder().decode(b.subarray(POINTER.length))
}

/** What to put in the D1 row for these bytes: the bytes, or a pointer to R2. */
async function toStored(userId: string, docId: string, bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes.length <= inlineMax()) return bytes
  const key = `docdata/${userId}/${docId}/${crypto.randomUUID()}`
  await env.FILES.put(key, bytes)
  const k = new TextEncoder().encode(key)
  const out = new Uint8Array(POINTER.length + k.length)
  out.set(POINTER)
  out.set(k, POINTER.length)
  return out
}

async function fromStored(b: Uint8Array): Promise<Uint8Array> {
  const key = pointerKey(b)
  if (!key) return b
  const obj = await env.FILES.get(key)
  // Never treat missing data as "empty": that would look like a synced page.
  if (!obj) throw new Error(`Page data is missing (${key})`)
  return new Uint8Array(await obj.arrayBuffer())
}

// ---------- Page history: a snapshot per page per day, in R2 ----------

const snapshotted = new Map<string, string>() // `${user}/${doc}` -> day, per worker instance

function historyPrefix(userId: string, docId: string) {
  return `history/${userId}/${docId}/`
}

/**
 * Before the first change of the day to a page, keep a copy of how it was.
 * Page history (and restoring) uses these.
 */
async function ensureDailySnapshot(userId: string, docId: string) {
  const day = new Date().toISOString().slice(0, 10)
  const memo = `${userId}/${docId}`
  if (snapshotted.get(memo) === day) return
  const prefix = historyPrefix(userId, docId)
  const key = `${prefix}${day}.bin`
  if (await env.FILES.head(key)) {
    snapshotted.set(memo, day)
    return
  }
  const rows = await loadUpdates(userId, docId)
  if (!rows.length) return // a new page: nothing to keep yet
  const merged = rows.length === 1 ? rows[0].data : Y.mergeUpdates(rows.map((r) => r.data))
  await env.FILES.put(key, merged, { customMetadata: { savedAt: String(Date.now()) } })
  snapshotted.set(memo, day)
  // Drop snapshots older than the history window.
  const cutoff = new Date(Date.now() - HISTORY_DAYS * 86400_000).toISOString().slice(0, 10)
  const old = (await env.FILES.list({ prefix })).objects.filter((o) => o.key.slice(prefix.length, prefix.length + 10) < cutoff).map((o) => o.key)
  if (old.length) await env.FILES.delete(old)
}

export async function listHistory(userId: string, docId: string) {
  const prefix = historyPrefix(userId, docId)
  const { objects } = await env.FILES.list({ prefix, include: ['customMetadata'] })
  return objects
    .map((o) => ({ day: o.key.slice(prefix.length, prefix.length + 10), savedAt: Number(o.customMetadata?.savedAt) || o.uploaded.getTime(), size: o.size }))
    .sort((a, b) => b.savedAt - a.savedAt)
}

export async function readHistory(userId: string, docId: string, day: string): Promise<Uint8Array | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const obj = await env.FILES.get(`${historyPrefix(userId, docId)}${day}.bin`)
  return obj ? new Uint8Array(await obj.arrayBuffer()) : null
}

export interface SyncDocIn {
  id: string
  /** Client state vector (base64). */
  sv?: string
  /** Changes the server might be missing (base64 Yjs update). */
  update?: string
  /** The newest row of this doc the client has applied, if it knows. */
  seq?: number
}

export interface SyncDocOut {
  id: string
  update?: string
  sv: string
  /** The newest row of this doc, which the client now has. */
  seq?: number
}

async function loadUpdates(userId: string, docId: string) {
  const { results } = await env.DB.prepare(
    'SELECT seq, data FROM doc_updates WHERE user_id = ? AND doc_id = ? ORDER BY seq',
  )
    .bind(userId, docId)
    .all<{ seq: number; data: unknown }>()
  return Promise.all(
    results.map(async (r) => {
      const raw = toBytes(r.data)
      return { seq: r.seq, data: await fromStored(raw), r2Key: pointerKey(raw) }
    }),
  )
}

export async function loadMergedDoc(userId: string, docId: string): Promise<Uint8Array | null> {
  const rows = await loadUpdates(userId, docId)
  if (!rows.length) return null
  return Y.mergeUpdates(rows.map((r) => r.data))
}

function isEmptyUpdate(u: Uint8Array) {
  return u.length <= 2 && u.every((b) => b === 0)
}

export async function syncDoc(userId: string, input: SyncDocIn): Promise<SyncDocOut> {
  const now = Date.now()
  if (input.update) {
    const bytes = b64decode(input.update)
    if (!isEmptyUpdate(bytes)) {
      await ensureDailySnapshot(userId, input.id)
      const stored = await toStored(userId, input.id, bytes)
      // One transaction: what was the newest row before ours, and our new row.
      const [before, inserted] = await env.DB.batch<{ seq: number | null }>([
        env.DB.prepare('SELECT MAX(seq) AS seq FROM doc_updates WHERE user_id = ? AND doc_id = ?').bind(userId, input.id),
        env.DB.prepare('INSERT INTO doc_updates (user_id, doc_id, data, created_at) VALUES (?, ?, ?, ?) RETURNING seq').bind(
          userId,
          input.id,
          stored,
          now,
        ),
      ])
      const prevSeq = before.results[0]?.seq ?? 0
      const newSeq = inserted.results[0]?.seq ?? 0
      // Fast path (typing on one device): nobody else changed this doc since
      // the client last synced, so the server now has exactly what the client
      // has. No need to read the whole doc back.
      if (typeof input.seq === 'number' && input.seq === prevSeq && input.sv && newSeq && newSeq % CHECK_EVERY !== 0) {
        return { id: input.id, sv: input.sv, seq: newSeq }
      }
    }
  }
  const rows = await loadUpdates(userId, input.id)
  if (!rows.length) return { id: input.id, sv: b64encode(Y.encodeStateVector(new Y.Doc())) }
  const merged = rows.length === 1 ? rows[0].data : Y.mergeUpdates(rows.map((r) => r.data))

  // The newest row included in `merged`. After compacting, the client is still
  // told this one (not the compacted row's): if another device wrote in
  // between, the client's next push sees the difference and reads it back.
  const seq = rows[rows.length - 1].seq
  if (rows.length > COMPACT_AFTER) {
    // Big pages compact into R2 (see toStored), so they never stop compacting.
    const stored = await toStored(userId, input.id, merged)
    await env.DB.batch([
      env.DB.prepare('DELETE FROM doc_updates WHERE user_id = ? AND doc_id = ? AND seq <= ?').bind(userId, input.id, seq),
      env.DB.prepare('INSERT INTO doc_updates (user_id, doc_id, data, created_at) VALUES (?, ?, ?, ?)').bind(userId, input.id, stored, now),
    ])
    const gone = rows.map((r) => r.r2Key).filter((k): k is string => !!k)
    if (gone.length) await env.FILES.delete(gone)
  }

  const sv = Y.encodeStateVectorFromUpdate(merged)
  const out: SyncDocOut = { id: input.id, sv: b64encode(sv), seq }
  const diff = input.sv ? Y.diffUpdate(merged, b64decode(input.sv)) : merged
  if (!isEmptyUpdate(diff)) out.update = b64encode(diff)
  return out
}

export async function changedSince(userId: string, cursor: number) {
  const { results } = await env.DB.prepare(
    'SELECT doc_id, MAX(seq) AS seq FROM doc_updates WHERE user_id = ? AND seq > ? GROUP BY doc_id',
  )
    .bind(userId, cursor)
    .all<{ doc_id: string; seq: number }>()
  const max = await env.DB.prepare('SELECT MAX(seq) AS seq FROM doc_updates WHERE user_id = ?')
    .bind(userId)
    .first<{ seq: number | null }>()
  return { changed: results.map((r) => r.doc_id), cursor: max?.seq ?? 0 }
}
