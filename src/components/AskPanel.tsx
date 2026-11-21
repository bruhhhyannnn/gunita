import { ArrowUp, Loader2, Sparkles, Square, Trash2, X } from 'lucide-react'
import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { getApp, useApp } from '#/lib/app'
import { isoDate, shortDate } from '#/lib/dates'
import { setUi } from '#/lib/ui'
import { PageIcon } from './PageIcon'
import { useOpenPage } from './Sidebar'

interface Msg {
  role: 'user' | 'assistant'
  content: string
  sources?: { n: number; id: string; title: string }[]
}

// Chat history lives in memory for the session, so it survives closing the panel.
let messages: Msg[] = []
let busy = false
let ctrl: AbortController | null = null
let snapshot = { messages, busy }
const listeners = new Set<() => void>()
const emit = () => {
  snapshot = { messages, busy }
  listeners.forEach((l) => l())
}
const setMessages = (m: Msg[]) => {
  messages = m
  emit()
}

function pickSources(question: string) {
  const { ws, index } = getApp()
  const pages = ws.getSnapshot().pages
  const words = question.toLowerCase().split(/\W+/).filter((w) => w.length > 2)
  const hits = index
    .query(question, 24)
    .filter((h) => pages[h.id] && ws.aiVisible(h.id))
    .slice(0, 8)
  return hits.map((h, i) => {
    const text = index.get(h.id)?.text ?? ''
    let chunk = text
    if (text.length > 6000) {
      // Keep the part of a long page that mentions the question's words.
      const lower = text.toLowerCase()
      const at = Math.max(0, Math.min(...words.map((w) => lower.indexOf(w)).filter((x) => x >= 0), text.length) - 1500)
      chunk = text.slice(at, at + 6000)
    }
    const p = pages[h.id]
    return { n: i + 1, id: h.id, title: p.title || 'Untitled', text: chunk, updated: shortDate(isoDate(new Date(p.updatedAt))) }
  })
}

export async function askQuestion(question: string) {
  if (busy || !question.trim()) return
  const { ws } = getApp()
  const sources = pickSources(question)
  const memory = Object.values(ws.getSnapshot().memory).map((m) => m.text).slice(0, 30)
  const history = messages.map((m) => ({ role: m.role, content: m.content }))
  setMessages([...messages, { role: 'user', content: question }, { role: 'assistant', content: '', sources: sources.map(({ n, id, title }) => ({ n, id, title })) }])
  busy = true
  ctrl = new AbortController()
  emit()
  try {
    if (!navigator.onLine) throw new Error('Ask needs an internet connection.')
    const res = await fetch('/api/ai/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, history, sources, memory, date: isoDate() }),
      signal: ctrl.signal,
    })
    if (!res.ok || !res.body) {
      const msg = ((await res.json().catch(() => ({}))) as { error?: string }).error
      throw new Error(msg || `Request failed (${res.status})`)
    }
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let acc = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      acc += dec.decode(value, { stream: true })
      const last = messages[messages.length - 1]
      setMessages([...messages.slice(0, -1), { ...last, content: acc }])
    }
  } catch (e) {
    if ((e as Error).name !== 'AbortError') {
      const last = messages[messages.length - 1]
      setMessages([...messages.slice(0, -1), { ...last, content: (last.content ? last.content + '\n\n' : '') + `_${(e as Error).message}_` }])
    }
  } finally {
    busy = false
    ctrl = null
    emit()
  }
}

function useChat() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => snapshot,
    () => snapshot,
  )
}

/** Minimal, safe Markdown: paragraphs, lists, headings, bold/italic/code, links and [n] citations. */
function Markdown({ text, onCite }: { text: string; onCite: (n: number) => ReactNode }) {
  const inline = (s: string, key: string): ReactNode[] => {
    const out: ReactNode[] = []
    const re = /(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|`[^`]+`|\[\d+\]|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g
    let last = 0
    let m: RegExpExecArray | null
    let i = 0
    while ((m = re.exec(s))) {
      if (m.index > last) out.push(s.slice(last, m.index))
      const t = m[0]
      const k = `${key}-${i++}`
      if (t.startsWith('**')) out.push(<strong key={k}>{t.slice(2, -2)}</strong>)
      else if (t.startsWith('`')) out.push(<code key={k} className="rounded bg-hover px-1 text-[0.9em]">{t.slice(1, -1)}</code>)
      else if (/^\[\d+\]$/.test(t)) out.push(<Fragment key={k}>{onCite(Number(t.slice(1, -1)))}</Fragment>)
      else if (t.startsWith('[')) {
        const [, label, href] = t.match(/^\[([^\]]+)\]\(([^)]+)\)$/) ?? []
        out.push(
          <a key={k} href={href} target="_blank" rel="noreferrer" className="underline">
            {label}
          </a>,
        )
      } else out.push(<em key={k}>{t.slice(1, -1)}</em>)
      last = m.index + t.length
    }
    if (last < s.length) out.push(s.slice(last))
    return out
  }
  const blocks = text.split(/\n{2,}/)
  return (
    <>
      {blocks.map((b, bi) => {
        const lines = b.split('\n')
        if (lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l))) {
          const ordered = /^\s*\d+\./.test(lines[0])
          const items = lines.map((l, li) => <li key={li}>{inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ''), `${bi}-${li}`)}</li>)
          return ordered ? (
            <ol key={bi} className="my-1.5 list-decimal pl-5">
              {items}
            </ol>
          ) : (
            <ul key={bi} className="my-1.5 list-disc pl-5">
              {items}
            </ul>
          )
        }
        const h = b.match(/^(#{1,3})\s+(.*)$/)
        if (h) return <p key={bi} className="mt-2 font-semibold">{inline(h[2], `${bi}`)}</p>
        return (
          <p key={bi} className="my-1.5 whitespace-pre-wrap">
            {inline(b, `${bi}`)}
          </p>
        )
      })}
    </>
  )
}

export function AskPanel() {
  const { messages: chat, busy } = useChat()
  const { config } = useApp()
  const [q, setQ] = useState('')
  const openPage = useOpenPage()
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  }, [chat])

  const submit = () => {
    const question = q.trim()
    if (!question) return
    setQ('')
    void askQuestion(question)
  }

  return (
    <aside className="fixed inset-0 z-40 flex flex-col bg-bg sm:static sm:inset-auto sm:z-auto sm:w-[400px] sm:flex-none sm:border-l sm:border-line">
      <div className="flex h-11 flex-none items-center gap-2 border-b border-line px-3">
        <Sparkles className="h-4 w-4 text-[#a371f7]" />
        <span className="font-medium">Ask my notes</span>
        <div className="flex-1" />
        {chat.length > 0 && (
          <button title="Clear chat" className="rounded p-1 text-faint hover:bg-hover" onClick={() => setMessages([])}>
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        <button title="Close (Ctrl J)" className="rounded p-1 text-faint hover:bg-hover" onClick={() => setUi({ askOpen: false })}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <div ref={scroller} className="flex-1 overflow-y-auto px-4 py-3 text-[14.5px] leading-relaxed">
        {chat.length === 0 && (
          <div className="mt-8 text-center text-sm text-muted">
            <p>Ask anything about your notes, tasks and meetings.</p>
            <div className="mt-4 space-y-1.5">
              {["What's blocking me this week?", 'What did I write about EBS?', 'Summarize my last meeting'].map((s) => (
                <button key={s} onClick={() => void askQuestion(s)} className="block w-full rounded-md border border-line px-3 py-2 text-left hover:bg-hover">
                  {s}
                </button>
              ))}
            </div>
            {config && !config.claudeConfigured && <p className="mt-6 text-xs text-faint">Claude isn't configured on the server yet.</p>}
            <p className="mt-6 text-xs text-faint">Pages marked “Hide from AI” are never sent.</p>
          </div>
        )}
        {chat.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="mb-3 ml-8 rounded-xl bg-hover px-3 py-2">
              {m.content}
            </div>
          ) : (
            <div key={i} className="mb-4">
              {m.content ? (
                <Markdown
                  text={m.content}
                  onCite={(n) => {
                    const s = m.sources?.find((x) => x.n === n)
                    return s ? (
                      <button onClick={() => openPage(s.id)} title={s.title} className="mx-0.5 rounded bg-accent-soft px-1 text-[11px] font-medium text-accent align-[1px]">
                        {n}
                      </button>
                    ) : (
                      `[${n}]`
                    )
                  }}
                />
              ) : (
                <Loader2 className="h-4 w-4 animate-spin text-faint" />
              )}
              {m.content && m.sources && m.sources.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {m.sources
                    .filter((s) => m.content.includes(`[${s.n}]`))
                    .map((s) => {
                      const p = getApp().ws.page(s.id)
                      return (
                        <button key={s.n} onClick={() => openPage(s.id)} className="flex max-w-full items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-xs text-muted hover:bg-hover">
                          <span className="text-accent">{s.n}</span>
                          <PageIcon icon={p?.icon} kind={p?.kind} size={13} />
                          <span className="truncate">{s.title}</span>
                        </button>
                      )
                    })}
                </div>
              )}
            </div>
          ),
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className="flex-none border-t border-line p-3"
      >
        <div className="flex items-end gap-2 rounded-xl border border-line bg-popover px-3 py-2 focus-within:border-accent">
          <textarea
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            rows={1}
            placeholder="Ask about your notes…"
            className="max-h-40 flex-1 resize-none bg-transparent outline-none placeholder:text-faint"
          />
          {busy ? (
            <button type="button" onClick={() => ctrl?.abort()} className="grid h-7 w-7 place-items-center rounded-full bg-fg text-bg" title="Stop">
              <Square className="h-3 w-3" />
            </button>
          ) : (
            <button type="submit" disabled={!q.trim()} className="grid h-7 w-7 place-items-center rounded-full bg-accent text-white disabled:opacity-40" title="Send">
              <ArrowUp className="h-4 w-4" />
            </button>
          )}
        </div>
      </form>
    </aside>
  )
}
