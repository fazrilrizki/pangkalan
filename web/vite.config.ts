import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const backend = 'http://127.0.0.1:4317';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Served from localhost only, so one ~800 kB bundle (mostly xterm) is fine.
  build: { chunkSizeWarningLimit: 1000 },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: backend },
      '/ws': { target: backend, ws: true },
    },
  },
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
  },
});
