import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Local Supabase reached through the dev server rather than directly: in a
// Codespace the browser runs on another machine, so `127.0.0.1:54321` is dead
// from its point of view. Pair with `VITE_SUPABASE_URL=/supabase` in .env.local.
const LOCAL_SUPABASE = process.env.LOCAL_SUPABASE_URL ?? 'http://127.0.0.1:54321';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // In a Codespace the browser reaches the dev server through GitHub's
    // HTTPS port forward, so the HMR websocket must dial back on 443.
    ...(process.env.CODESPACES ? { host: true, hmr: { clientPort: 443 } } : {}),
    proxy: {
      '/supabase': {
        target: LOCAL_SUPABASE,
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/supabase/, ''),
      },
      // Dev page probe: the Expo dev server's status endpoint, unreachable from
      // a browser outside the codespace.
      '/expo': {
        target: process.env.LOCAL_EXPO_URL ?? 'http://127.0.0.1:8081',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/expo/, ''),
      },
    },
  },
});
