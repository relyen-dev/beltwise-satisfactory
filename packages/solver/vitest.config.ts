import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts']
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.mjs', '.js', '.mts', '.jsx', '.json'],
    alias: {
      '@beltwise/game-data': fileURLToPath(new URL('../game-data/src/index.ts', import.meta.url)),
      '@beltwise/planner-core': fileURLToPath(new URL('../planner-core/src/index.ts', import.meta.url)),
      '@beltwise/solver': fileURLToPath(new URL('./src/index.ts', import.meta.url))
    }
  }
});
