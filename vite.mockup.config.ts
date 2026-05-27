import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Mockup-only build for static HTML preview without extension wiring.
export default defineConfig({
  root: 'mockups',
  base: './',
  build: {
    outDir: '../mockups/dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'mockups/index.html'),
      },
    },
  },
  server: {
    port: 5174,
    open: '/index.html',
  },
});
