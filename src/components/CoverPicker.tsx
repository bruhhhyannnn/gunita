import { useEffect, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import type { Cover } from '#/lib/types'
import { pickFile, uploadFile } from '#/editor/uploads'
import { cn } from './ui/cn'
import { toast } from './ui/toast'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { searchArt, type Art } from '#/lib/art'

export const GRADIENTS = [
  'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
  'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)',
  'linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%)',
  'linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%)',
  'linear-gradient(135deg, #434343 0%, #000000 100%)',
  'linear-gradient(135deg, #0f2027 0%, #2c5364 100%)',
  'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
  'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
]

const PRESETS = ['Bierstadt', 'Degas', 'Monet', 'Van Gogh', 'Hokusai', 'landscape', 'mountains', 'ocean', 'garden', 'night']

const artCache = new Map<string, { items: Art[]; source: string; error?: string }>()

export function CoverPicker({ onPick, onRemove }: { onPick: (c: Cover) => void; onRemove?: () => void }) {
  const [tab, setTab] = useState<'gallery' | 'colors' | 'upload' | 'link'>('gallery')
  const [q, setQ] = useState('Bierstadt')
  const [result, setResult] = useState<{ items: Art[]; source: string; error?: string }>(() => artCache.get('Bierstadt') ?? { items: [], source: '' })
  const [loading, setLoading] = useState(false)
  const [link, setLink] = useState('')
  const art = result.items

  const search = async (query: string) => {
    const key = query.trim().toLowerCase()
    if (!key) return
    const hit = artCache.get(key)
    if (hit) {
      setResult(hit)
      return
    }
    if (!navigator.onLine) {
      setResult({ items: [], source: '', error: 'The gallery needs an internet connection. You can still pick a color or upload an image later.' })
      return
    }
    setLoading(true)
    const r = await searchArt(query)
    if (r.items.length) artCache.set(key, r)
    setResult(r)
    setLoading(false)
  }

  useEffect(() => {
    if (tab === 'gallery' && !art.length) void search(q)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  return (
    <div className="w-[min(540px,calc(100vw-24px))]">
      <div className="flex items-center gap-1 border-b border-line px-2 pt-1.5">
        {(['gallery', 'colors', 'upload', 'link'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn('border-b-2 px-2 py-1.5 text-sm capitalize', tab === t ? 'border-fg text-fg' : 'border-transparent text-muted')}
          >
            {t === 'gallery' ? 'Art gallery' : t}
          </button>
        ))}
        <div className="flex-1" />
        {onRemove && (
          <button onClick={onRemove} className="px-2 py-1.5 text-sm text-muted hover:text-fg">
            Remove
          </button>
        )}
      </div>
      <div className="p-3">
        {tab === 'gallery' && (
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void search(q)
              }}
              className="flex items-center gap-2 rounded-md border border-line bg-bg px-2"
            >
              <Search className="h-4 w-4 text-faint" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search public-domain paintings…"
                className="h-8 flex-1 bg-transparent text-sm outline-none"
              />
              {loading && <Loader2 className="h-4 w-4 animate-spin text-faint" />}
            </form>
            <div className="mt-2 flex flex-wrap gap-1">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setQ(p)
                    void search(p)
                  }}
                  className="rounded-full bg-hover px-2 py-0.5 text-xs text-muted hover:bg-active"
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="mt-3 grid max-h-72 grid-cols-3 gap-2 overflow-y-auto">
              {art.map((a) => (
                <button
                  key={a.id}
                  title={`${a.title} — ${a.artist}`}
                  onClick={() => onPick({ kind: 'image', value: a.full, y: 50, credit: a.credit })}
                  className="group relative h-20 overflow-hidden rounded-md bg-hover"
                >
                  <img src={a.thumb} alt={a.title} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                </button>
              ))}
              {!loading && art.length === 0 && (
                <div className="col-span-3 py-6 text-center text-sm text-muted">
                  {result.error ? (
                    <>
                      <p>Couldn't load paintings right now.</p>
                      <p className="mt-1 text-xs text-faint">{result.error}</p>
                      <Button size="sm" className="mt-3" onClick={() => void search(q)}>
                        Try again
                      </Button>
                    </>
                  ) : (
                    'No paintings found. Try another word.'
                  )}
                </div>
              )}
            </div>
            <p className="mt-2 text-[11px] text-faint">Public-domain works{result.source ? ` from ${result.source}` : ''}.</p>
          </>
        )}
        {tab === 'colors' && (
          <div className="grid grid-cols-4 gap-2">
            {GRADIENTS.map((g) => (
              <button key={g} onClick={() => onPick({ kind: 'gradient', value: g })} className="h-16 rounded-md" style={{ background: g }} />
            ))}
          </div>
        )}
        {tab === 'upload' && (
          <button
            className="h-24 w-full rounded-md border border-dashed border-line text-sm text-muted hover:bg-hover"
            onClick={async () => {
              const f = await pickFile('image/*')
              if (!f) return
              try {
                const up = await uploadFile(f)
                onPick({ kind: 'image', value: up.url, y: 50 })
              } catch (e) {
                toast((e as Error).message)
              }
            }}
          >
            Upload an image (max 20 MB)
          </button>
        )}
        {tab === 'link' && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (link.trim()) onPick({ kind: 'image', value: link.trim(), y: 50 })
            }}
            className="flex gap-2"
          >
            <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste an image link…" className="flex-1" />
            <Button type="submit" variant="primary" size="sm" className="h-8">
              Submit
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
