# Gunita

*Gunita* is Tagalog for "memory" or "remembrance". It's a Notion-style notes app that works offline, with four extra features:

- **Start Today** carries over every unfinished task from earlier days, so nothing slips.
- **AI suggestions** appear as gray text while you write. Tab accepts.
- **Meeting notes** produce a summary, decisions, and action items that land in your next day.
- **A 3D brain** graph of your notes, topics, and people, plus an editable AI memory.

It runs on Cloudflare Workers, and you can install it as an app (PWA) on desktop and phone.

The full product spec and milestones are in [docs/PLAN.md](docs/PLAN.md).

## Features

| Area | What you get |
| --- | --- |
| Editor | Pages and sub-pages, slash commands (`/`), `[[` page links, `@` dates, nested to-dos, toggles, callouts, code, tables, images, drag handle, Markdown shortcuts |
| Workspace | Sidebar tree with drag and drop, favorites, trash, tabs, Ctrl+K search, covers from a public-domain art gallery, emoji icons, contents rail, dark mode |
| Databases | Table, board, calendar and list views. Properties, filters, sorts, inline databases, rows open as pages |
| TODO lists | Days stacked on one page. **Start Today** adds your template and carries over everything unfinished. Old copies show "→ moved to Nov 21", and carried tasks show "carried 3× · since Nov 18" in a color that gets more urgent each day. Drop, snooze and Someday. **Sections** (type `/sections`) split each day into groups like 💼 Work and 🏠 Personal. Semi-monthly accomplishment report, drafted automatically, from your Work section only |
| Focus | Pomodoro timer: 25/5, 30/5, 50/10 or your own minutes, sets, long breaks, sounds and notifications. Shows in the tab title, the sidebar and a corner timer; **Keep on top** opens a mini window. Focus on a task from its ⋯ menu. Daily goal, streak and last 7 days |
| AI (Claude) | Inline suggestions (Tab to accept). "Suggested for today" from your calendar, notes and habits. **Ask my notes** (Ctrl+J) with citations. "Hide from AI" switch on each page |
| Meetings | Meeting template, **Finish meeting** (summary, decisions, action items), text extraction from slide photos and PDFs, live transcript, Google Calendar |
| Brain | 3D graph shaped like a brain (or 2D), timeline replay, AI-suggested links you confirm, editable Memory |
| Offline | Everything is stored on the device and syncs when online. Conflicts merge automatically (Yjs) |
| Page history | A copy of each page is kept once a day (before the first change that day) for 30 days. Page ⋯ menu → **Page history** to preview and restore; Ctrl+Z undoes a restore |
| Sharing | Read-only public links for a page and its sub-pages. Export everything as Markdown and CSV |

### Keyboard shortcuts

| Keys | Action |
| --- | --- |
| Ctrl/⌘ K | Search and commands |
| Ctrl/⌘ J | Ask my notes |
| Ctrl/⌘ Shift E | Quick capture |
| Ctrl/⌘ \ | Toggle sidebar |
| Ctrl/⌘ / | All keyboard shortcuts |
| Ctrl/⌘ + / − / 0 | Bigger, smaller or default page text (per device) |
| Ctrl/⌘ Z, Ctrl/⌘ Y (or Shift Z) | Undo / redo: text, titles, pages moved or deleted, database cells |
| Alt ↑ / ↓ (or Ctrl/⌘ Shift ↑ / ↓) | Move the current task or block up / down (tasks move into the next section too) |
| Tab | Accept AI suggestion (indents when no suggestion is showing) |
| Esc | Dismiss AI suggestion |

## Run it locally

```bash
pnpm install
cp .dev.vars.example .dev.vars
pnpm db:migrate:local
pnpm dev
```

Open http://localhost:3000 and choose **Local dev login**. To try the AI features locally, put `ANTHROPIC_API_KEY` in `.dev.vars`.

Other useful commands:

```bash
pnpm typecheck
pnpm build && pnpm preview   # production build, with the offline service worker
```

## Tests

End-to-end tests live in `e2e/` and use Playwright. They start their own dev server on port 3100, with a separate local database and a fake Claude server, so they never touch your data or your API key.

```bash
pnpm exec playwright install chromium   # once
pnpm test:e2e                           # all tests
pnpm test:e2e e2e/todo.spec.ts          # one file
pnpm test:e2e:ui                        # watch them run
```

They also run on GitHub Actions for every push (`.github/workflows/e2e.yml`).

## Deploy to Cloudflare

You need a Cloudflare account. The free plan is enough to start.

1. Log in, then create the database and the file bucket:

   ```bash
   pnpm exec wrangler login
   pnpm exec wrangler d1 create gunita
   pnpm exec wrangler r2 bucket create gunita-files
   ```

   Copy the `database_id` that `d1 create` prints into `wrangler.jsonc`.

2. Create the tables:

   ```bash
   pnpm db:migrate:remote
   ```

   Run this again whenever a new file appears in `migrations/`, before you deploy.

3. **Google sign-in.**
   1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an OAuth client of type *Web application*.
   2. Add these authorized redirect URIs:
      - `https://gunita.<your-subdomain>.workers.dev/api/auth/google-callback`
      - `http://localhost:3000/api/auth/google-callback` (for local dev)
   3. For Google Calendar, enable the *Google Calendar API* and add the `calendar.readonly` scope on the OAuth consent screen.
   4. While the app is in testing mode, add yourself as a test user.

4. Add the secrets:

   ```bash
   pnpm exec wrangler secret put GOOGLE_CLIENT_ID
   pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET
   pnpm exec wrangler secret put SESSION_SECRET      # any long random string
   pnpm exec wrangler secret put ANTHROPIC_API_KEY   # from console.anthropic.com
   ```

5. Deploy:

   ```bash
   pnpm run deploy
   ```

   If you use a custom domain, set `APP_URL` in `wrangler.jsonc` so Google redirects there.

### AI models and cost

- Planning, Ask, meetings and the Brain use **Claude Opus 5.5**.
- Inline suggestions run constantly, so **Settings → AI** lets you switch them to:
  - **Claude Haiku 5.5**: much cheaper and faster
  - **Workers AI**: free daily allowance on Cloudflare, but noticeably weaker than Claude. To enable it, uncomment the `ai` binding in `wrangler.jsonc`
- Requests opt into Anthropic's server-side refusal fallbacks.
- The browser only sends the snippets each feature needs. Pages marked *Hide from AI* (and their sub-pages) are never sent.

### Limits to know

- Images and files go to R2, up to 20 MB each. Uploads need a connection.
- The Worker bundle is about 2 MB gzipped. Cloudflare's free plan allows 3 MB.
- The live transcript uses the browser's speech recognition. It works best in Chrome, and your browser vendor may process the audio. Always ask attendees first.

## Desktop app (Windows)

`src-tauri/` holds a small [Tauri](https://tauri.app) app. It opens the live site in its own window, so it updates whenever you deploy, works offline, and doesn't count toward your browser's tab limit. On top of the website it adds:

- opens when Windows starts (on by default; turn it off, or have it start in the tray without a window, from the tray icon)
- updates itself from signed GitHub releases (and "Check for updates…" in the tray)
- a tray icon (Open, Quick capture, Start today, Start with Windows, Start in the tray, Check for updates, Quit)
- **Ctrl+Shift+Space** for Quick capture from any app
- close-to-tray, so the hotkey keeps working
- remembered window size and position
- links to other sites opening in your normal browser

**Google sign-in.** Google blocks sign-in inside apps, so the app opens your browser instead. When you're signed in there, the browser asks to open Gunita, and you're signed in. A one-time code plus a secret that only the app holds (`/api/auth/desktop`) keeps that handoff safe.

**Get the installer.** On GitHub, go to **Actions → Desktop app (Windows) → Run workflow**, or push a tag like `desktop-v0.1.0`. After about 5–15 minutes, the installer appears under **Releases**.

**Updates.** Most changes are to the website, and the app shows them as soon as you deploy. When the app itself changes (`src-tauri/`), bump `version` in `src-tauri/tauri.conf.json` and run the workflow: from 0.3.0 on, installed apps find the new release (`latest.json`), download it in the background and ask to restart (or use the tray's "Restart to update"). Releases are signed; the workflow needs two repository secrets (Settings → Secrets and variables → Actions):

- `TAURI_SIGNING_PRIVATE_KEY`: the private key file's contents
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: its password

The matching public key is in `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`). Keep the private key and password somewhere safe (a password manager): without them, installed apps can't accept updates and would need one manual reinstall with a new key.

**Build it yourself on Windows.** Install Rust from rustup.rs, then:

```bash
pnpm desktop:build
```

To point the app at another deployment, set `GUNITA_URL` when building.

## How it works

```
Browser (offline-first)
  Yjs docs: one "workspace" doc (page tree, databases, templates, memory, graph)
            + one doc per page body, saved in IndexedDB
  Service worker caches the whole app
  Sync loop: pushes local changes and pulls changes from other devices
Cloudflare Worker (TanStack Start)
  /api/auth/*     Google OAuth (arctic), sessions in D1
  /api/sync       Yjs updates per doc in D1, compacted over time
  /api/files      uploads to R2
  /api/ai/*       Claude (Anthropic SDK) / Workers AI
  /api/calendar/* Google Calendar, read-only
  /s/:slug        read-only public pages rendered on the server
```

| Path | Contents |
| --- | --- |
| `src/lib/` | Data layer (workspace, sync, search index, Markdown) |
| `src/editor/` | Tiptap extensions |
| `src/todo/` | Start Today and carry-over logic |
| `src/ai/` | Inline suggestions, planning context, brain updates |
| `src/server/` | Worker-only code |

## Importing from Notion

In Notion, open *Settings → Export*, choose **Markdown & CSV** and include sub-pages. Then in Gunita open **Settings → Import from Notion** and choose the zip.

- Pages keep their nesting, formatting, images and files. Databases keep their rows, with property types worked out from the CSV.
- Pages with dated sections (like a daily TODO page) can become TODO lists: one day per date, and a daily template made from the tasks that repeat. By default only the latest day's unfinished tasks are carried into today; older ones are kept but marked "not carried over".
- Everything goes into an "Imported from Notion" page, so you can move or delete it in one go. You need to be online while importing so files can upload.
