import { env } from './env'
import { cookie, error, parseCookies, randomToken, sha256 } from './util'

export const SESSION_COOKIE = 'gunita_session'
const SESSION_DAYS = 60

export interface User {
  id: string
  email: string | null
  name: string | null
  picture: string | null
}

export async function createSession(userId: string, request: Request) {
  const token = randomToken()
  const id = await sha256(token)
  const expires = Date.now() + SESSION_DAYS * 86400_000
  await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(id, userId, expires)
    .run()
  const secure = new URL(request.url).protocol === 'https:'
  return cookie(SESSION_COOKIE, token, { maxAge: SESSION_DAYS * 86400, secure })
}

export async function destroySession(request: Request) {
  const token = parseCookies(request.headers.get('cookie'))[SESSION_COOKIE]
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256(token)).run()
  return cookie(SESSION_COOKIE, '', { maxAge: 0 })
}

export async function getUser(request: Request): Promise<User | null> {
  const token = parseCookies(request.headers.get('cookie'))[SESSION_COOKIE]
  if (!token) return null
  const id = await sha256(token)
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.picture, s.expires_at FROM sessions s
     JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
  )
    .bind(id)
    .first<User & { expires_at: number }>()
  if (!row) return null
  if (row.expires_at < Date.now()) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run()
    return null
  }
  // Sliding expiry: extend when less than half the lifetime is left.
  if (row.expires_at - Date.now() < (SESSION_DAYS / 2) * 86400_000) {
    await env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?')
      .bind(Date.now() + SESSION_DAYS * 86400_000, id)
      .run()
  }
  return { id: row.id, email: row.email, name: row.name, picture: row.picture }
}

/** Wraps a handler so it only runs for a signed-in user. */
export function withUser<Ctx extends { request: Request }>(
  fn: (ctx: Ctx & { user: User }) => Promise<Response> | Response,
) {
  return async (ctx: Ctx) => {
    const user = await getUser(ctx.request)
    if (!user) return error(401, 'Not signed in')
    return fn({ ...ctx, user })
  }
}

export async function upsertGoogleUser(p: { sub: string; email?: string; name?: string; picture?: string }) {
  const existing = await env.DB.prepare('SELECT id FROM users WHERE google_sub = ?').bind(p.sub).first<{ id: string }>()
  if (existing) {
    await env.DB.prepare('UPDATE users SET email = ?, name = ?, picture = ? WHERE id = ?')
      .bind(p.email ?? null, p.name ?? null, p.picture ?? null, existing.id)
      .run()
    return existing.id
  }
  const id = crypto.randomUUID()
  await env.DB.prepare('INSERT INTO users (id, google_sub, email, name, picture, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, p.sub, p.email ?? null, p.name ?? null, p.picture ?? null, Date.now())
    .run()
  return id
}
