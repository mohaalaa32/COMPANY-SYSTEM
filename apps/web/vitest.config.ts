import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(rootDir, './src'),
      '@tel/ai': resolve(rootDir, '../../packages/ai/src/index.ts'),
      '@tel/calc': resolve(rootDir, '../../packages/calc/src/index.ts'),
    },
  },
});

