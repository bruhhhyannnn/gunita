import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import type * as z from 'zod/v4'
import { env } from './env'

export const MAIN_MODEL = 'claude-opus-5-5'
export const FAST_MODEL = 'claude-haiku-5-5'
const FALLBACK_BETA = 'server-side-fallback-2026-07-01'

export class AiUnavailable extends Error {
  status = 503
}

export function claude() {
  if (!env.ANTHROPIC_API_KEY) {
    throw new AiUnavailable("Claude isn't set up yet. Add ANTHROPIC_API_KEY as a Worker secret (see README).")
  }
  // ANTHROPIC_BASE_URL is only for local testing against a mock server.
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}) })
}

type Effort = 'low' | 'medium' | 'high'

interface TextOpts {
  system: string
  messages: Anthropic.Beta.BetaMessageParam[]
  model?: string
  effort?: Effort
  maxTokens?: number
  signal?: AbortSignal
}

function checkRefusal(stop: string | null) {
  if (stop === 'refusal') throw new Error('The AI declined this request.')
}

/** One Claude call that returns plain text. Opus 5.5 always thinks; effort controls how much. */
export async function claudeText(o: TextOpts): Promise<string> {
  const res = await claude().beta.messages.create(
    {
      model: o.model ?? MAIN_MODEL,
      max_tokens: o.maxTokens ?? 16000,
      system: o.system,
      messages: o.messages,
      output_config: { effort: o.effort ?? 'medium' },
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
    },
    { signal: o.signal },
  )
  checkRefusal(res.stop_reason)
  return res.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
}

/** One Claude call that returns JSON matching a Zod schema (structured outputs). */
export async function claudeJson<S extends z.ZodType>(schema: S, o: TextOpts): Promise<z.infer<S>> {
  const res = await claude().beta.messages.parse(
    {
      model: o.model ?? MAIN_MODEL,
      max_tokens: o.maxTokens ?? 16000,
      system: o.system,
      messages: o.messages,
      output_config: { effort: o.effort ?? 'medium', format: betaZodOutputFormat(schema) },
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
    },
    { signal: o.signal },
  )
  checkRefusal(res.stop_reason)
  if (res.parsed_output == null) throw new Error('The AI returned an unexpected answer. Try again.')
  return res.parsed_output as z.infer<S>
}

/** Streams plain text deltas from Claude as a text/plain Response body. */
export function claudeStream(o: TextOpts): Response {
  const stream = claude().beta.messages.stream(
    {
      model: o.model ?? MAIN_MODEL,
      max_tokens: o.maxTokens ?? 32000,
      system: o.system,
      messages: o.messages,
      output_config: { effort: o.effort ?? 'medium' },
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
    },
    { signal: o.signal },
  )
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const ev of stream) {
          if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') controller.enqueue(enc.encode(ev.delta.text))
        }
        const final = await stream.finalMessage()
        if (final.stop_reason === 'refusal') controller.enqueue(enc.encode('\n\n_The AI declined to answer this._'))
      } catch (e) {
        controller.enqueue(enc.encode(`\n\n_Error: ${(e as Error).message}_`))
      } finally {
        controller.close()
      }
    },
    cancel() {
      stream.abort()
    },
  })
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
}

/** Free option for inline suggestions: Cloudflare Workers AI (daily free allowance). */
export async function workersAiText(model: string, system: string, user: string, maxTokens = 60): Promise<string> {
  if (!env.AI) throw new AiUnavailable('Workers AI is not enabled. Add an "ai" binding in wrangler.jsonc.')
  const out = (await env.AI.run(model as Parameters<NonNullable<typeof env.AI>['run']>[0], {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: maxTokens,
  } as never)) as { response?: string }
  return (out.response ?? '').trim()
}

export function aiError(e: unknown): Response {
  if (e instanceof AiUnavailable) return Response.json({ error: e.message }, { status: 503 })
  if (e instanceof Anthropic.RateLimitError) return Response.json({ error: 'AI is busy (rate limited). Try again in a moment.' }, { status: 429 })
  if (e instanceof Anthropic.AuthenticationError) return Response.json({ error: 'The Anthropic API key was rejected.' }, { status: 502 })
  if (e instanceof Anthropic.APIError) return Response.json({ error: `AI error (${e.status}): ${e.message}` }, { status: 502 })
  if (e instanceof Error && e.name === 'AbortError') return Response.json({ error: 'Cancelled' }, { status: 499 })
  return Response.json({ error: (e as Error).message || 'AI request failed' }, { status: 500 })
}

export function today(tzOffsetMin?: number) {
  const d = new Date(Date.now() - (tzOffsetMin ?? 0) * 60_000)
  return d.toISOString().slice(0, 10)
}
