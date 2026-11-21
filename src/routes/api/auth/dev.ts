import { createFileRoute } from '@tanstack/react-router'
import { env } from '#/server/env'
import { createSession, upsertGoogleUser } from '#/server/auth'
import { error } from '#/server/util'

export const Route = createFileRoute('/api/auth/dev')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (env.DEV_LOGIN !== 'true') return error(404, 'Not found')
        const userId = await upsertGoogleUser({ sub: 'dev-user', email: 'dev@localhost', name: 'Dev User' })
        const headers = new Headers({ Location: '/' })
        headers.append('Set-Cookie', await createSession(userId, request))
        return new Response(null, { status: 303, headers })
      },
    },
  },
})
