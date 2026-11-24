import { createFileRoute } from '@tanstack/react-router'
import * as z from 'zod/v4'
import { withUser } from '#/server/auth'
import { aiError, claudeJson } from '#/server/ai'

const Report = z.object({
  groups: z
    .array(
      z.object({
        title: z.string().describe('Project or system name, e.g. "IRS Application". Use "Other tasks" for things that fit nowhere.'),
        items: z.array(z.string()).describe('Accomplishments, each a complete past-tense sentence.'),
      }),
    )
    .describe('Groups in order of importance.'),
})

interface Body {
  period: string
  tasks: { day: string; text: string; parent: string | null }[]
}

// Turns a list of checked tasks into a work accomplishment report.
export const Route = createFileRoute('/api/ai/report')({
  server: {
    handlers: {
      POST: withUser(async ({ request }) => {
        try {
          const b = (await request.json()) as Body
          const lines = b.tasks.slice(0, 400).map((t) => `- ${t.day}: ${t.text}${t.parent ? `  (under: ${t.parent})` : ''}`)
          const out = await claudeJson(Report, {
            effort: 'medium',
            system: `You write a government contract worker's semi-monthly work accomplishment report from the tasks they checked off.
Style (match it closely):
- One bullet per accomplishment, past tense, specific and concrete, 1-2 sentences, e.g. "Created the Bystander Report screen (24c) and its "Read full notice" modal screen." or "Updated the Campus page (SA3) cards to fit their content height instead of a fixed height."
- Keep the user's technical details (screen codes, component names, files) and fix their grammar and casing.
- Group bullets by project/system. A task's "under" parent is usually the project (e.g. "i want to finish IRS web admin" -> "IRS Application"); give each group a short proper name.
- Merge duplicates and the same task repeated on several days into one bullet. Leave out trivial routine items (checking email, updating this report).
- Never invent work that isn't in the list.`,
            messages: [{ role: 'user', content: `Period: ${b.period}\n\nChecked tasks:\n${lines.join('\n')}` }],
          })
          return Response.json(out)
        } catch (e) {
          return aiError(e)
        }
      }),
    },
  },
})
