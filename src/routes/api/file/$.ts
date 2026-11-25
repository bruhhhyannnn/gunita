import { createFileRoute } from '@tanstack/react-router'
import { env } from '#/server/env'
import { error } from '#/server/util'

// Keys contain a random UUID, so links are unguessable. That keeps images
// working on read-only public pages without a session.
export const Route = createFileRoute('/api/file/$')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const key = params._splat
        // Only uploaded files ("<user>/<uuid>.<ext>"); never page data or history kept in the same bucket.
        if (!key || !/^[A-Za-z0-9_-]{1,64}\/[0-9a-f-]{36}\.[a-z0-9]{1,8}$/.test(key)) return error(404, 'Not found')
        const obj = await env.FILES.get(key)
        if (!obj) return error(404, 'Not found')
        return new Response(obj.body as unknown as ReadableStream, {
          headers: {
            'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        })
      },
    },
  },
})
