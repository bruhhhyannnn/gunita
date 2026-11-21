import { calendarAccessToken } from './google'

export interface CalEvent {
  id: string
  title: string
  start: string
  end: string
  allDay: boolean
  location?: string
  attendees: string[]
  description?: string
  link?: string
}

interface GEvent {
  id: string
  summary?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  location?: string
  description?: string
  htmlLink?: string
  status?: string
  attendees?: { email?: string; displayName?: string; self?: boolean; resource?: boolean }[]
}

/** Reads events from the user's primary Google Calendar (read-only scope). */
export async function listEvents(userId: string, request: Request, from: string, to: string): Promise<CalEvent[] | null> {
  const token = await calendarAccessToken(userId, request)
  if (!token) return null
  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
  url.searchParams.set('timeMin', from)
  url.searchParams.set('timeMax', to)
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('orderBy', 'startTime')
  url.searchParams.set('maxResults', '50')
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return null
  const data = (await res.json()) as { items?: GEvent[] }
  return (data.items ?? [])
    .filter((e) => e.status !== 'cancelled')
    .map((e) => ({
      id: e.id,
      title: e.summary || '(No title)',
      start: e.start?.dateTime || e.start?.date || '',
      end: e.end?.dateTime || e.end?.date || '',
      allDay: !e.start?.dateTime,
      location: e.location,
      description: e.description?.slice(0, 2000),
      link: e.htmlLink,
      attendees: (e.attendees ?? []).filter((a) => !a.self && !a.resource).map((a) => a.displayName || a.email || '').filter(Boolean),
    }))
}
