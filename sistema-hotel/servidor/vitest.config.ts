import { defineConfig } from 'vitest/config';

export default defineConfig({
  // O Windows do GitHub (e o PC do hotel) é bem mais lento em disco que o Linux
  test: { testTimeout: 20_000, hookTimeout: 60_000 },
});
