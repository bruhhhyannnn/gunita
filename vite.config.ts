import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { precacheManifest } from './vite.precache.ts'

// One id per build: baked into the app and into precache-manifest.json, so an
// open tab can tell when a newer version has been deployed.
// The config is loaded more than once per build, so the id is kept in the
// environment to stay the same everywhere.
process.env.GUNITA_BUILD_ID ||= String(Date.now())
const BUILD_ID = process.env.GUNITA_BUILD_ID

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
    __BUILD_TIME__: JSON.stringify(new Date(Number(BUILD_ID) || Date.now()).toISOString()),
  },
  // One copy of Yjs: two copies break its internal instanceof checks.
  resolve: { tsconfigPaths: true, dedupe: ['yjs', 'y-protocols', 'lib0'] },
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tanstackStart(),
    viteReact(),
    tailwindcss(),
    precacheManifest(BUILD_ID),
  ],
})
