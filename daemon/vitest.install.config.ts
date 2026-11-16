import { defineConfig } from 'vitest/config';

/**
 * The tests that keep the machine busy. The installer's (`*.installtest.ts`)
 * run the real installer, once with the real dependency install and build;
 * the others (`*.busytest.ts`) start the real `aubergine` command several
 * times over. So they are a step of their own in `pnpm check`, after the
 * other tests, and not side by side with tests that watch the clock.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.installtest.ts', 'src/**/*.busytest.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
