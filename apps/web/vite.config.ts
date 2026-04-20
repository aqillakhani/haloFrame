import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
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
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
