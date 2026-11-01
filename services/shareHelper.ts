// Public Share Helper to resolve 403 Forbidden for friends
// Converts private development URLs (ais-dev-) to public shared URLs (ais-pre-)
// so external users/friends can access the game without Google Cloud authentication errors.

export const PUBLIC_FALLBACK_URL =
  'https://ais-pre-pivnvwnoo7rvmwbzwhl6qg-611402543178.europe-west2.run.app';

export function getPublicOrigin(): string {
  if (typeof window === 'undefined') return PUBLIC_FALLBACK_URL;

  const currentOrigin = window.location.origin;

  // If in internal dev preview, convert ais-dev- to public ais-pre-
  if (currentOrigin.includes('ais-dev-')) {
    return currentOrigin.replace('ais-dev-', 'ais-pre-');
  }

  // If on localhost in local dev, keep local origin unless explicitly requested
  if (currentOrigin.includes('localhost') || currentOrigin.includes('127.0.0.1')) {
    return currentOrigin;
  }

  return currentOrigin;
}

export function getPublicShareUrl(params?: {
  mode?: string;
  room?: string;
  player?: string;
  score?: number;
}): string {
  const origin = getPublicOrigin();
  const url = new URL(typeof window !== 'undefined' ? window.location.pathname : '/', origin);

  if (params?.mode) url.searchParams.set('mode', params.mode);
  if (params?.room) url.searchParams.set('room', params.room);
  if (params?.player) url.searchParams.set('player', params.player);
  if (params?.score !== undefined) url.searchParams.set('score', String(params.score));

  return url.toString();
}
