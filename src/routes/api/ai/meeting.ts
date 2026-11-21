import { createFileRoute } from '@tanstack/react-router'
import * as z from 'zod/v4'
import { withUser } from '#/server/auth'
import { aiError, claudeJson } from '#/server/ai'

const Summary = z.object({
  summary: z.string().describe('3-6 sentence summary of what was discussed and why it matters.'),
  decisions: z.array(z.string()).describe('Decisions that were made. Empty if none.'),
  actionItems: z
    .array(
      z.object({
        text: z.string().describe('A concrete task, starting with a verb.'),
        owner: z.string().describe('Who owns it, or empty if unclear. Use "me" for the note-taker.'),
        due: z.string().describe('Due date as YYYY-MM-DD if one was mentioned, otherwise empty.'),
      }),
    )
    .describe('Follow-up tasks. Include tasks for the note-taker first.'),
})

export const Route = createFileRoute('/api/ai/meeting')({
  server: {
    handlers: {
      POST: withUser(async ({ request }) => {
        try {
          const b = (await request.json()) as { title: string; date: string; attendees: string[]; notes: string; transcript?: string }
          const out = await claudeJson(Summary, {
            effort: 'medium',
            system: `You turn rough meeting or workshop notes into a clear recap for the person who took them.
Only use what's in the notes and transcript. Don't invent decisions, owners or dates. Write in plain English.`,
            messages: [
              {
                role: 'user',
                content: [
                  `Meeting: ${b.title || 'Untitled'} (${b.date})`,
                  b.attendees?.length ? `Attendees: ${b.attendees.join(', ')}` : '',
                  `Notes:\n${b.notes.slice(0, 60000)}`,
                  b.transcript ? `Transcript:\n${b.transcript.slice(0, 80000)}` : '',
                ]
                  .filter(Boolean)
                  .join('\n\n'),
              },
            ],
          })
          return Response.json(out)
        } catch (e) {
          return aiError(e)
        }
      }),
    },
  },
})
