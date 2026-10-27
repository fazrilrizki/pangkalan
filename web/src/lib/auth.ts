const STORAGE_KEY = 'integrasi.token';

let memoryToken: string | null = null;

/** Also used after the token is rotated from the remote panel. */
export function storeToken(token: string) {
  memoryToken = token;
  try {
    localStorage.setItem(STORAGE_KEY, token);
  } catch {
    // storage blocked: keep the in-memory copy
  }
}

/** Moves `?token=` from the URL into storage so it does not linger in history or screenshots. */
export function captureTokenFromUrl() {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('token');
  if (!token) return;
  storeToken(token);
  url.searchParams.delete('token');
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? memoryToken;
  } catch {
    return memoryToken;
  }
}
