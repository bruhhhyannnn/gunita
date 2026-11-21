import { Google, decodeIdToken, generateCodeVerifier, generateState } from 'arctic'
import { env } from './env'
import { appOrigin } from './util'
import { encrypt, decrypt } from './crypto'

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

export function googleConfigured() {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
}

export function googleClient(request: Request) {
  const redirect = appOrigin(request, env.APP_URL) + '/api/auth/google-callback'
  return new Google(env.GOOGLE_CLIENT_ID!, env.GOOGLE_CLIENT_SECRET!, redirect)
}

export { decodeIdToken, generateCodeVerifier, generateState }

export async function saveGoogleTokens(
  userId: string,
  t: { accessToken: string; expiresAt: number; refreshToken?: string; scope: string },
) {
  const secret = env.SESSION_SECRET || 'dev-secret'
  const existing = await env.DB.prepare('SELECT refresh_token_enc FROM google_tokens WHERE user_id = ?')
    .bind(userId)
    .first<{ refresh_token_enc: string | null }>()
  const refreshEnc = t.refreshToken ? await encrypt(t.refreshToken, secret) : (existing?.refresh_token_enc ?? null)
  await env.DB.prepare(
    `INSERT INTO google_tokens (user_id, refresh_token_enc, access_token, expires_at, scope) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET refresh_token_enc = excluded.refresh_token_enc,
       access_token = excluded.access_token, expires_at = excluded.expires_at, scope = excluded.scope`,
  )
    .bind(userId, refreshEnc, t.accessToken, t.expiresAt, t.scope)
    .run()
}

/** Returns a valid Google access token with calendar scope, refreshing if needed. */
export async function calendarAccessToken(userId: string, request: Request): Promise<string | null> {
  const row = await env.DB.prepare('SELECT * FROM google_tokens WHERE user_id = ?')
    .bind(userId)
    .first<{ refresh_token_enc: string | null; access_token: string; expires_at: number; scope: string }>()
  if (!row || !row.scope.includes(CALENDAR_SCOPE)) return null
  if (row.expires_at > Date.now() + 60_000) return row.access_token
  if (!row.refresh_token_enc) return null
  const refresh = await decrypt(row.refresh_token_enc, env.SESSION_SECRET || 'dev-secret')
  const tokens = await googleClient(request).refreshAccessToken(refresh)
  await saveGoogleTokens(userId, {
    accessToken: tokens.accessToken(),
    expiresAt: tokens.accessTokenExpiresAt().getTime(),
    scope: row.scope,
  })
  return tokens.accessToken()
}
