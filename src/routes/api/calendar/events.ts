import { createFileRoute } from '@tanstack/react-router'
import { withUser } from '#/server/auth'
import { listEvents } from '#/server/calendar'

export const Route = createFileRoute('/api/calendar/events')({
  server: {
    handlers: {
      GET: withUser(async ({ request, user }) => {
        const u = new URL(request.url)
        const from = u.searchParams.get('from') || new Date().toISOString()
        const to = u.searchParams.get('to') || new Date(Date.now() + 7 * 86400_000).toISOString()
        const events = await listEvents(user.id, request, from, to)
        if (!events) return Response.json({ connected: false, events: [] })
        return Response.json({ connected: true, events })
      }),
    },
  },
})
