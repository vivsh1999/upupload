import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'core/index': 'src/core/index.ts',
    'browser/index': 'src/browser/index.ts',
    'react/index': 'src/react/index.ts',
    'server/index': 'src/server/index.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  splitting: true,
  target: 'es2022',
})

