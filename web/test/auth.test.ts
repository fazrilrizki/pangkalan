import { beforeEach, describe, expect, it } from 'vitest';
import { captureTokenFromUrl, getToken } from '../src/lib/auth';

describe('captureTokenFromUrl', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('stores the token and strips it from the URL', () => {
    window.history.replaceState(null, '', '/?token=abc&tab=1');
    captureTokenFromUrl();
    expect(getToken()).toBe('abc');
    expect(window.location.search).toBe('?tab=1');
  });

  it('keeps an existing token when the URL has none', () => {
    localStorage.setItem('integrasi.token', 'kept');
    captureTokenFromUrl();
    expect(getToken()).toBe('kept');
  });
});
