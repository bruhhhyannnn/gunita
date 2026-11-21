// Gunita service worker: makes the app open offline.
const SHELL = 'gunita-shell-v1'
const ASSETS = 'gunita-assets-v1'
const IMAGES = 'gunita-images-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(ASSETS)
      try {
        const res = await fetch('/precache-manifest.json', { cache: 'no-store' })
        const { files } = await res.json()
        await Promise.allSettled(files.map((f) => cache.add(f)))
      } catch (e) {
        /* offline during install; runtime caching still works */
      }
      const shell = await caches.open(SHELL)
      await shell.add(new Request('/', { credentials: 'same-origin' })).catch(() => {})
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = [SHELL, ASSETS, IMAGES]
      for (const k of await caches.keys()) if (!keep.includes(k)) await caches.delete(k)
      await self.clients.claim()
    })(),
  )
})

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // App navigations: try the network briefly, fall back to the cached shell.
  if (req.mode === 'navigate' && url.origin === location.origin && !url.pathname.startsWith('/s/') && !url.pathname.startsWith('/api/')) {
    event.respondWith(
      (async () => {
        try {
          const res = await Promise.race([fetch(req), timeout(3500)])
          if (res.ok) {
            const shell = await caches.open(SHELL)
            shell.put('/', res.clone())
          }
          return res
        } catch {
          return (await caches.match('/', { cacheName: SHELL })) || Response.error()
        }
      })(),
    )
    return
  }

  // Uploaded files are immutable.
  if (url.origin === location.origin && url.pathname.startsWith('/api/file/')) {
    event.respondWith(cacheFirst(req, IMAGES))
    return
  }
  if (url.origin === location.origin && url.pathname.startsWith('/api/')) return

  // Built assets (hashed names) and public files.
  if (url.origin === location.origin) {
    event.respondWith(cacheFirst(req, ASSETS))
    return
  }

  // Cover art and other remote images.
  if (req.destination === 'image') {
    event.respondWith(staleWhileRevalidate(req, IMAGES))
  }
})

async function cacheFirst(req, name) {
  const hit = await caches.match(req)
  if (hit) return hit
  const res = await fetch(req)
  if (res.ok) (await caches.open(name)).put(req, res.clone())
  return res
}

async function staleWhileRevalidate(req, name) {
  const cache = await caches.open(name)
  const hit = await cache.match(req)
  const net = fetch(req)
    .then((res) => {
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone())
      return res
    })
    .catch(() => hit)
  return hit || net
}
