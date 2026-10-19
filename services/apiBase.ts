// Where the game server (server.ts: /api routes + /ws WebSocket) lives.
//
// Default is '' = same origin, which is how AI Studio and local dev run.
// When the site is hosted statically (GitHub Pages) the server runs elsewhere
// (e.g. Render), so the build sets VITE_API_BASE to that server's URL.

const raw = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_API_BASE || '').trim();

export const API_BASE = raw.replace(/\/+$/, '');

export function apiUrl(path: string): string {
  return API_BASE + path;
}

export function getWsUrl(): string {
  if (API_BASE) {
    return API_BASE.replace(/^http/i, 'ws') + '/ws';
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}
