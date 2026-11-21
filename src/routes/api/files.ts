import { createFileRoute } from '@tanstack/react-router'
import { withUser } from '#/server/auth'
import { env } from '#/server/env'
import { error } from '#/server/util'

const MAX_BYTES = 20 * 1024 * 1024

export const Route = createFileRoute('/api/files')({
  server: {
    handlers: {
      POST: withUser(async ({ request, user }) => {
        const form = await request.formData()
        const file = form.get('file')
        if (!(file instanceof File)) return error(400, 'Missing file')
        if (file.size > MAX_BYTES) return error(413, 'File is larger than 20 MB')
        const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8)
        const key = `${user.id}/${crypto.randomUUID()}.${ext}`
        const type = file.type || 'application/octet-stream'
        await env.FILES.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: type } })
        await env.DB.prepare('INSERT INTO files (key, user_id, content_type, size, created_at) VALUES (?, ?, ?, ?, ?)')
          .bind(key, user.id, type, file.size, Date.now())
          .run()
        return Response.json({ url: `/api/files/${key}`, key, contentType: type, name: file.name, size: file.size })
      }),
    },
  },
})
