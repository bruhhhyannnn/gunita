/** Local calendar date as YYYY-MM-DD. */
export function isoDate(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function addDays(iso: string, n: number): string {
  const d = parseIso(iso)
  d.setDate(d.getDate() + n)
  return isoDate(d)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / 86400_000)
}

const SHORT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
const LONG = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
const WITH_YEAR = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export function shortDate(iso: string) {
  const d = parseIso(iso)
  return d.getFullYear() === new Date().getFullYear() ? SHORT.format(d) : WITH_YEAR.format(d)
}

export function longDate(iso: string) {
  return LONG.format(parseIso(iso))
}

/** "Today", "Yesterday", "Tomorrow", "Last Monday", or "Nov 12". Mirrors Notion's date mentions. */
export function relativeDate(iso: string, today = isoDate()): string {
  const diff = daysBetween(today, iso)
  if (diff === 0) return 'Today'
  if (diff === -1) return 'Yesterday'
  if (diff === 1) return 'Tomorrow'
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(parseIso(iso))
  if (diff < 0 && diff >= -7) return `Last ${weekday}`
  if (diff > 0 && diff < 7) return weekday
  return shortDate(iso)
}

export function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return shortDate(isoDate(new Date(ts)))
}
