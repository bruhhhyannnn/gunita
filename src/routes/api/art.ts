import { createFileRoute } from '@tanstack/react-router'
import { error } from '#/server/util'

interface AicHit {
  id: number
  title: string
  artist_title: string | null
  image_id: string | null
}

// Searches public-domain paintings from the Art Institute of Chicago's open API.
export const Route = createFileRoute('/api/art')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const q = new URL(request.url).searchParams.get('q')?.slice(0, 80) || 'landscape'
        const url = new URL('https://api.artic.edu/api/v1/artworks/search')
        url.searchParams.set('q', q)
        url.searchParams.set('query[term][is_public_domain]', 'true')
        url.searchParams.set('fields', 'id,title,artist_title,image_id')
        url.searchParams.set('limit', '30')
        const res = await fetch(url, { headers: { 'AIC-User-Agent': 'Gunita notes app' } })
        if (!res.ok) return error(502, 'Art search is unavailable right now')
        const data = (await res.json()) as { data: AicHit[] }
        const items = data.data
          .filter((a) => a.image_id)
          .map((a) => ({
            id: a.id,
            title: a.title,
            artist: a.artist_title || 'Unknown artist',
            thumb: `https://www.artic.edu/iiif/2/${a.image_id}/full/400,/0/default.jpg`,
            full: `https://www.artic.edu/iiif/2/${a.image_id}/full/1686,/0/default.jpg`,
          }))
        return Response.json({ items }, { headers: { 'Cache-Control': 'public, max-age=86400' } })
      },
    },
  },
})
