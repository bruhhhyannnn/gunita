import { createFileRoute } from '@tanstack/react-router'
import { decodeIdToken, googleClient, saveGoogleTokens } from '#/server/google'
import { createSession, getUser, upsertGoogleUser } from '#/server/auth'
import { cookie, error, parseCookies } from '#/server/util'

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
        clear('g_state')
        clear('g_verifier')
        clear('g_mode')

        let userId: string
        const current = await getUser(request)
        if (cookies.g_mode === 'calendar' && current) {
          userId = current.id
        } else {
          userId = await upsertGoogleUser(claims)
          headers.append('Set-Cookie', await createSession(userId, request))
        }
        const scope = tokens.hasScopes() ? tokens.scopes().join(' ') : ''
        await saveGoogleTokens(userId, {
          accessToken: tokens.accessToken(),
          expiresAt: tokens.accessTokenExpiresAt().getTime(),
          refreshToken: tokens.hasRefreshToken() ? tokens.refreshToken() : undefined,
          scope,
        })
        headers.set('Location', cookies.g_mode === 'calendar' ? '/settings?calendar=connected' : '/')
        return new Response(null, { status: 302, headers })
      },
    },
  },
})
