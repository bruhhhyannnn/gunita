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
        if (!key || key.includes('..')) return error(400, 'Bad key')
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
