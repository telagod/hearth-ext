import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@db': resolve(__dirname, 'src/db'),
      '@llm': resolve(__dirname, 'src/llm'),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
  },
});
