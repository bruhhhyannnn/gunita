import { createFileRoute } from '@tanstack/react-router'
import { CALENDAR_SCOPE, generateCodeVerifier, generateState, googleClient, googleConfigured } from '#/server/google'
import { cookie, error } from '#/server/util'

export const Route = createFileRoute('/api/auth/google')({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!googleConfigured()) return error(500, 'Google sign-in is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).')
        const url = new URL(request.url)
        const mode = url.searchParams.get('mode') === 'calendar' ? 'calendar' : 'login'
        // The desktop app signs in through the system browser and passes a PKCE-style challenge.
        const desktop = url.searchParams.get('client') === 'desktop'
        const challenge = url.searchParams.get('challenge') ?? ''
        if (desktop && !/^[A-Za-z0-9_-]{43}$/.test(challenge)) return error(400, 'Bad desktop sign-in request')
        const state = generateState()
        const verifier = generateCodeVerifier()
        const scopes = ['openid', 'profile', 'email']
        if (mode === 'calendar') scopes.push(CALENDAR_SCOPE)
        const authUrl = googleClient(request).createAuthorizationURL(state, verifier, scopes)
        if (mode === 'calendar') {
          authUrl.searchParams.set('access_type', 'offline')
          authUrl.searchParams.set('prompt', 'consent')
          authUrl.searchParams.set('include_granted_scopes', 'true')
        } else {
          authUrl.searchParams.set('prompt', 'select_account')
        }
        const secure = url.protocol === 'https:'
        const headers = new Headers({ Location: authUrl.toString() })
        headers.append('Set-Cookie', cookie('g_state', state, { maxAge: 600, secure }))
        headers.append('Set-Cookie', cookie('g_verifier', verifier, { maxAge: 600, secure }))
        headers.append('Set-Cookie', cookie('g_mode', mode, { maxAge: 600, secure }))
        headers.append('Set-Cookie', cookie('g_client', desktop ? 'desktop' : 'web', { maxAge: 600, secure }))
        if (desktop) headers.append('Set-Cookie', cookie('g_challenge', challenge, { maxAge: 600, secure }))
        return new Response(null, { status: 302, headers })
      },
    },
  },
})
