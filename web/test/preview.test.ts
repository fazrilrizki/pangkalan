// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Project, SessionInfo } from '@integrasi/shared';
import { isCrossSitePreview, isLocalHost, resolvePreviewUrl } from '../src/lib/preview';

const session = (id: string, extra: Partial<SessionInfo> = {}): SessionInfo => ({
  id,
  projectId: 'p1',
  cliId: 'claude',
  title: 'Claude Code',
  cwd: 'C:\\p1',
  status: 'idle',
  exitCode: null,
  createdAt: '2026-01-01',
  previewUrl: null,
  previewDetectedAt: null,
  ...extra,
});

const project = (previewUrl: string | null = null): Project => ({
  id: 'p1',
  name: 'p1',
  path: 'C:\\p1',
  favorite: false,
  createdAt: '2026-01-01',
  previewUrl,
});

const detected = (url: string, at: string) => ({ previewUrl: url, previewDetectedAt: at });

describe('resolvePreviewUrl', () => {
  it('prefers the manual project URL', () => {
    const active = session('a', detected('http://localhost:5173/', 't1'));
    expect(resolvePreviewUrl(active, project('http://localhost:3000'), [active])).toEqual({
      url: 'http://localhost:3000',
      source: 'manual',
    });
  });

  it("uses the active session's own URL before its siblings'", () => {
    const active = session('a', detected('http://localhost:5174/', 't1'));
    const sibling = session('b', detected('http://localhost:5173/', 't2'));
    expect(resolvePreviewUrl(active, project(), [active, sibling])).toEqual({
      url: 'http://localhost:5174/',
      source: 'session',
    });
  });

  it('falls back to the newest URL from the same project only', () => {
    const active = session('a');
    const older = session('b', detected('http://localhost:5173/', '2026-01-01T00:00:01Z'));
    const newer = session('c', detected('http://localhost:5175/', '2026-01-01T00:00:02Z'));
    const other = session('d', {
      projectId: 'p2',
      ...detected('http://localhost:9999/', '2026-01-01T00:00:03Z'),
    });
    expect(resolvePreviewUrl(active, project(), [active, older, newer, other])).toEqual({
      url: 'http://localhost:5175/',
      source: 'project',
    });
  });

  it('returns null with nothing detected', () => {
    expect(resolvePreviewUrl(session('a'), project(), [session('a')])).toBeNull();
    expect(resolvePreviewUrl(undefined, undefined, [])).toBeNull();
  });
});

describe('isCrossSitePreview', () => {
  const page = { protocol: 'http:', hostname: '127.0.0.1' };

  it('treats another port on the same host as the same site', () => {
    expect(isCrossSitePreview('http://127.0.0.1:8000/login', page)).toBe(false);
  });

  it('flags another host or scheme', () => {
    expect(isCrossSitePreview('http://lms-school.test/', page)).toBe(true);
    expect(isCrossSitePreview('http://localhost:5173/', page)).toBe(true);
    expect(isCrossSitePreview('https://127.0.0.1:8000/', page)).toBe(true);
  });
});

describe('isLocalHost', () => {
  it('accepts loopback names only', () => {
    expect(isLocalHost('localhost')).toBe(true);
    expect(isLocalHost('127.0.0.1')).toBe(true);
    expect(isLocalHost('laptop.tail1234.ts.net')).toBe(false);
  });
});
