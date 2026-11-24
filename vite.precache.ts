import type { Plugin } from 'vite'

/**
 * Emits `precache-manifest.json` into the client build listing every emitted
 * asset, so the service worker can cache the whole app for offline use.
 */
export function precacheManifest(version: string): Plugin {
  return {
    name: 'gunita:precache-manifest',
    apply: 'build',
    applyToEnvironment(env) {
      return env.name === 'client'
    },
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle)
        .filter((f) => !f.endsWith('.map') && f !== 'precache-manifest.json')
        .map((f) => '/' + f)
      this.emitFile({
        type: 'asset',
        fileName: 'precache-manifest.json',
        source: JSON.stringify({ version, files }),
      })
    },
  }
}
