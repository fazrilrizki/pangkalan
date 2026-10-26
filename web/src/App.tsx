import { useEffect, useState } from 'react';

export function App() {
  const [status, setStatus] = useState<'checking' | 'ok' | 'down'>('checking');

  useEffect(() => {
    fetch('/api/health')
      .then((res) => setStatus(res.ok ? 'ok' : 'down'))
      .catch(() => setStatus('down'));
  }, []);

  return (
    <main className="flex h-full items-center justify-center font-sans">
      <p className="text-lg">server {status}</p>
    </main>
  );
}
