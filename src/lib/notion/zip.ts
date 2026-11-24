import { unzipSync } from 'fflate'

/**
 * Reads a Notion export. Big exports are a zip of zips ("Export-…-Part-1.zip"),
 * so nested zips are unpacked too. Paths lose the top "Export-<id>/" folder.
 */
export function readExport(bytes: Uint8Array): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>()
  const visit = (data: Uint8Array, depth: number) => {
    const files = unzipSync(data)
    for (const [path, content] of Object.entries(files)) {
      if (path.endsWith('/')) continue
      if (/\.zip$/i.test(path) && depth < 3) {
        visit(content, depth + 1)
        continue
      }
      out.set(path.replace(/^Export-[0-9a-f-]+\//i, ''), content)
    }
  }
  visit(bytes, 0)
  return out
}

/** Notion ids are 32 hex chars at the end of file names: "Page Title 1a2b….md". */
export function splitName(file: string): { base: string; id: string | null; ext: string } {
  const m = file.match(/^(.*?)(?:\s([0-9a-f]{32}))?(_all)?\.(md|csv)$/i)
  if (!m) return { base: file, id: null, ext: '' }
  return { base: m[1], id: m[2] ?? null, ext: m[4].toLowerCase() }
}

export function dirname(path: string) {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}

export function basename(path: string) {
  return path.slice(path.lastIndexOf('/') + 1)
}

/** Resolves a link from a Markdown file ("../attachments/x/image.png") to a path in the export. */
export function resolvePath(fromFile: string, href: string): string {
  let target: string
  try {
    target = decodeURIComponent(href)
  } catch {
    target = href
  }
  const parts = (dirname(fromFile) ? dirname(fromFile).split('/') : []).concat(target.split('/'))
  const stack: string[] = []
  for (const p of parts) {
    if (p === '..') stack.pop()
    else if (p && p !== '.') stack.push(p)
  }
  return stack.join('/')
}
