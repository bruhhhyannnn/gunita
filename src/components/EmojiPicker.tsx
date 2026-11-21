import { useEffect, useMemo, useState } from 'react'

interface Emoji {
  unicode: string
  label: string
  group?: number
  order?: number
  tags?: string[]
}

const GROUPS = ['Smileys', 'People', 'Body', 'Nature', 'Food', 'Travel', 'Activities', 'Objects', 'Symbols', 'Flags']
const RECENT_KEY = 'gunita:recent-emoji'

let cache: Emoji[] | null = null
async function loadEmoji(): Promise<Emoji[]> {
  if (cache) return cache
  const mod = (await import('emojibase-data/en/compact.json')) as unknown as { default: Emoji[] }
  cache = mod.default
    .filter((e) => e.group !== undefined && e.group !== 2)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  return cache
}

function recent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
  } catch {
    return []
  }
}

export function EmojiPicker({ onPick, onRemove }: { onPick: (emoji: string) => void; onRemove?: () => void }) {
  const [all, setAll] = useState<Emoji[]>(cache ?? [])
  const [q, setQ] = useState('')
  useEffect(() => {
    if (!cache) void loadEmoji().then(setAll)
  }, [])

  const groups = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (query) {
      return [
        {
          name: 'Results',
          items: all.filter((e) => e.label.includes(query) || e.tags?.some((t) => t.startsWith(query))).slice(0, 160),
        },
      ]
    }
    const out: { name: string; items: Emoji[] }[] = []
    const rec = recent()
    if (rec.length) out.push({ name: 'Recent', items: rec.map((u) => ({ unicode: u, label: u })) })
    GROUPS.forEach((name, i) => {
      if (i === 2) return
      out.push({ name, items: all.filter((e) => e.group === i) })
    })
    return out
  }, [all, q])

  const pick = (u: string) => {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify([u, ...recent().filter((r) => r !== u)].slice(0, 24)))
    } catch {
      /* ignore */
    }
    onPick(u)
  }

  return (
    <div className="w-[352px] p-2">
      <div className="flex gap-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search emoji…"
          className="h-8 flex-1 rounded-md border border-line bg-bg px-2 text-sm outline-none focus:border-accent"
        />
        <button
          className="h-8 rounded-md px-2 text-sm text-muted hover:bg-hover"
          onClick={() => {
            const pool = all.length ? all : [{ unicode: '📄', label: '' }]
            pick(pool[Math.floor(Math.random() * pool.length)].unicode)
          }}
        >
          Random
        </button>
        {onRemove && (
          <button className="h-8 rounded-md px-2 text-sm text-muted hover:bg-hover" onClick={onRemove}>
            Remove
          </button>
        )}
      </div>
      <div className="mt-2 h-72 overflow-y-auto">
        {all.length === 0 && <p className="p-2 text-sm text-muted">Loading…</p>}
        {groups.map((g) =>
          g.items.length ? (
            <div key={g.name}>
              <div className="sticky top-0 bg-popover px-1 py-1 text-xs text-faint">{g.name}</div>
              <div className="grid grid-cols-10">
                {g.items.map((e) => (
                  <button
                    key={g.name + e.unicode}
                    title={e.label}
                    onClick={() => pick(e.unicode)}
                    className="grid h-8 w-8 place-items-center rounded text-[20px] hover:bg-hover"
                  >
                    {e.unicode}
                  </button>
                ))}
              </div>
            </div>
          ) : null,
        )}
      </div>
    </div>
  )
}
