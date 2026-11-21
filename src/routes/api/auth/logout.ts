import { createFileRoute } from '@tanstack/react-router'
import { destroySession } from '#/server/auth'

export const Route = createFileRoute('/api/auth/logout')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const headers = new Headers()
        headers.append('Set-Cookie', await destroySession(request))
        return Response.json({ ok: true }, { headers })
      },
    },
  },
})
