import { createFileRoute } from '@tanstack/react-router'
import { withUser } from '#/server/auth'
import { aiError, claudeText, FAST_MODEL, MAIN_MODEL, workersAiText } from '#/server/ai'

const SYSTEM = `You are the inline autocomplete inside a personal notes app (like Copilot, but for notes and to-do lists).
Given the text before and after the cursor, write the most likely short continuation the user is about to type.
Rules:
- Reply with ONLY the continuation text. No quotes, no explanations, no markdown.
- Continue mid-word or mid-sentence exactly where the cursor is; start with a space if a new word begins.
- Keep it short: finish the current sentence or list item (at most ~15 words). Never start a new paragraph.
- Match the user's style, casing and language (English). For a to-do item, write it like their other tasks.
- If nothing useful comes to mind, reply with an empty string.`

interface Body {
  before: string
  after?: string
  title?: string
  kind?: string
  hint?: string
  model?: 'claude-opus-5-5' | 'claude-haiku-5-5' | 'workers-ai'
  workersAiModel?: string
}

function clean(s: string, before: string) {
  let t = s.replace(/^\n+/, '').replace(/^["'`]+|["'`]+$/g, '').replace(/\n[\s\S]*$/, '').trimEnd()
  // Don't repeat what's already there.
  const tail = before.slice(-40)
  if (tail && t.startsWith(tail)) t = t.slice(tail.length)
  return t.slice(0, 160)
}

export const Route = createFileRoute('/api/ai/complete')({
  server: {
    handlers: {
      POST: withUser(async ({ request }) => {
        try {
          const b = (await request.json()) as Body
          const before = (b.before ?? '').slice(-2500)
          const after = (b.after ?? '').slice(0, 400)
          const user = [
            b.title ? `Page title: ${b.title}` : '',
            b.kind ? `Page type: ${b.kind}` : '',
            b.hint ? `Context:\n${b.hint.slice(0, 1500)}` : '',
            `Text before the cursor:\n<before>${before}</before>`,
            after ? `Text after the cursor:\n<after>${after}</after>` : '',
            'Continuation:',
          ]
            .filter(Boolean)
            .join('\n\n')
          let text: string
          if (b.model === 'workers-ai') {
            text = await workersAiText(b.workersAiModel || '@cf/meta/llama-3.3-70b-instruct-fp8-fast', SYSTEM, user)
          } else {
            text = await claudeText({
              model: b.model === 'claude-haiku-5-5' ? FAST_MODEL : MAIN_MODEL,
              effort: 'low',
              maxTokens: 2048,
              system: SYSTEM,
              messages: [{ role: 'user', content: user }],
              signal: request.signal,
            })
          }
          return Response.json({ text: clean(text, before) })
        } catch (e) {
          return aiError(e)
        }
      }),
    },
  },
})
