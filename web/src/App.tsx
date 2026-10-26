import { useEffect, useState } from 'react';
import { ApiError, apiFetch } from './lib/api';

export function App() {
  const [status, setStatus] = useState<'checking' | 'ok' | 'unauthorized' | 'down'>('checking');

  useEffect(() => {
    apiFetch('/api/health')
      .then(() => setStatus('ok'))
      .catch((err: unknown) =>
        setStatus(err instanceof ApiError && err.status === 401 ? 'unauthorized' : 'down'),
      );
  }, []);

  return (
    <main className="flex h-full items-center justify-center font-sans">
      <p className="text-lg">server {status}</p>
    </main>
  );
}
