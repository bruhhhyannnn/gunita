import { createFileRoute } from '@tanstack/react-router'
import * as z from 'zod/v4'
import { withUser } from '#/server/auth'
import { aiError, claudeJson } from '#/server/ai'
import { env } from '#/server/env'
import { b64encode, error } from '#/server/util'

const Extracted = z.object({
  title: z.string().describe('A short title for the slide(s) or document.'),
  text: z.string().describe('All readable text, cleaned up, keeping the original structure with line breaks. Use "- " for bullets.'),
  keyPoints: z.array(z.string()).describe('3-6 key takeaways.'),
})

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const

export const Route = createFileRoute('/api/ai/extract')({
  server: {
    handlers: {
      POST: withUser(async ({ request, user }) => {
        try {
          const { key } = (await request.json()) as { key: string }
          if (!key?.startsWith(user.id + '/')) return error(403, 'Not your file')
          const obj = await env.FILES.get(key)
          if (!obj) return error(404, 'File not found')
          const type = obj.httpMetadata?.contentType || ''
          const data = b64encode(new Uint8Array(await obj.arrayBuffer()))
          let block
          if (type === 'application/pdf') {
            block = { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data } }
          } else if ((IMAGE_TYPES as readonly string[]).includes(type)) {
            block = { type: 'image' as const, source: { type: 'base64' as const, media_type: type as (typeof IMAGE_TYPES)[number], data } }
          } else return error(415, 'Only images and PDFs can be read')
          const out = await claudeJson(Extracted, {
            effort: 'medium',
            system: 'You read photos of presentation slides, whiteboards and PDFs from workshops and transcribe them for the user’s notes. Fix obvious OCR noise but do not add information.',
            messages: [{ role: 'user', content: [block, { type: 'text', text: 'Transcribe this and list the key points.' }] }],
          })
          return Response.json(out)
        } catch (e) {
          return aiError(e)
        }
      }),
    },
  },
})
