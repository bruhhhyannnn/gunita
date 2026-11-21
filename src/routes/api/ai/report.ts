import { createFileRoute } from '@tanstack/react-router'
import { withUser } from '#/server/auth'
import { aiError, claudeText } from '#/server/ai'

export const Route = createFileRoute('/api/ai/report')({
  server: {
    handlers: {
      POST: withUser(async ({ request }) => {
        try {
          const { text } = (await request.json()) as { text: string }
          const out = await claudeText({
            effort: 'medium',
            system: `You turn a raw list of completed tasks into a clean accomplishment report for a government office's work accomplishment form (plain text, pasted into a Word/Google Docs template).
Rules:
- Plain text only. No markdown symbols except "•" bullets. Keep the same header line and the day headings if present.
- Rewrite each bullet as a clear, professional accomplishment in past tense (e.g. "check emails" -> "Checked and responded to official emails").
- Merge exact repeats within the same day. Never invent work that isn't in the list.
- Keep it concise.`,
            messages: [{ role: 'user', content: text.slice(0, 20000) }],
          })
          return Response.json({ text: out.trim() })
        } catch (e) {
          return aiError(e)
        }
      }),
    },
  },
})
