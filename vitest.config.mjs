import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/*/test/**/*.test.ts', 'apps/web/src/**/*.test.ts'],
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.mjs', '.js', '.mts', '.jsx', '.json'],
    alias: {
      '@beltwise/game-data': fileURLToPath(
        new URL('./packages/game-data/src/index.ts', import.meta.url),
      ),
      '@beltwise/planner-core': fileURLToPath(
        new URL('./packages/planner-core/src/index.ts', import.meta.url),
      ),
      '@beltwise/solver': fileURLToPath(new URL('./packages/solver/src/index.ts', import.meta.url)),
    },
  },
});
