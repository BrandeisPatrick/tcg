import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// GitHub Pages serves the site at /tcg/ (repo renamed from deadlock-tcg), so
// production builds need that base path. Local dev keeps "/" so links and asset
// URLs stay clean.
const isProd = process.env.NODE_ENV === 'production';

export default defineConfig({
  base: isProd ? '/tcg/' : '/',
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      output: {
        // Split the stable framework code from app code so gameplay updates
        // don't re-download React/Framer/boardgame.io, and the browser can
        // fetch chunks in parallel on first load.
        manualChunks: {
          react: ['react', 'react-dom'],
          motion: ['framer-motion'],
          bgio: ['boardgame.io'],
        },
      },
    },
  },
});
