import { createFileRoute } from '@tanstack/react-router'
import { withUser } from '#/server/auth'
import { changedSince, syncDoc, type SyncDocIn } from '#/server/sync'
import { error } from '#/server/util'

const ID = /^[A-Za-z0-9_:-]{1,64}$/

export const Route = createFileRoute('/api/sync')({
  server: {
    handlers: {
      POST: withUser(async ({ request, user }) => {
        const body = (await request.json()) as { cursor?: number; docs?: SyncDocIn[] }
        const docs = (body.docs ?? []).slice(0, 50)
        if (docs.some((d) => !ID.test(d.id))) return error(400, 'Bad doc id')
        const out = []
        for (const d of docs) out.push(await syncDoc(user.id, d))
        const { changed, cursor } = await changedSince(user.id, Number(body.cursor) || 0)
        return Response.json({ docs: out, changed, cursor })
      }),
    },
  },
})
