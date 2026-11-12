import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const daemon = `http://127.0.0.1:${process.env.AUBERGINE_PORT ?? 4600}`;

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // The browser only ever talks to one origin; the daemon sits behind it.
    proxy: {
      '/api': daemon,
      '/auth': daemon,
      '/ws': { target: daemon, ws: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
