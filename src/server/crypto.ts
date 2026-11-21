import { b64decode, b64encode } from './util'

async function key(secret: string) {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encrypt(plain: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(secret), new TextEncoder().encode(plain))
  return b64encode(iv) + '.' + b64encode(new Uint8Array(ct))
}

export async function decrypt(enc: string, secret: string): Promise<string> {
  const [iv, ct] = enc.split('.')
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64decode(iv) }, await key(secret), b64decode(ct))
  return new TextDecoder().decode(pt)
}
