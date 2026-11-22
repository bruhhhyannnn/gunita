/**
 * The Windows desktop app (Tauri, see src-tauri/) loads this site in its own
 * window and injects `window.__GUNITA_DESKTOP__`. It talks to the page only
 * through DOM events, so the website never gets access to native APIs.
 *
 * Events sent by the desktop app:
 * - `gunita:capture`  open Quick capture (global hotkey / tray)
 * - `gunita:navigate` go to a path (detail: string), e.g. "/?start=today"
 */
export function isDesktop(): boolean {
  return typeof window !== 'undefined' && (window as unknown as { __GUNITA_DESKTOP__?: boolean }).__GUNITA_DESKTOP__ === true
}

export const DESKTOP_HOTKEY = 'Ctrl+Shift+Space'
