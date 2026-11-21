import { getApp } from './app'
import { newId, shortId } from './ids'
import type { DatabaseSchema, PageKind, TemplateItem } from './types'

export function defaultDatabase(): DatabaseSchema {
  const status = shortId()
  return {
    props: [
      { id: 'title', name: 'Name', type: 'title' },
      {
        id: status,
        name: 'Status',
        type: 'status',
        options: [
          { id: shortId(), name: 'Not started', color: 'gray' },
          { id: shortId(), name: 'In progress', color: 'blue' },
          { id: shortId(), name: 'Done', color: 'green' },
        ],
      },
      { id: shortId(), name: 'Tags', type: 'multiSelect', options: [] },
      { id: shortId(), name: 'Date', type: 'date' },
    ],
    views: [{ id: shortId(), name: 'Table', type: 'table' }],
  }
}

export function defaultWorkTemplate(): TemplateItem[] {
  return [
    { id: newId(), text: 'check emails', repeat: { kind: 'daily' } },
    { id: newId(), text: 'check new potential jobs on csc', repeat: { kind: 'daily' } },
    { id: newId(), text: 'add things on CWA work accomplishment', repeat: { kind: 'daily' } },
  ]
}

export function createPageOfKind(
  kind: PageKind,
  opts: { parentId?: string | null; title?: string; after?: string | null } = {},
): string {
  const { ws } = getApp()
  if (kind === 'database') {
    return ws.createPage({ kind, parentId: opts.parentId ?? null, title: opts.title ?? '', db: defaultDatabase(), after: opts.after })
  }
  if (kind === 'todo') {
    return ws.createPage({
      kind,
      parentId: opts.parentId ?? null,
      title: opts.title ?? 'TODO',
      icon: '☀️',
      template: [],
      autoStart: true,
      after: opts.after,
    })
  }
  if (kind === 'meeting') {
    return ws.createPage({
      kind,
      parentId: opts.parentId ?? meetingsFolder(),
      title: opts.title ?? '',
      icon: '🗓️',
      meeting: { start: new Date().toISOString() },
      after: opts.after,
    })
  }
  return ws.createPage({ kind, parentId: opts.parentId ?? null, title: opts.title ?? '', after: opts.after })
}

/** Meeting notes live under a "Meetings" page so they don't clutter the sidebar. */
export function meetingsFolder(): string {
  const { ws } = getApp()
  const existing = ws.children(null).find((p) => p.kind === 'page' && p.title === 'Meetings' && p.icon === '🗓️')
  return existing?.id ?? ws.createPage({ title: 'Meetings', icon: '🗓️' })
}

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

/** Opens the meeting note for a calendar event, creating it the first time. */
export function meetingForEvent(e: CalEvent): string {
  const { ws } = getApp()
  const existing = Object.values(ws.getSnapshot().pages).find((p) => p.kind === 'meeting' && p.meeting?.eventId === e.id && !p.trashedAt)
  if (existing) return existing.id
  return ws.createPage({
    kind: 'meeting',
    parentId: meetingsFolder(),
    title: e.title,
    icon: '🗓️',
    meeting: { start: e.start, end: e.end, attendees: e.attendees, location: e.location, eventId: e.id, eventLink: e.link },
  })
}

export function pagePath(id: string) {
  return `/p/${id}`
}

/** Moves a page and its sub-pages to the trash. */
export function trashPage(id: string) {
  getApp().ws.trashPage(id)
}

export async function deleteForever(id: string) {
  const { ws, docs, sync, index } = getApp()
  const ids = ws.deleteForever(id)
  for (const i of ids) {
    await docs.purge(i)
    await sync.forget(i)
    await index.remove(i)
  }
}

export function duplicatePage(id: string): string | null {
  const { ws, docs } = getApp()
  const p = ws.page(id)
  if (!p) return null
  const copy = ws.createPage({
    kind: p.kind,
    parentId: p.parentId,
    title: p.title ? `${p.title} (copy)` : '',
    icon: p.icon,
    cover: p.cover,
    db: p.db,
    template: p.template,
    meeting: p.meeting,
    props: p.props,
    after: id,
  })
  void (async () => {
    const Y = await import('yjs')
    const state = await docs.withDoc(id, (d) => Y.encodeStateAsUpdate(d))
    await docs.withDoc(copy, (d) => {
      // Copy the body by re-encoding the XML into a fresh doc so ids don't clash.
      const tmp = new Y.Doc()
      Y.applyUpdate(tmp, state)
      const src = tmp.getXmlFragment('default')
      const dst = d.getXmlFragment('default')
      d.transact(() => {
        dst.insert(
          0,
          src.toArray().map((n) => (n as { clone: () => unknown }).clone() as never),
        )
      })
    })
  })()
  return copy
}
