import { defineConfig } from 'tsdown'
import { autoStylesPlugin } from 'isolet-js/plugins'
import ApiSnapshot from 'tsnapi/rolldown'

export default defineConfig({
  entry: ['src/index.ts', 'src/preact.ts'],
  format: ['esm'],
  dts: true,
  plugins: [autoStylesPlugin(), ApiSnapshot()],
})
