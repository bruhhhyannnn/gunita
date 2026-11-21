/** Browser-side helpers for the /api/ai/* endpoints. */

export class AiError extends Error {}

export async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  if (!navigator.onLine) throw new AiError('AI needs an internet connection.')
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) {
    const msg = ((await res.json().catch(() => ({}))) as { error?: string }).error
    throw new AiError(msg || `AI request failed (${res.status})`)
  }
  return (await res.json()) as T
}

export async function polishReport(text: string): Promise<string> {
  const r = await postJson<{ text: string }>('/api/ai/report', { text })
  return r.text
}
