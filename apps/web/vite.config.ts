import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  // `./` makes the built bundle portable for Capacitor (WKWebView loads from
  // `file://` so absolute `/assets/…` URLs break). Vercel tolerates the
  // relative paths without change.
  base: './',
  // The monorepo has a single .env at the repo root. Without envDir, Vite
  // would look in apps/web/ and miss VITE_SUPABASE_URL etc., leaving the
  // Supabase client unable to boot.
  envDir: resolve(__dirname, '../..'),
  resolve: {
    alias: {
      '@haloframe/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: 5187,
    // Fail loudly if 5187 is taken — silent fallback to 5188 has bitten us
    // before (Playwright connects to whatever responds on 5173/5187 first).
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
