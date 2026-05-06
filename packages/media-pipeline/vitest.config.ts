import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    exclude: ['src/bench/**'],
  },
  benchmark: {
    include: ['src/**/*.bench.?(c|m)[jt]s?(x)'],
  },
})

