import * as Y from 'yjs'
import { env } from './env'
import { b64decode, b64encode, toBytes } from './util'

const COMPACT_AFTER = 40
const MAX_COMPACT_BYTES = 1_500_000

export interface SyncDocIn {
  id: string
  /** Client state vector (base64). */
  sv?: string
  /** Changes the server might be missing (base64 Yjs update). */
  update?: string
}

export interface SyncDocOut {
  id: string
  update?: string
  sv: string
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
      await env.DB.prepare('INSERT INTO doc_updates (user_id, doc_id, data, created_at) VALUES (?, ?, ?, ?)')
        .bind(userId, input.id, bytes, now)
        .run()
    }
  }
  const rows = await loadUpdates(userId, input.id)
  if (!rows.length) return { id: input.id, sv: b64encode(Y.encodeStateVector(new Y.Doc())) }
  const merged = rows.length === 1 ? rows[0].data : Y.mergeUpdates(rows.map((r) => r.data))

  if (rows.length > COMPACT_AFTER && merged.length < MAX_COMPACT_BYTES) {
    const maxSeq = rows[rows.length - 1].seq
    await env.DB.batch([
      env.DB.prepare('DELETE FROM doc_updates WHERE user_id = ? AND doc_id = ? AND seq <= ?').bind(
        userId,
        input.id,
        maxSeq,
      ),
      env.DB.prepare('INSERT INTO doc_updates (user_id, doc_id, data, created_at) VALUES (?, ?, ?, ?)').bind(
        userId,
        input.id,
        merged,
        now,
      ),
    ])
  }

  const sv = Y.encodeStateVectorFromUpdate(merged)
  const out: SyncDocOut = { id: input.id, sv: b64encode(sv) }
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
