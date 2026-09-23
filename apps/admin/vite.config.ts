import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Local Supabase reached through the dev server rather than directly: in a
// Codespace the browser runs on another machine, so `127.0.0.1:54321` is dead
// from its point of view. Proxying keeps everything on the one forwarded,
// authenticated port. Pair with `VITE_SUPABASE_URL=/supabase` in .env.local;
// `ws: true` carries the Realtime websocket as well.
const LOCAL_SUPABASE = process.env.LOCAL_SUPABASE_URL ?? 'http://127.0.0.1:54321';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/supabase': {
        target: LOCAL_SUPABASE,
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/supabase/, ''),
      },
      // Dev page probes (features/dev-tools): the gateway's health endpoint
      // and the Expo dev server's manifest, which are equally unreachable
      // from a browser outside the codespace.
      '/gateway': {
        target: process.env.LOCAL_GATEWAY_URL ?? 'http://127.0.0.1:9221',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/gateway/, ''),
      },
      '/expo': {
        target: process.env.LOCAL_EXPO_URL ?? 'http://127.0.0.1:8081',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/expo/, ''),
      },
    },
  },
});
