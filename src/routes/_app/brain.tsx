import { createFileRoute } from '@tanstack/react-router'
import { Brain as BrainIcon, Check, ExternalLink, Loader2, Pause, Pin, PinOff, Play, Plus, Search, Sparkles, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getApp, useApp, useIndexVersion, useWs } from '#/lib/app'
import { buildGraph, NODE_COLORS, TYPE_LABELS, type GNode } from '#/lib/graph'
import { shortDate, timeAgo } from '#/lib/dates'
import { newId } from '#/lib/ids'
import { reflect } from '#/ai/reflect'
import { BrainGraph } from '#/components/brain/BrainGraph'
import { PageIcon } from '#/components/PageIcon'
import { useOpenPage } from '#/components/Sidebar'
import { toast } from '#/components/ui/toast'
import { cn } from '#/components/ui/cn'
import { useDocumentTitle } from '#/lib/title'

export const Route = createFileRoute('/_app/brain')({ component: BrainPage })

function useReflect() {
  const [busy, setBusy] = useState(false)
  const run = async (full = false) => {
    setBusy(true)
    try {
      const r = await reflect({ full })
      toast(r.entities + r.links + r.facts ? `Brain updated: ${r.entities} new topics, ${r.links} links, ${r.facts} memories.` : 'Your brain is up to date.')
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return { busy, run }
}

function BrainPage() {
  useDocumentTitle('Brain')
  const [tab, setTab] = useState<'graph' | 'memory'>('graph')
  const { config } = useApp()
  const { busy, run } = useReflect()
  const last = useWs((s) => s.settings.lastReflectAt)
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 flex-none items-center gap-3 border-b border-line px-4">
        <BrainIcon className="h-5 w-5 text-[#a98bff]" />
        <span className="font-semibold">Brain</span>
        <div className="ml-2 flex rounded-md bg-hover p-0.5 text-sm">
          {(['graph', 'memory'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cn('rounded px-3 py-1 capitalize', tab === t ? 'bg-bg shadow-sm' : 'text-muted')}>
              {t}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <span className="hidden text-xs text-faint sm:inline">{last ? `Updated ${timeAgo(last)}` : 'Not built yet'}</span>
        <button
          onClick={() => void run(!last)}
          disabled={busy || !config?.claudeConfigured}
          title={config?.claudeConfigured ? 'Read recent notes and update topics, links and memories' : 'Needs Claude to be configured'}
          className="flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Update my brain
        </button>
      </div>
      {tab === 'graph' ? <GraphTab /> : <MemoryTab />}
    </div>
  )
}

function GraphTab() {
  const { index } = useApp()
  const version = useIndexVersion()
  const snapVersion = useWs((s) => s.version)
  const full = useMemo(
    () => buildGraph(getApp().ws.getSnapshot(), (id) => index.get(id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapVersion, version],
  )
  const dates = useMemo(() => [...new Set(full.nodes.map((n) => n.date))].sort(), [full])
  const [cut, setCut] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [flat, setFlat] = useState(false)
  const [brainShape, setBrainShape] = useState(true)
  const [q, setQ] = useState('')
  const cutoff = cut === null ? dates.at(-1) : dates[cut]

  const shown = useMemo(() => {
    if (!cutoff) return full
    const nodes = full.nodes.filter((n) => n.date <= cutoff)
    const ids = new Set(nodes.map((n) => n.id))
    return { nodes, links: full.links.filter((l) => ids.has(l.source) && ids.has(l.target)) }
  }, [full, cutoff])

  // Timeline playback: grow the brain from your first note to today.
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (!playing) return
    let i = 0
    setCut(0)
    timer.current = setInterval(() => {
      i++
      if (i >= dates.length) {
        setPlaying(false)
        setCut(null)
        return
      }
      setCut(i)
    }, Math.max(120, 6000 / Math.max(1, dates.length)))
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [playing, dates.length])

  const node = full.nodes.find((n) => n.id === selected) ?? null
  const matches = q.trim() ? full.nodes.filter((n) => n.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : []
  const types = [...new Set(full.nodes.map((n) => n.type))]

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-[#07090d] text-white">
      {full.nodes.length > 0 && <BrainGraph nodes={shown.nodes} links={shown.links} selected={selected} onSelect={setSelected} flat={flat} brainShape={brainShape} />}
      {full.nodes.length === 0 && <p className="absolute inset-0 grid place-items-center text-white/60">Write a few notes and your brain will start to grow.</p>}

      <div className="absolute left-3 top-3 w-64 space-y-2">
        <div className="flex items-center gap-2 rounded-lg bg-white/10 px-2 backdrop-blur">
          <Search className="h-4 w-4 text-white/50" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find in your brain…" className="h-8 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40" />
        </div>
        {matches.length > 0 && (
          <div className="rounded-lg bg-black/70 p-1 text-sm backdrop-blur">
            {matches.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setSelected(m.id)
                  setQ('')
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-white/10"
              >
                <span className="h-2 w-2 rounded-full" style={{ background: NODE_COLORS[m.type] }} />
                <span className="truncate">{m.name}</span>
              </button>
            ))}
          </div>
        )}
        <div className="rounded-lg bg-black/50 p-2 text-xs text-white/70 backdrop-blur">
          {types.map((t) => (
            <div key={t} className="flex items-center gap-2 py-0.5">
              <span className="h-2 w-2 rounded-full" style={{ background: NODE_COLORS[t] }} />
              {TYPE_LABELS[t] ?? t}
            </div>
          ))}
          <div className="mt-1.5 border-t border-white/10 pt-1.5">
            <div>— your links</div>
            <div className="text-[#a98bff]">·· AI suggestion (confirm it)</div>
          </div>
          <label className="mt-1.5 flex items-center gap-2">
            <input type="checkbox" checked={brainShape} onChange={(e) => setBrainShape(e.target.checked)} /> Brain shape
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={flat} onChange={(e) => setFlat(e.target.checked)} /> Flat (2D)
          </label>
        </div>
      </div>

      {node && <NodePanel node={node} onClose={() => setSelected(null)} onSelect={setSelected} />}

      {dates.length > 1 && (
        <div className="absolute inset-x-3 bottom-3 flex items-center gap-3 rounded-lg bg-black/60 px-3 py-2 text-xs backdrop-blur sm:left-1/2 sm:w-[560px] sm:-translate-x-1/2">
          <button onClick={() => setPlaying((p) => !p)} className="grid h-7 w-7 place-items-center rounded-full bg-white/15 hover:bg-white/25" title="Replay how your brain grew">
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          <span className="w-20 text-white/60">{shortDate(dates[0])}</span>
          <input
            type="range"
            min={0}
            max={dates.length - 1}
            value={cut ?? dates.length - 1}
            onChange={(e) => {
              setPlaying(false)
              const v = Number(e.target.value)
              setCut(v === dates.length - 1 ? null : v)
            }}
            className="flex-1 accent-[#a98bff]"
          />
          <span className="w-24 text-right font-medium">{cutoff ? shortDate(cutoff) : ''}</span>
          <span className="w-16 text-right text-white/50">{shown.nodes.length} nodes</span>
        </div>
      )}
    </div>
  )
}

function NodePanel({ node, onClose, onSelect }: { node: GNode; onClose: () => void; onSelect: (id: string) => void }) {
  const openPage = useOpenPage()
  const links = useWs((s) => Object.values(s.links).filter((l) => l.source === node.id || l.target === node.id))
  const pages = useWs((s) => s.pages)
  const entities = useWs((s) => s.entities)
  const entity = entities[node.id]
  const name = (id: string) => pages[id]?.title || entities[id]?.name || 'Untitled'
  const { ws } = getApp()
  return (
    <div className="absolute bottom-16 right-3 top-3 w-80 overflow-y-auto rounded-xl bg-black/70 p-4 text-sm backdrop-blur">
      <div className="flex items-start gap-2">
        <span className="mt-1.5 h-2.5 w-2.5 flex-none rounded-full" style={{ background: NODE_COLORS[node.type] }} />
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold">{node.name}</div>
          <div className="text-xs text-white/50">
            {TYPE_LABELS[node.type] ?? node.type} · since {shortDate(node.date)} · {node.degree} connections
          </div>
        </div>
        <button onClick={onClose} className="rounded p-1 text-white/60 hover:bg-white/10">
          <X className="h-4 w-4" />
        </button>
      </div>
      {node.summary && <p className="mt-3 text-white/80">{node.summary}</p>}
      {node.pageId && (
        <button onClick={() => openPage(node.pageId!)} className="mt-3 flex items-center gap-1.5 rounded-md bg-white/15 px-3 py-1.5 hover:bg-white/25">
          <ExternalLink className="h-3.5 w-3.5" /> Open page
        </button>
      )}
      {entity && entity.pageIds.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-xs text-white/50">Mentioned in</div>
          {entity.pageIds
            .filter((id) => pages[id])
            .map((id) => (
              <button key={id} onClick={() => openPage(id)} className="flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-white/10">
                <PageIcon icon={pages[id].icon} kind={pages[id].kind} size={15} />
                <span className="truncate">{pages[id].title || 'Untitled'}</span>
              </button>
            ))}
        </div>
      )}
      {links.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-xs text-white/50">Connections</div>
          {links.map((l) => {
            const other = l.source === node.id ? l.target : l.source
            return (
              <div key={l.id} className="flex items-center gap-1.5 rounded px-1 py-1 hover:bg-white/10">
                <button onClick={() => onSelect(other)} className="min-w-0 flex-1 truncate text-left">
                  <span className="text-white/50">{l.label} </span>
                  {name(other)}
                </button>
                {l.confirmed || l.origin === 'user' ? (
                  <Check className="h-3.5 w-3.5 text-[#5fd38d]" />
                ) : (
                  <button title="Confirm this link" onClick={() => ws.links.set(l.id, { ...l, confirmed: true })} className="rounded bg-[#a98bff]/30 px-1.5 text-xs hover:bg-[#a98bff]/50">
                    Confirm
                  </button>
                )}
                <button title="Remove link" onClick={() => ws.links.delete(l.id)} className="rounded p-0.5 text-white/40 hover:text-white">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}
      {entity && (
        <button
          onClick={() => {
            if (!confirm(`Remove "${entity.name}" from your brain?`)) return
            ws.doc.transact(() => {
              ws.entities.delete(entity.id)
              for (const l of links) ws.links.delete(l.id)
            })
            onClose()
          }}
          className="mt-6 flex items-center gap-1.5 text-xs text-white/50 hover:text-white"
        >
          <Trash2 className="h-3.5 w-3.5" /> Forget this topic
        </button>
      )}
    </div>
  )
}

function MemoryTab() {
  const facts = useWs((s) => Object.values(s.memory).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt))
  const pages = useWs((s) => s.pages)
  const openPage = useOpenPage()
  const [draft, setDraft] = useState('')
  const { ws } = getApp()
  const add = () => {
    if (!draft.trim()) return
    const id = 'm_' + newId()
    ws.memory.set(id, { id, text: draft.trim(), sourceIds: [], createdAt: Date.now(), updatedAt: Date.now(), origin: 'user', pinned: true })
    setDraft('')
  }
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[760px] px-6 py-8">
        <h2 className="text-2xl font-bold">What I remember about you</h2>
        <p className="mt-1 text-sm text-muted">
          The AI uses these when it plans your day and answers questions. Edit, pin or delete anything. Pinned memories are always used.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
          className="mt-5 flex gap-2"
        >
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Tell it something to remember, e.g. “I report to the CWA every Friday”" className="h-9 flex-1 rounded-md border border-line bg-bg px-3 text-sm outline-none focus:border-accent" />
          <button className="flex h-9 items-center gap-1 rounded-md bg-accent px-3 text-sm font-medium text-white">
            <Plus className="h-4 w-4" /> Add
          </button>
        </form>
        <div className="mt-6 divide-y divide-[var(--border)]">
          {facts.length === 0 && <p className="py-6 text-sm text-faint">Nothing yet. Press “Update my brain” to let the AI read your notes.</p>}
          {facts.map((f) => (
            <div key={f.id} className="group flex items-start gap-3 py-3">
              <span className={cn('mt-1 text-xs', f.origin === 'ai' ? 'text-[#a98bff]' : 'text-accent')}>{f.origin === 'ai' ? '✨' : '✍️'}</span>
              <div className="min-w-0 flex-1">
                <textarea
                  defaultValue={f.text}
                  rows={1}
                  onBlur={(e) => e.target.value.trim() !== f.text && ws.memory.set(f.id, { ...f, text: e.target.value.trim(), updatedAt: Date.now() })}
                  className="w-full resize-none bg-transparent outline-none [field-sizing:content]"
                />
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-faint">
                  {timeAgo(f.updatedAt)}
                  {f.sourceIds
                    .filter((id) => pages[id])
                    .map((id) => (
                      <button key={id} onClick={() => openPage(id)} className="flex items-center gap-1 rounded border border-line px-1 hover:bg-hover">
                        <PageIcon icon={pages[id].icon} kind={pages[id].kind} size={12} />
                        {pages[id].title || 'Untitled'}
                      </button>
                    ))}
                </div>
              </div>
              <button title={f.pinned ? 'Unpin' : 'Pin'} onClick={() => ws.memory.set(f.id, { ...f, pinned: !f.pinned })} className={cn('rounded p-1 hover:bg-hover', f.pinned ? 'text-accent' : 'text-faint opacity-0 group-hover:opacity-100')}>
                {f.pinned ? <Pin className="h-4 w-4" /> : <PinOff className="h-4 w-4" />}
              </button>
              <button title="Forget" onClick={() => ws.memory.delete(f.id)} className="rounded p-1 text-faint opacity-0 hover:bg-hover hover:text-danger group-hover:opacity-100">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
