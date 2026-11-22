import { createFileRoute } from '@tanstack/react-router'
import { decodeIdToken, googleClient, saveGoogleTokens } from '#/server/google'
import { createSession, getUser, upsertGoogleUser } from '#/server/auth'
import { env } from '#/server/env'
import { cookie, error, parseCookies, randomToken, sha256 } from '#/server/util'

const CODE_TTL_MS = 5 * 60_000

/** A small page shown in the browser that hands control back to the desktop app. */
function desktopHandoff(link: string, title: string, body: string, headers: Headers) {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
  headers.set('Content-Type', 'text/html; charset=utf-8')
  headers.set('Cache-Control', 'no-store')
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,sans-serif;background:#191919;color:#e8e6e1}main{text-align:center;padding:24px;max-width:420px}a{display:inline-block;margin-top:16px;padding:10px 18px;border-radius:8px;background:#2f8ae5;color:#fff;text-decoration:none;font-weight:600}p{color:#a8a6a1}</style></head>
<body><main><img src="/icon.svg" width="56" height="56" alt=""><h1>${esc(title)}</h1><p>${esc(body)}</p><a href="${esc(link)}">Open Gunita</a></main>
<script>location.href=${JSON.stringify(link)}</script></body></html>`
  return new Response(html, { status: 200, headers })
}

export const Route = createFileRoute('/api/auth/google-callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const cookies = parseCookies(request.headers.get('cookie'))
        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')
        if (!code || !state || state !== cookies.g_state || !cookies.g_verifier) {
          return error(400, 'Sign-in expired or was tampered with. Please try again.')
        }
        const tokens = await googleClient(request).validateAuthorizationCode(code, cookies.g_verifier)
        const claims = decodeIdToken(tokens.idToken()) as {
          sub: string
          email?: string
          name?: string
          picture?: string
        }
        const headers = new Headers()
        const clear = (n: string) => headers.append('Set-Cookie', cookie(n, '', { maxAge: 0 }))
        for (const n of ['g_state', 'g_verifier', 'g_mode', 'g_client', 'g_challenge']) clear(n)

        const desktop = cookies.g_client === 'desktop'
        const calendar = cookies.g_mode === 'calendar'
        let userId: string
        const current = desktop ? null : await getUser(request)
        if (calendar && current) {
          userId = current.id
        } else {
          // The desktop app has no session in this browser, so the Google account decides the user.
          userId = await upsertGoogleUser(claims)
          if (!desktop) headers.append('Set-Cookie', await createSession(userId, request))
        }
        const scope = tokens.hasScopes() ? tokens.scopes().join(' ') : ''
        await saveGoogleTokens(userId, {
          accessToken: tokens.accessToken(),
          expiresAt: tokens.accessTokenExpiresAt().getTime(),
          refreshToken: tokens.hasRefreshToken() ? tokens.refreshToken() : undefined,
          scope,
        })

        if (desktop && calendar) {
          return desktopHandoff('gunita://calendar', 'Calendar connected', 'Go back to the Gunita app. Use the same Google account you sign in to Gunita with.', headers)
        }
        if (desktop) {
          const challenge = cookies.g_challenge ?? ''
          if (!/^[A-Za-z0-9_-]{43}$/.test(challenge)) return error(400, 'Desktop sign-in expired. Please try again from the app.')
          const handoff = randomToken(32)
          await env.DB.prepare('DELETE FROM login_codes WHERE expires_at < ?').bind(Date.now()).run()
          await env.DB.prepare('INSERT INTO login_codes (code_hash, user_id, challenge, expires_at) VALUES (?, ?, ?, ?)')
            .bind(await sha256(handoff), userId, challenge, Date.now() + CODE_TTL_MS)
            .run()
          return desktopHandoff(`gunita://auth?code=${handoff}`, "You're signed in", 'Go back to the Gunita app. You can close this tab.', headers)
        }
        headers.set('Location', calendar ? '/settings?calendar=connected' : '/')
        return new Response(null, { status: 302, headers })
      },
    },
  },
})
