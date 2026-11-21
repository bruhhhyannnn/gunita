import { createFileRoute } from '@tanstack/react-router'
import { withUser } from '#/server/auth'
import { env } from '#/server/env'
import { appOrigin, error, randomToken } from '#/server/util'

export const Route = createFileRoute('/api/share')({
  server: {
    handlers: {
      POST: withUser(async ({ request, user }) => {
        const { pageId, enabled } = (await request.json()) as { pageId: string; enabled: boolean }
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(pageId ?? '')) return error(400, 'Bad page id')
        if (!enabled) {
          await env.DB.prepare('DELETE FROM shares WHERE user_id = ? AND page_id = ?').bind(user.id, pageId).run()
          return Response.json({ slug: null })
        }
        const existing = await env.DB.prepare('SELECT slug FROM shares WHERE user_id = ? AND page_id = ?')
          .bind(user.id, pageId)
          .first<{ slug: string }>()
        const slug = existing?.slug ?? randomToken(9)
        if (!existing) {
          await env.DB.prepare('INSERT INTO shares (slug, user_id, page_id, created_at) VALUES (?, ?, ?, ?)')
            .bind(slug, user.id, pageId, Date.now())
            .run()
        }
        return Response.json({ slug, url: `${appOrigin(request, env.APP_URL)}/s/${slug}` })
      }),
    },
  },
})
