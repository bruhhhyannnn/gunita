/**
 * Public-domain paintings for page covers. Searched straight from the browser:
 * both APIs allow it (CORS), and the Art Institute's API can refuse requests
 * that come from Cloudflare's servers.
 */
export interface Art {
  id: string
  title: string
  artist: string
  thumb: string
  full: string
  credit: string
}

async function getJson(url: string, timeoutMs = 9000): Promise<unknown> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`${new URL(url).hostname} answered ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(t)
  }
}

/** Art Institute of Chicago (curated, high-quality public-domain works). */
async function searchAic(q: string): Promise<Art[]> {
  const url = new URL('https://api.artic.edu/api/v1/artworks/search')
  url.searchParams.set('q', q)
  url.searchParams.set('query[term][is_public_domain]', 'true')
  url.searchParams.set('fields', 'id,title,artist_title,image_id')
  url.searchParams.set('limit', '30')
  const data = (await getJson(url.toString())) as { data?: { id: number; title: string; artist_title: string | null; image_id: string | null }[] }
  if (!Array.isArray(data?.data)) throw new Error('Unexpected answer from the Art Institute of Chicago')
  return data.data
    .filter((a) => a.image_id)
    .map((a) => ({
      id: 'aic-' + a.id,
      title: a.title,
      artist: a.artist_title || 'Unknown artist',
      thumb: `https://www.artic.edu/iiif/2/${a.image_id}/full/400,/0/default.jpg`,
      full: `https://www.artic.edu/iiif/2/${a.image_id}/full/1686,/0/default.jpg`,
      credit: `${a.title}, ${a.artist_title || 'Unknown artist'} (Art Institute of Chicago)`,
    }))
}

/** Wikimedia Commons, limited to public-domain artworks. Used as a backup. */
async function searchCommons(q: string): Promise<Art[]> {
  const url = new URL('https://commons.wikimedia.org/w/api.php')
  url.searchParams.set('action', 'query')
  url.searchParams.set('format', 'json')
  url.searchParams.set('origin', '*')
  url.searchParams.set('generator', 'search')
  url.searchParams.set('gsrnamespace', '6')
  url.searchParams.set('gsrsearch', `${q} painting incategory:"PD-Art_(PD-old-100)"`)
  url.searchParams.set('gsrlimit', '30')
  url.searchParams.set('prop', 'imageinfo')
  url.searchParams.set('iiprop', 'url')
  url.searchParams.set('iiurlwidth', '1600')
  const data = (await getJson(url.toString())) as { query?: { pages?: Record<string, { pageid: number; title: string; imageinfo?: { url: string; thumburl?: string }[] }> } }
  const pages = Object.values(data?.query?.pages ?? {})
  return pages
    .filter((p) => p.imageinfo?.[0] && /\.(jpe?g|png)$/i.test(p.title))
    .map((p) => {
      const info = p.imageinfo![0]
      const full = info.thumburl || info.url
      const title = p.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '').replace(/_/g, ' ')
      return {
        id: 'wc-' + p.pageid,
        title,
        artist: 'Wikimedia Commons',
        thumb: full.replace(/\/1600px-/, '/400px-'),
        full,
        credit: `${title} (Wikimedia Commons, public domain)`,
      }
    })
}

export async function searchArt(q: string): Promise<{ items: Art[]; source: string; error?: string }> {
  const query = q.trim() || 'landscape'
  const errors: string[] = []
  try {
    const items = await searchAic(query)
    if (items.length) return { items, source: 'Art Institute of Chicago' }
  } catch (e) {
    errors.push((e as Error).name === 'AbortError' ? 'Art Institute of Chicago timed out' : (e as Error).message)
  }
  try {
    const items = await searchCommons(query)
    return { items, source: 'Wikimedia Commons', error: errors[0] }
  } catch (e) {
    errors.push((e as Error).name === 'AbortError' ? 'Wikimedia Commons timed out' : (e as Error).message)
  }
  return { items: [], source: '', error: errors.join(' · ') }
}
