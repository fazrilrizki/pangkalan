import { beforeEach, describe, expect, it } from 'vitest';
import { readEnabled, shouldNotify, writeEnabled } from '../src/lib/notify';

const base = {
  previous: 'working' as const,
  next: 'waiting' as const,
  isActiveTab: false,
  documentFocused: true,
  enabled: true,
};

describe('shouldNotify', () => {
  it('notifies when a background tab starts waiting', () => {
    expect(shouldNotify(base)).toBe(true);
  });

  it('notifies for the active tab only when the window is not focused', () => {
    expect(shouldNotify({ ...base, isActiveTab: true, documentFocused: true })).toBe(false);
    expect(shouldNotify({ ...base, isActiveTab: true, documentFocused: false })).toBe(true);
  });

  it('notifies only on the transition into waiting', () => {
    expect(shouldNotify({ ...base, previous: 'waiting' })).toBe(false);
    expect(shouldNotify({ ...base, next: 'idle' })).toBe(false);
  });

  it('respects the toggle', () => {
    expect(shouldNotify({ ...base, enabled: false })).toBe(false);
  });
});

describe('notification preference', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to on and persists changes', () => {
    expect(readEnabled()).toBe(true);
    writeEnabled(false);
    expect(readEnabled()).toBe(false);
  });
});
