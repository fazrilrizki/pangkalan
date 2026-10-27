import { useCallback, useEffect, useState } from 'react';
import type { RemoteStatus } from '@integrasi/shared';
import { ApiError, apiFetch } from '../lib/api';
import { storeToken } from '../lib/auth';

const errorMessage = (err: unknown) => (err instanceof ApiError ? err.message : String(err));

/** Remote-access state for the panel. Probes tailscale each time the panel opens. */
export function useRemoteAccess(open: boolean) {
  const [status, setStatus] = useState<RemoteStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (action: () => Promise<RemoteStatus | null>) => {
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      if (next) setStatus(next);
    } catch (err) {
      setError(errorMessage(err));
      // A failed change can still have changed something (e.g. disabled but serve kept running).
      await apiFetch<RemoteStatus>('/api/remote').then(setStatus, () => {});
    } finally {
      setBusy(false);
    }
  }, []);

  const refresh = useCallback(() => run(() => apiFetch<RemoteStatus>('/api/remote')), [run]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  return {
    status,
    busy,
    error,
    refresh,
    enable: () => run(() => apiFetch<RemoteStatus>('/api/remote/enable', { method: 'POST' })),
    disable: () => run(() => apiFetch<RemoteStatus>('/api/remote/disable', { method: 'POST' })),
    setUsers: (users: string[]) =>
      run(() =>
        apiFetch<RemoteStatus>('/api/remote/users', {
          method: 'PUT',
          body: JSON.stringify({ users }),
        }),
      ),
    rotateToken: () =>
      run(async () => {
        const { token } = await apiFetch<{ token: string }>('/api/remote/rotate-token', {
          method: 'POST',
        });
        // Keep this browser signed in; every other device must open the new URL.
        storeToken(token);
        return apiFetch<RemoteStatus>('/api/remote');
      }),
  };
}

export type RemoteAccess = ReturnType<typeof useRemoteAccess>;
