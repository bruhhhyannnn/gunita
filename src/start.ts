import { createStart } from '@tanstack/react-start'

// Gunita is an offline-first client app: render everything in the browser.
// Public share pages are plain server routes (see routes/s/$slug.ts).
export const startInstance = createStart(() => ({
  defaultSsr: false,
}))
