import { defineConfig } from 'vitest/config';

// Rule tests talk to the Firebase emulator, so they are kept out of the
// default `npm test` run and launched by `npm run test:rules`, which starts
// the emulator first.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // The emulator is shared state, so the suites must not overlap.
    fileParallelism: false,
  },
});
