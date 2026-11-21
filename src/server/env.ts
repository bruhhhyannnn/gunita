import { env as cfEnv } from 'cloudflare:workers'
import type { D1Database, R2Bucket, Ai } from '@cloudflare/workers-types'

export interface Env {
  DB: D1Database
  FILES: R2Bucket
  AI?: Ai
  APP_NAME?: string
  /** Public origin, e.g. https://gunita.example.workers.dev. Falls back to the request origin. */
  APP_URL?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  ANTHROPIC_API_KEY?: string
  /** Used to encrypt stored Google refresh tokens. Any long random string. */
  SESSION_SECRET?: string
  /** Set to "true" in .dev.vars to enable the passwordless local login. Never set in production. */
  DEV_LOGIN?: string
}

export const env = cfEnv as unknown as Env
