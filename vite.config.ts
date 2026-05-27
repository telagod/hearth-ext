import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { resolve } from 'node:path';
import { mkdirSync, renameSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * Post-build helper: rename Vite's nested HTML outputs to flat names that the
 * MV3 manifest expects (sidepanel.html, offscreen.html), and rewrite their
 * asset references to be relative to the new flat location.
 */
function flattenHtml() {
  return {
    name: 'hearth:flatten-html',
    closeBundle() {
      const outDir = resolve(__dirname, 'dist');
      const moves: Array<[string, string]> = [
        ['src/sidepanel/index.html', 'sidepanel.html'],
        ['src/offscreen/index.html', 'offscreen.html'],
      ];
      for (const [from, to] of moves) {
        const src = resolve(outDir, from);
        const dst = resolve(outDir, to);
        if (!existsSync(src)) continue;
        // Read, rewrite ../../assets → assets, then write to flat path.
        let html = readFileSync(src, 'utf-8');
        html = html.replace(/(href|src)="\.\.\/\.\.\/(assets|background|content)\//g, '$1="$2/');
        html = html.replace(/(href|src)="\/(assets|background|content)\//g, '$1="$2/');
        writeFileSync(dst, html, 'utf-8');
      }
      const stale = resolve(outDir, 'src');
      if (existsSync(stale)) rmSync(stale, { recursive: true, force: true });
      void mkdirSync; void renameSync;
    },
  } as const;
}

export default defineConfig({
  base: './',
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: 'public/manifest.json', dest: '.' },
        { src: 'public/icons/*', dest: 'icons' },
        { src: 'src/_locales/*', dest: '_locales' },
        { src: 'skills_examples/*.md', dest: 'skills' },
        // Tesseract local hosting — required by MV3 CSP (no remote scripts).
        // Ship only the simd-lstm variant; non-simd fallback rarely needed in modern browsers.
        { src: 'node_modules/tesseract.js/dist/worker.min.js', dest: 'tesseract' },
        { src: 'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm', dest: 'tesseract' },
        { src: 'node_modules/tesseract.js-core/tesseract-core-simd-lstm.js', dest: 'tesseract' },
      ],
    }),
    flattenHtml(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@db': resolve(__dirname, 'src/db'),
      '@llm': resolve(__dirname, 'src/llm'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',
    sourcemap: process.env.HEARTH_SOURCEMAP === '1',
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background/index.ts'),
        content: resolve(__dirname, 'src/content/index.ts'),
        sidepanel: resolve(__dirname, 'src/sidepanel/index.html'),
        offscreen: resolve(__dirname, 'src/offscreen/index.html'),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'background') return 'background/index.js';
          if (chunk.name === 'content') return 'content/index.js';
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  worker: {
    format: 'es',
  },
  server: {
    port: 5173,
  },
});
