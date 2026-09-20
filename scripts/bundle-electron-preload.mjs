import { build } from 'esbuild'

// A sandboxed preload only has Electron's limited require shim. TypeScript's
// emitted relative require() calls cannot load the shared IPC/Zod modules.
await build({
  entryPoints: ['electron/preload.cts'],
  outfile: 'dist-electron/electron/preload.cjs',
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2022',
  external: ['electron'],
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'info',
})
