import { createFileRoute } from '@tanstack/react-router'
import { env } from '#/server/env'
import { createSession, upsertGoogleUser } from '#/server/auth'
import { error } from '#/server/util'

export const Route = createFileRoute('/api/auth/dev')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (env.DEV_LOGIN !== 'true') return error(404, 'Not found')
        // ?u=name gives each local test run its own account.
        const u = (new URL(request.url).searchParams.get('u') || 'user').replace(/[^a-z0-9-]/gi, '').slice(0, 32) || 'user'
        const userId = await upsertGoogleUser({ sub: `dev-${u}`, email: `${u}@localhost`, name: u === 'user' ? 'Dev User' : u })
        const headers = new Headers({ Location: '/' })
        headers.append('Set-Cookie', await createSession(userId, request))
        return new Response(null, { status: 303, headers })
      },
    },
  },
})
