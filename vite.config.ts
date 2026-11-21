import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { precacheManifest } from './vite.precache'

export default defineConfig({
  // One copy of Yjs: two copies break its internal instanceof checks.
  resolve: { tsconfigPaths: true, dedupe: ['yjs', 'y-protocols', 'lib0'] },
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tanstackStart(),
    viteReact(),
    tailwindcss(),
    precacheManifest(),
  ],
})
