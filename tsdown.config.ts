import { defineConfig } from 'tsdown'
import ApiSnapshot from 'tsnapi/rolldown'

export default defineConfig({
  entry: ['src/index.ts', 'src/preact.ts', 'src/react.ts', 'src/headless.ts'],
  format: ['esm'],
  dts: true,
  css: {
    modules: {
      generateScopedName: '[local]',
    },
  },
  plugins: [ApiSnapshot()],
})
