import { defineConfig } from 'tsdown'
import ApiSnapshot from 'tsnapi/rolldown'

export default defineConfig({
  entry: ['src/index.ts', 'src/preact.ts'],
  format: ['esm'],
  dts: true,
  plugins: [ApiSnapshot()],
})
