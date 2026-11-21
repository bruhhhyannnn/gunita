import * as Y from 'yjs'

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function safeUrl(u: unknown): string | null {
  const s = String(u ?? '')
  if (/^https?:\/\//i.test(s) || s.startsWith('/api/file/')) return s
  return null
}

type Delta = { insert: unknown; attributes?: Record<string, unknown> }

export interface RenderCtx {
  /** Title for a page id, or null if it's not part of the shared tree. */
  linkFor: (pageId: string) => { href: string; title: string } | null
}

function inline(el: Y.XmlElement | Y.XmlFragment, ctx: RenderCtx): string {
  let out = ''
  for (const c of el.toArray()) {
    if (c instanceof Y.XmlText) {
      for (const d of c.toDelta() as Delta[]) {
        if (typeof d.insert !== 'string') continue
        let t = esc(d.insert)
        const a = d.attributes ?? {}
        if (a.code) t = `<code>${t}</code>`
        if (a.bold) t = `<strong>${t}</strong>`
        if (a.italic) t = `<em>${t}</em>`
        if (a.underline) t = `<u>${t}</u>`
        if (a.strike) t = `<s>${t}</s>`
        if (a.highlight) t = `<mark>${t}</mark>`
        const href = a.link && typeof a.link === 'object' ? safeUrl((a.link as { href?: string }).href) : null
        if (href) t = `<a href="${esc(href)}" rel="noopener noreferrer" target="_blank">${t}</a>`
        out += t
      }
    } else if (c instanceof Y.XmlElement) {
      if (c.nodeName === 'pageLink') {
        const l = ctx.linkFor(String(c.getAttribute('id')))
        const label = esc(l?.title ?? String(c.getAttribute('label') || 'page'))
        out += l ? `<a class="pagelink" href="${esc(l.href)}">${label}</a>` : `<span class="pagelink">${label}</span>`
      } else if (c.nodeName === 'dateChip') out += `<span class="date">@${esc(String(c.getAttribute('date') ?? ''))}</span>`
      else if (c.nodeName === 'hardBreak') out += '<br>'
      else out += inline(c, ctx)
    }
  }
  return out
}

function blocks(el: Y.XmlElement | Y.XmlFragment, ctx: RenderCtx): string {
  return el
    .toArray()
    .filter((x): x is Y.XmlElement => x instanceof Y.XmlElement)
    .map((b) => block(b, ctx))
    .join('')
}

function block(el: Y.XmlElement, ctx: RenderCtx): string {
  const kids = () => blocks(el, ctx)
  switch (el.nodeName) {
    case 'paragraph':
      return `<p>${inline(el, ctx) || '<br>'}</p>`
    case 'heading': {
      const l = Math.min(3, Math.max(1, Number(el.getAttribute('level') || 1))) + 1
      return `<h${l}>${inline(el, ctx)}</h${l}>`
    }
    case 'bulletList':
      return `<ul>${kids()}</ul>`
    case 'orderedList':
      return `<ol>${kids()}</ol>`
    case 'listItem':
      return `<li>${kids()}</li>`
    case 'taskList':
      return `<ul class="tasks">${kids()}</ul>`
    case 'taskItem': {
      const raw = el.getAttribute('checked') as unknown
      const checked = raw === true || raw === 'true'
      const status = String(el.getAttribute('status') ?? '')
      return `<li class="task${checked ? ' done' : ''}${status ? ' ' + esc(status) : ''}"><span class="box">${checked ? '✓' : ''}</span><div>${kids()}</div></li>`
    }
    case 'blockquote':
      return `<blockquote>${kids()}</blockquote>`
    case 'callout':
      return `<div class="callout"><span>${esc(String(el.getAttribute('icon') || '💡'))}</span><div>${kids()}</div></div>`
    case 'codeBlock':
      return `<pre><code>${esc(el.toArray().map((t) => (t instanceof Y.XmlText ? t.toString() : '')).join(''))}</code></pre>`
    case 'horizontalRule':
      return '<hr>'
    case 'image': {
      const src = safeUrl(el.getAttribute('src'))
      return src ? `<img src="${esc(src)}" alt="${esc(String(el.getAttribute('alt') ?? ''))}" loading="lazy">` : ''
    }
    case 'details': {
      const all = el.toArray().filter((x): x is Y.XmlElement => x instanceof Y.XmlElement)
      const sum = all.find((x) => x.nodeName === 'detailsSummary')
      const content = all.find((x) => x.nodeName === 'detailsContent')
      return `<details><summary>${sum ? inline(sum, ctx) : ''}</summary>${content ? blocks(content, ctx) : ''}</details>`
    }
    case 'table':
      return `<table>${kids()}</table>`
    case 'tableRow':
      return `<tr>${kids()}</tr>`
    case 'tableHeader':
      return `<th>${kids()}</th>`
    case 'tableCell':
      return `<td>${kids()}</td>`
    case 'pageEmbed': {
      const l = ctx.linkFor(String(el.getAttribute('id')))
      return l ? `<p><a class="subpage" href="${esc(l.href)}">📄 ${esc(l.title)}</a></p>` : ''
    }
    case 'databaseEmbed':
      return ''
    case 'todoDay':
      return `<section class="day"><h3>${esc(String(el.getAttribute('date') ?? ''))}</h3>${kids()}</section>`
    default:
      return kids()
  }
}

export function renderDoc(doc: Y.Doc, ctx: RenderCtx): string {
  return blocks(doc.getXmlFragment('default'), ctx)
}

export function sharePage(opts: { title: string; icon?: string; cover?: { kind: string; value: string; y?: number }; body: string; appName: string }) {
  const cover = opts.cover
    ? opts.cover.kind === 'gradient'
      ? `<div class="cover" style="background:${esc(opts.cover.value)}"></div>`
      : safeUrl(opts.cover.value)
        ? `<div class="cover" style="background-image:url('${esc(safeUrl(opts.cover.value)!)}');background-position:center ${Number(opts.cover.y ?? 50)}%"></div>`
        : ''
    : ''
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title || 'Untitled')}</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/icon.svg">
<style>
:root{--bg:#fff;--fg:#37352f;--muted:rgba(55,53,47,.6);--line:rgba(55,53,47,.12);--soft:rgba(55,53,47,.04)}
@media (prefers-color-scheme:dark){:root{--bg:#191919;--fg:rgba(255,255,255,.82);--muted:rgba(255,255,255,.5);--line:rgba(255,255,255,.1);--soft:rgba(255,255,255,.04)}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
.cover{height:30vh;max-height:280px;background-size:cover}
main{max-width:900px;margin:0 auto;padding:48px 24px 120px}
.icon{font-size:64px;line-height:1}h1{font-size:40px;line-height:1.2;margin:8px 0 16px}
h2{font-size:1.6em;margin:1.2em 0 .3em}h3{font-size:1.3em;margin:1em 0 .3em}h4{font-size:1.1em}
p{margin:.25em 0}a{color:inherit;text-decoration-color:var(--muted);text-underline-offset:2px}
code{background:var(--soft);border-radius:4px;padding:.15em .35em;font-size:85%;color:#eb5757}pre{background:var(--soft);border:1px solid var(--line);border-radius:6px;padding:14px 18px;overflow:auto}pre code{color:inherit;background:none;padding:0}
blockquote{border-left:3px solid currentColor;margin:6px 0;padding-left:14px}
.callout{display:flex;gap:10px;background:var(--soft);border:1px solid var(--line);border-radius:6px;padding:12px 16px;margin:6px 0}
img{max-width:100%;border-radius:4px;display:block;margin:8px auto}hr{border:0;border-top:1px solid var(--line);margin:16px 0}
ul.tasks{list-style:none;padding-left:0}ul.tasks ul.tasks{padding-left:1.6em}li.task{display:flex;gap:8px}li.task .box{flex:none;width:16px;height:16px;margin-top:.35em;border:1.5px solid var(--muted);border-radius:3px;font-size:11px;line-height:13px;text-align:center}
li.task.done .box{background:#2383e2;border-color:#2383e2;color:#fff}li.task.done>div>p,li.task.moved>div>p,li.task.dropped>div>p{color:var(--muted);text-decoration:line-through}
table{border-collapse:collapse;width:100%}td,th{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
.date,.pagelink{color:var(--muted)}.subpage{font-weight:500}section.day h3{font-size:15px;border-bottom:1px solid var(--line);padding-bottom:4px}
mark{background:rgba(233,168,0,.35);color:inherit}details summary{cursor:pointer;font-weight:500}
footer{margin-top:64px;font-size:12px;color:var(--muted)}
</style></head>
<body>${cover}<main>${opts.icon ? `<div class="icon">${esc(opts.icon)}</div>` : ''}<h1>${esc(opts.title || 'Untitled')}</h1>${opts.body}<footer>Shared from ${esc(opts.appName)} · read-only</footer></main></body></html>`
}
