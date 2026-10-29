import { describe, expect, it } from 'vitest';
import { matchShortcut } from '../src/lib/shortcuts';

const key = (code: string, mods: Partial<Record<'ctrl' | 'alt' | 'shift' | 'meta', boolean>>) => ({
  code,
  ctrlKey: !!mods.ctrl,
  altKey: !!mods.alt,
  shiftKey: !!mods.shift,
  metaKey: !!mods.meta,
});

describe('matchShortcut', () => {
  it('maps Ctrl+Alt combos to actions', () => {
    expect(matchShortcut(key('KeyT', { ctrl: true, alt: true }))).toEqual({ type: 'new' });
    expect(matchShortcut(key('KeyW', { ctrl: true, alt: true }))).toEqual({ type: 'close' });
    expect(matchShortcut(key('BracketRight', { ctrl: true, alt: true }))).toEqual({
      type: 'cycle',
      step: 1,
    });
    expect(matchShortcut(key('KeyP', { ctrl: true, alt: true }))).toEqual({ type: 'preview' });
    expect(matchShortcut(key('Digit3', { ctrl: true, alt: true }))).toEqual({
      type: 'jump',
      index: 2,
    });
  });

  it('leaves terminal keys alone', () => {
    expect(matchShortcut(key('KeyC', { ctrl: true }))).toBeNull();
    expect(matchShortcut(key('KeyT', { alt: true }))).toBeNull();
    expect(matchShortcut(key('KeyT', { ctrl: true, shift: true }))).toBeNull();
    expect(matchShortcut(key('KeyT', { ctrl: true, alt: true, shift: true }))).toBeNull();
    expect(matchShortcut(key('Digit0', { ctrl: true, alt: true }))).toBeNull();
  });
});
