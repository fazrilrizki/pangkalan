import { describe, expect, it } from 'vitest';
import { RingBuffer } from '../src/sessions/ring-buffer';

describe('RingBuffer', () => {
  it('keeps everything under capacity', () => {
    const buf = new RingBuffer(10);
    buf.push('abc');
    buf.push('def');
    expect(buf.toString()).toBe('abcdef');
    expect(buf.length).toBe(6);
  });

  it('drops the oldest characters once over capacity', () => {
    const buf = new RingBuffer(5);
    buf.push('abc');
    buf.push('def');
    expect(buf.toString()).toBe('bcdef');
    expect(buf.length).toBe(5);
  });

  it('drops whole chunks that fall out of the window', () => {
    const buf = new RingBuffer(4);
    buf.push('aa');
    buf.push('bb');
    buf.push('cc');
    expect(buf.toString()).toBe('bbcc');
  });

  it('keeps only the tail of a chunk larger than capacity', () => {
    const buf = new RingBuffer(3);
    buf.push('x');
    buf.push('abcdef');
    expect(buf.toString()).toBe('def');
    expect(buf.length).toBe(3);
  });
});
