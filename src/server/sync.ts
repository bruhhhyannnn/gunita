import * as Y from 'yjs'
import { env } from './env'
import { b64decode, b64encode, toBytes } from './util'

const COMPACT_AFTER = 40
const MAX_COMPACT_BYTES = 1_500_000
/** On the fast path, look at the whole doc (and compact it) about once every this many pushes. */
const CHECK_EVERY = 16

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
  return results.map((r) => ({ seq: r.seq, data: toBytes(r.data) }))
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
      // One transaction: what was the newest row before ours, and our new row.
      const [before, inserted] = await env.DB.batch<{ seq: number | null }>([
        env.DB.prepare('SELECT MAX(seq) AS seq FROM doc_updates WHERE user_id = ? AND doc_id = ?').bind(userId, input.id),
        env.DB.prepare('INSERT INTO doc_updates (user_id, doc_id, data, created_at) VALUES (?, ?, ?, ?) RETURNING seq').bind(
          userId,
          input.id,
          bytes,
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
  if (rows.length > COMPACT_AFTER && merged.length < MAX_COMPACT_BYTES) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM doc_updates WHERE user_id = ? AND doc_id = ? AND seq <= ?').bind(userId, input.id, seq),
      env.DB.prepare('INSERT INTO doc_updates (user_id, doc_id, data, created_at) VALUES (?, ?, ?, ?)').bind(userId, input.id, merged, now),
    ])
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
