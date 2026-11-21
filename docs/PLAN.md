# Gunita: product spec & build plan

Gunita (Tagalog: *memory, remembrance*) is a Notion-style notes app with four extra features:

1. **Start Today** continues yesterday's unfinished work.
2. **AI suggestions** appear as gray text that you accept with Tab.
3. **Meeting notes** turn into action items.
4. **A 3D "brain" graph** shows what you know and what you're working on.

The spec below comes from the Q&A on 2026-11-21.

## Decisions

| Area | Decision |
| --- | --- |
| Users | Built for one person first, with real Google accounts so others can sign up later |
| Platforms | Web app, installable as a PWA on desktop and mobile. A native desktop app (Tauri) comes later |
| Offline | Offline-first. Every page lives on the device (IndexedDB) and syncs when online |
| Stack | TanStack Start (React 19, TypeScript), Tiptap v3 editor, Yjs for conflict-free sync, Tailwind v4 |
| Hosting | Cloudflare Workers. D1 (SQLite) is the database, R2 stores images and files, and Workers AI is the free model option |
| Login | Google sign-in only. A dev-only login works for local development |
| AI | Claude Opus 5.5 by default. Inline suggestions can switch to Claude Haiku 5.5 or a free Workers AI model in Settings |
| Language | English only |
| Export | Everything exports as Markdown (plus CSV for databases) at any time |

> Change from the Q&A: the plan said Postgres, but D1 is Cloudflare's own free database. It avoids a second provider, and the data layer is small enough to move to Postgres later.

## Features

### Editor (Notion parity)
- Page tree in the sidebar with nesting, favorites, trash and drag to reorder
- Tabs, breadcrumbs, Ctrl+K search, `/` commands, Markdown shortcuts and a drag handle
- Blocks: headings, paragraphs, nested checkboxes, bullet and numbered lists, toggles, callouts, quotes, code with highlighting, dividers, images, tables, date mentions (`@today`), page links (`[[`)
- Cover images from a built-in gallery of public-domain art, uploads or links. Page icons from emoji
- A contents rail on the right side of long pages
- **Databases**: properties (text, number, select, multi-select, status, date, checkbox, URL) with table, board and calendar views. Rows open as pages. Databases can be full pages or embedded inline
- Read-only public share links

### TODO lists: the core
- A TODO list is **one page with stacked days**, newest first. Finished work stays visible
- **Start Today**:
  1. Adds today's section at the top from the list's template. The template repeats every day, weekends included
  2. Carries over every unchecked task from **all** previous days, without duplicates
  3. Grays out the old copy with "→ moved to Nov 21"
  4. Shows the task's age ("carried 4× · since Nov 12"), turning more urgent each day
- Subtasks: a parent carries over with only its open subtasks. A checked parent counts as fully done
- Task actions: **Drop**, **Snooze until a date**, **Move to Someday**
- Several lists (Work, Personal, School), each with its own template
- A one-tap "Start today" banner, plus optional auto-start the first time you open a list each day
- Optional `@date` on any task
- **Accomplishment report**: plain-text draft of checked tasks for a day, week or month, ready to paste into the CWA template

### AI
- Gray inline suggestions in every page, with an on/off switch. **Tab** accepts when a suggestion shows and indents otherwise. **Esc** dismisses
- Daily plan suggestions based on:
  - carried tasks
  - your calendar
  - deadlines in your notes
  - meeting action items
  - your habits

  They show as gray tasks in today's list, accepted with Tab
- An "Ask my notes" chat with links to the source notes
- A "Hide from AI" switch on each page

### Meetings & workshops
- Meeting template: agenda, notes, decisions, action items
- **Finish meeting** writes the summary and decisions. Action items go to the inbox and show up in the next Start Today
- Attach photos of slides or PDFs. The AI extracts the text into the note
- Google Calendar (read-only) prepares a meeting note for each event
- Live transcript from the browser mic, with a consent reminder. Full call recording waits for the desktop app

### Brain & memory
- 3D force graph built from:
  - pages
  - projects
  - people
  - topics
  - courses
  - meetings
- Links you write (`[[...]]`) are solid. Links the AI finds are faint until you confirm them
- A timeline slider replays how your knowledge grew
- An editable **Memory** page of facts the AI remembers and uses ("you've postponed X for 9 days")

### Later
- Notion import from your Export → Markdown & CSV zip (once you share the export)
- Tauri desktop app: global quick-capture hotkey, tray, recording call audio
- Reminders and push notifications

## Architecture

```
Browser (React app, works offline)
 ├─ Yjs docs: one "workspace" doc (page tree, databases, templates, memory, graph)
 │            + one doc per page body
 ├─ IndexedDB (y-indexeddb) keeps every doc on the device
 ├─ Service worker caches the app shell and assets
 └─ Sync loop: push local changes and pull remote ones through /api/sync

Cloudflare Worker (TanStack Start)
 ├─ /api/auth/*      Google OAuth (arctic) + session cookies in D1
 ├─ /api/sync        stores Yjs updates per doc in D1 and compacts them
 ├─ /api/files       image and file uploads in R2
 ├─ /api/ai/*        Claude (Anthropic SDK) or Workers AI
 ├─ /api/calendar/*  Google Calendar, read-only
 └─ /s/:slug         read-only public pages, rendered on the server
```

The AI never needs a server-side copy of your notes. The browser already has everything locally, so it searches your notes and sends only the relevant snippets, leaving out pages marked "Hide from AI".

## Milestones

1. **Core**: auth, sync, editor, sidebar, tabs, search, PWA
2. **Databases**: table, board and calendar views
3. **TODO lists**: Start Today, carry-over, templates, report
4. **AI**: inline suggestions, daily plan, ask my notes
5. **Meetings**: template, summary and action items, attachments, calendar, transcript
6. **Brain**: memory, 3D graph, timeline
7. **Finish**: share links, Markdown export, mobile polish, deploy guide
