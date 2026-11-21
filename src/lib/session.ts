export interface LocalUser {
  id: string
  email: string | null
  name: string | null
  picture: string | null
}

export interface ServerConfig {
  googleConfigured: boolean
  devLogin: boolean
  claudeConfigured: boolean
  workersAiConfigured: boolean
  calendarConnected?: boolean
}

const KEY = 'gunita:user'

export function getLocalUser(): LocalUser | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as LocalUser) : null
  } catch {
    return null
  }
}

export function setLocalUser(u: LocalUser | null) {
  try {
    if (u) localStorage.setItem(KEY, JSON.stringify(u))
    else localStorage.removeItem(KEY)
  } catch {
    /* storage unavailable */
  }
}

export type MeResult =
  | { status: 'ok'; user: LocalUser; config: ServerConfig }
  | { status: 'signed-out'; config: ServerConfig }
  | { status: 'offline' }

export async function fetchMe(): Promise<MeResult> {
  try {
    const res = await fetch('/api/me', { credentials: 'same-origin' })
    const data = (await res.json()) as { user: LocalUser | null; config: ServerConfig }
    if (res.ok && data.user) return { status: 'ok', user: data.user, config: data.config }
    return { status: 'signed-out', config: data.config }
  } catch {
    return { status: 'offline' }
  }
}
