import { defineConfig } from 'vitest/config';

/**
 * The installer's tests. They run the real installer, once with the real
 * dependency install and build, which keeps the machine busy for a while; so
 * they are a step of their own in `pnpm check`, after the other tests, and not
 * side by side with tests that watch the clock.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.installtest.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
