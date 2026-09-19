import { existsSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Vite resolves .js before .ts. Emitted siblings in source folders can make
// both the app and its tests silently execute an old version of the code.
export function findShadowedSources(root) {
  const collisions = []
  function checkFile(path) {
    if (path.endsWith('.d.ts')) return
    const emitted = path.endsWith('.ts') ? path.slice(0, -3) + '.js'
      : path.endsWith('.cts') ? path.slice(0, -4) + '.cjs' : null
    if (emitted && existsSync(emitted)) collisions.push(relative(root, emitted).replaceAll('\\', '/'))
  }
  function visit(directory) {
    if (!existsSync(directory)) return
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile()) checkFile(path)
    }
  }
  for (const directory of ['src', 'electron', 'shared', 'scripts', 'tests']) visit(join(root, directory))
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile()) checkFile(join(root, entry.name))
  }
  return collisions.sort()
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const collisions = findShadowedSources(process.cwd())
  if (collisions.length) {
    console.error('Generated files shadow TypeScript sources. Move these files to a backup before testing:\n' + collisions.join('\n'))
    process.exitCode = 1
  } else {
    console.log('source_artifacts=verified shadowed_sources=0')
  }
}
