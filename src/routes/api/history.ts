import { createFileRoute } from '@tanstack/react-router'
import { withUser } from '#/server/auth'
import { listHistory, readHistory } from '#/server/sync'
import { b64encode, error } from '#/server/util'

const ID = /^[A-Za-z0-9_:-]{1,64}$/

/**
 * Page history: GET ?doc=<id> lists the saved versions (one per day the page
 * changed, for 30 days); GET ?doc=<id>&day=YYYY-MM-DD returns that version.
 */
export const Route = createFileRoute('/api/history')({
  server: {
    handlers: {
      GET: withUser(async ({ request, user }) => {
        const url = new URL(request.url)
        const doc = url.searchParams.get('doc') ?? ''
        if (!ID.test(doc)) return error(400, 'Bad doc id')
        const day = url.searchParams.get('day')
        if (!day) return Response.json({ versions: await listHistory(user.id, doc) })
        const bytes = await readHistory(user.id, doc, day)
        if (!bytes) return error(404, 'No saved version for that day')
        return Response.json({ update: b64encode(bytes) })
      }),
    },
  },
})
