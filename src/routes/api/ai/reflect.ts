import { createFileRoute } from '@tanstack/react-router'
import * as z from 'zod/v4'
import { withUser } from '#/server/auth'
import { aiError, claudeJson } from '#/server/ai'

const Reflection = z.object({
  entities: z
    .array(
      z.object({
        name: z.string().describe('Canonical name, e.g. "IRS web admin", "AWS EC2", "Juan Dela Cruz".'),
        type: z.enum(['project', 'person', 'topic', 'course', 'meeting', 'org']),
        summary: z.string().describe('One sentence about what this is to the user.'),
        pageIds: z.array(z.string()).describe('Ids of the given pages that mention it.'),
      }),
    )
    .describe('Important projects, people, topics, courses and organizations. Reuse existing entity names exactly when they match.'),
  links: z
    .array(
      z.object({
        source: z.string().describe('Entity name or page id.'),
        target: z.string().describe('Entity name or page id.'),
        label: z.string().describe('Short relation, e.g. "part of", "uses", "taught in", "works with".'),
      }),
    )
    .describe('Meaningful relationships between entities and/or pages that are not obvious from the page tree.'),
  facts: z
    .array(
      z.object({
        text: z.string().describe('A durable, useful fact about the user, their work, progress or patterns, in second person ("You…").'),
        sourceIds: z.array(z.string()).describe('Page ids this fact comes from.'),
      }),
    )
    .describe('New facts worth remembering. Do not repeat existing facts. Include patterns like long-postponed tasks.'),
})

export interface ReflectBody {
  today: string
  pages: { id: string; title: string; kind: string; created: string; text: string; openTasks?: string[] }[]
  entities: { name: string; type: string }[]
  facts: string[]
}

export const Route = createFileRoute('/api/ai/reflect')({
  server: {
    handlers: {
      POST: withUser(async ({ request }) => {
        try {
          const b = (await request.json()) as ReflectBody
          const pages = b.pages
            .map((p) => `<page id="${p.id}" kind="${p.kind}" created="${p.created}" title="${p.title.replace(/"/g, "'")}">\n${p.text}${p.openTasks?.length ? `\nOpen tasks: ${p.openTasks.join('; ')}` : ''}\n</page>`)
            .join('\n\n')
          const out = await claudeJson(Reflection, {
            effort: 'high',
            system: `You maintain a personal knowledge graph and memory for the user of a notes app (a "second brain").
From the pages below, extract the entities that matter (projects, people, topics they study, courses, organizations), how they relate, and a few durable facts worth remembering.
- Be selective: 5-25 entities, only things that matter beyond one note. Skip generic words.
- Use existing entity names exactly when they refer to the same thing.
- Only use page ids that appear below.
- Facts must be grounded in the pages; never invent. Prefer facts that help plan the user's days (deadlines, long-postponed tasks, what they're learning, who they work with).`,
            messages: [
              {
                role: 'user',
                content: `Today is ${b.today}.\n\nExisting entities: ${b.entities.map((e) => `${e.name} (${e.type})`).join(', ') || 'none'}\n\nExisting facts:\n${b.facts.map((f) => `- ${f}`).join('\n') || 'none'}\n\nPages:\n${pages}`.slice(0, 180000),
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
