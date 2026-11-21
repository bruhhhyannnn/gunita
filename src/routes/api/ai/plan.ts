import { createFileRoute } from '@tanstack/react-router'
import * as z from 'zod/v4'
import { withUser } from '#/server/auth'
import { aiError, claudeJson } from '#/server/ai'
import { listEvents } from '#/server/calendar'

const Plan = z.object({
  suggestions: z
    .array(
      z.object({
        text: z.string().describe('The task, written like the user writes tasks (short, lowercase is fine).'),
        reason: z.string().describe('Why now, in a few words, e.g. "meeting at 2pm", "due Friday", "you usually do this on Mondays".'),
      }),
    )
    .describe('0 to 6 suggestions, most important first.'),
})

export interface PlanBody {
  date: string
  weekday: string
  listTitle: string
  todayTasks: string[]
  carried: { text: string; carry: number; since?: string }[]
  recentDone: { day: string; text: string }[]
  habits: { text: string; count: number; onThisWeekday: number }[]
  deadlines: { date: string; text: string; page: string }[]
  actionItems: { text: string; source: string }[]
  memory: string[]
  tzOffset?: number
}

export const Route = createFileRoute('/api/ai/plan')({
  server: {
    handlers: {
      POST: withUser(async ({ request, user }) => {
        try {
          const b = (await request.json()) as PlanBody
          const offset = (b.tzOffset ?? 0) * 60_000
          const dayStart = new Date(new Date(b.date + 'T00:00:00Z').getTime() + offset)
          const events = (await listEvents(user.id, request, dayStart.toISOString(), new Date(dayStart.getTime() + 86400_000).toISOString()).catch(() => null)) ?? []
          const section = (title: string, lines: string[]) => (lines.length ? `## ${title}\n${lines.join('\n')}` : '')
          const prompt = [
            `Today is ${b.weekday}, ${b.date}. List: "${b.listTitle}".`,
            section('Already on today\'s list (do NOT suggest these again)', b.todayTasks.map((t) => `- ${t}`)),
            section('Unfinished tasks carried from earlier days', b.carried.map((c) => `- ${c.text} (carried ${c.carry}×${c.since ? `, since ${c.since}` : ''})`)),
            section("Today's calendar", events.map((e) => `- ${e.allDay ? 'all day' : new Date(e.start).toISOString().slice(11, 16) + ' UTC'}: ${e.title}${e.attendees.length ? ` with ${e.attendees.slice(0, 5).join(', ')}` : ''}`)),
            section('Upcoming dates mentioned in notes', b.deadlines.map((d) => `- ${d.date}: ${d.text} (in "${d.page}")`)),
            section('Open action items from meetings', b.actionItems.map((a) => `- ${a.text} (from "${a.source}")`)),
            section('Habits (how often a task appears; on this weekday)', b.habits.map((h) => `- ${h.text}: ${h.count} times total, ${h.onThisWeekday} times on ${b.weekday}s`)),
            section('Done in the last two weeks', b.recentDone.slice(-60).map((d) => `- ${d.day}: ${d.text}`)),
            section('Things the assistant remembers about the user', b.memory.slice(0, 30).map((m) => `- ${m}`)),
          ]
            .filter(Boolean)
            .join('\n\n')
          const out = await claudeJson(Plan, {
            effort: 'medium',
            system: `You are a calm, practical planning assistant inside a daily to-do app.
Suggest up to 6 tasks the user should add to TODAY's list, based on their calendar, deadlines in their notes, meeting action items and habits.
- Never repeat a task that is already on today's list, even reworded.
- Prefer concrete next actions ("prepare slides for Q4 NSED evaluation") over vague ones.
- Include prep for today's meetings and anything due within ~3 days.
- If a carried task has waited many days, you may suggest breaking it into a smaller first step.
- Write tasks the way the user writes them (short, plain, English). Fewer, better suggestions beat many.`,
            messages: [{ role: 'user', content: prompt.slice(0, 60000) }],
          })
          return Response.json({ suggestions: out.suggestions.slice(0, 6), calendar: events })
        } catch (e) {
          return aiError(e)
        }
      }),
    },
  },
})
