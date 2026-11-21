import { createFileRoute } from '@tanstack/react-router'
import { withUser } from '#/server/auth'
import { aiError, claudeStream } from '#/server/ai'

interface Body {
  question: string
  history: { role: 'user' | 'assistant'; content: string }[]
  sources: { n: number; title: string; text: string; updated?: string }[]
  memory: string[]
  date: string
}

export const Route = createFileRoute('/api/ai/ask')({
  server: {
    handlers: {
      POST: withUser(async ({ request }) => {
        try {
          const b = (await request.json()) as Body
          const sources = b.sources
            .slice(0, 12)
            .map((s) => `<source n="${s.n}" title="${s.title.replace(/"/g, "'")}"${s.updated ? ` updated="${s.updated}"` : ''}>\n${s.text.slice(0, 6000)}\n</source>`)
            .join('\n\n')
          const memory = b.memory.length ? `\n\nThings you remember about the user:\n${b.memory.map((m) => `- ${m}`).join('\n')}` : ''
          const messages = [
            ...b.history.slice(-8).map((h) => ({ role: h.role, content: h.content })),
            {
              role: 'user' as const,
              content: `Today is ${b.date}.\n\nRelevant notes:\n${sources || '(no matching notes found)'}${memory}\n\nQuestion: ${b.question}`,
            },
          ]
          return claudeStream({
            effort: 'medium',
            system: `You answer questions about the user's own notes, tasks and meeting notes in their notes app.
- Answer from the provided notes. Cite them inline as [1], [2] using the source numbers. Cite only sources you used.
- If the notes don't contain the answer, say so plainly, then give your best general answer, clearly marked as not from their notes.
- Be concise and practical. Use short paragraphs or bullet lists. Markdown is fine.`,
            messages,
            signal: request.signal,
          })
        } catch (e) {
          return aiError(e)
        }
      }),
    },
  },
})
