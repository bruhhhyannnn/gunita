import { createFileRoute } from '@tanstack/react-router'
import { createSession } from '#/server/auth'
import { env } from '#/server/env'
import { error, sha256 } from '#/server/util'

// Called inside the desktop app's window: trades the one-time code from the
// gunita:// link (plus the app's secret verifier) for a session cookie.
export const Route = createFileRoute('/api/auth/desktop')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const code = url.searchParams.get('code') ?? ''
        const verifier = url.searchParams.get('verifier') ?? ''
        if (!code || !verifier) return error(400, 'Missing code')
        const hash = await sha256(code)
        const row = await env.DB.prepare('SELECT user_id, challenge, expires_at FROM login_codes WHERE code_hash = ?')
          .bind(hash)
          .first<{ user_id: string; challenge: string; expires_at: number }>()
        // One use only, whatever happens next.
        await env.DB.prepare('DELETE FROM login_codes WHERE code_hash = ?').bind(hash).run()
        if (!row || row.expires_at < Date.now() || (await sha256(verifier)) !== row.challenge) {
          return new Response(null, { status: 303, headers: { Location: '/login?error=desktop' } })
        }
        const headers = new Headers({ Location: '/' })
        headers.append('Set-Cookie', await createSession(row.user_id, request))
        return new Response(null, { status: 303, headers })
      },
    },
  },
})
