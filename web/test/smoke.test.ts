import { describe, expect, it } from 'vitest';
import { DEFAULT_PORT } from '@integrasi/shared';

describe('shared import', () => {
  it('resolves workspace package', () => {
    expect(DEFAULT_PORT).toBe(4317);
  });
});
