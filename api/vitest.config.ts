import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The suite is deliberately all pure functions - no database, no HTTP - so
    // it runs in a second and can be trusted as a description of the rules.
    globals: false,
  },
});
