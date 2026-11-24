declare module 'cloudflare:workers' {
  export const env: unknown
}

/** Set at build time (vite.config.ts). */
declare const __BUILD_ID__: string
declare const __BUILD_TIME__: string
