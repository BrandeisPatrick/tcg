import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// GitHub Pages serves the site at /deadlock-tcg/, so production builds need
// that base path. Local dev keeps "/" so links and asset URLs stay clean.
const isProd = process.env.NODE_ENV === 'production';

export default defineConfig({
  base: isProd ? '/deadlock-tcg/' : '/',
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
  },
});
