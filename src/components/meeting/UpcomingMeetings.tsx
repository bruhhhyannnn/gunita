import { CalendarClock, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useApp } from '#/lib/app'
import { meetingForEvent, type CalEvent } from '#/lib/actions'
import { useOpenPage } from '../Sidebar'

function timeLabel(e: CalEvent) {
  if (e.allDay) return 'All day'
  const d = new Date(e.start)
  const day = d.toDateString() === new Date().toDateString() ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' })
  return `${day} ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}

/** Today's and tomorrow's calendar events, each one click away from a prepared meeting note. */
export function UpcomingMeetings() {
  const { config } = useApp()
  const openPage = useOpenPage()
  const [events, setEvents] = useState<CalEvent[] | null>(null)
  useEffect(() => {
    if (!config?.calendarConnected || !navigator.onLine) return
    const from = new Date(Date.now() - 2 * 3600_000).toISOString()
    const end = new Date()
    end.setDate(end.getDate() + 2)
    end.setHours(0, 0, 0, 0)
    void fetch(`/api/calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(end.toISOString())}`)
      .then((r) => r.json() as Promise<{ events: CalEvent[] }>)
      .then((d) => setEvents(d.events))
      .catch(() => setEvents([]))
  }, [config?.calendarConnected])

  if (!config) return null
  if (!config.calendarConnected) {
    return (
      <a href="/api/auth/google?mode=calendar" className="flex items-center gap-3 rounded-xl border border-dashed border-line p-4 text-sm text-muted hover:bg-hover">
        <CalendarClock className="h-5 w-5" />
        Connect Google Calendar to get meeting notes ready before each meeting.
      </a>
    )
  }
  if (!events) return <p className="text-sm text-faint">Loading your calendar…</p>
  if (!events.length) return <p className="text-sm text-faint">No meetings today or tomorrow.</p>
  return (
    <div className="divide-y divide-[var(--border)] rounded-xl border border-line">
      {events.map((e) => (
        <button key={e.id} onClick={() => openPage(meetingForEvent(e))} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-hover">
          <span className="w-24 flex-none text-sm text-muted">{timeLabel(e)}</span>
          <span className="flex-1 truncate font-medium">{e.title}</span>
          {e.attendees.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-faint">
              <Users className="h-3.5 w-3.5" />
              {e.attendees.length}
            </span>
          )}
          <span className="text-xs text-accent">Open note →</span>
        </button>
      ))}
    </div>
  )
}
