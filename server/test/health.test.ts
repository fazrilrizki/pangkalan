import { describe, expect, it } from 'vitest';
import { authHeaders, buildTestApp } from './helpers';

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/health', headers: authHeaders });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    await app.close();
  });
});
