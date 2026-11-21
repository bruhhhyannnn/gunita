import { createFileRoute } from '@tanstack/react-router'
import { env } from '#/server/env'
import { getUser } from '#/server/auth'
import { CALENDAR_SCOPE, googleConfigured } from '#/server/google'

export const Route = createFileRoute('/api/me')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await getUser(request)
        const config = {
          googleConfigured: googleConfigured(),
          devLogin: env.DEV_LOGIN === 'true',
          claudeConfigured: Boolean(env.ANTHROPIC_API_KEY),
          workersAiConfigured: Boolean(env.AI),
        }
        if (!user) return Response.json({ user: null, config }, { status: 401 })
        const tok = await env.DB.prepare('SELECT scope FROM google_tokens WHERE user_id = ?')
          .bind(user.id)
          .first<{ scope: string }>()
        return Response.json({
          user,
          config: { ...config, calendarConnected: Boolean(tok?.scope?.includes(CALENDAR_SCOPE)) },
        })
      },
    },
  },
})
