import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The first test of each file starts an in-process Postgres (PGlite) and runs the migrations.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
