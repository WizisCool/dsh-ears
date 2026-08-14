import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    client: 'src/client.ts'
  },
  outDir: 'lib',
  format: 'esm',
  dts: true,
  clean: true,
  sourcemap: true,
  outExtensions: () => ({
    js: '.js',
    dts: '.d.ts'
  })
})
