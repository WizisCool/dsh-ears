import { defineConfig } from 'tsdown'
import { clientBundle } from './tsdown.client.ts'

export default defineConfig([
  {
    name: 'dsh-ears',
    entry: {
      index: 'src/index.ts',
      typert: 'src/typert.ts',
      remote: 'src/remote.ts',
      // The sacrificial native runtime is a separate process, so it must ship
      // as its own entry next to the bundled Host entry.
      'asr/whisper-worker': 'src/asr/whisper-worker.ts',
      'asr/sensevoice-worker': 'src/asr/sensevoice-worker.ts'
    },
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    deps: { neverBundle: [
      '@fugood/whisper.node',
      'sherpa-onnx-node',
      '@audio/decode-flac',
      '@audio/decode-mp3',
      '@audio/decode-opus',
      '@audio/decode-vorbis',
      '@audio/decode-wav',
      '@audio/webm-decode'
    ] },
    target: 'es2022',
    dts: true,
    clean: true,
    sourcemap: true,
    outExtensions: () => ({
      js: '.js',
      dts: '.d.ts'
    })
  },
  clientBundle('dsh-ears', 'src/client.ts')
])
