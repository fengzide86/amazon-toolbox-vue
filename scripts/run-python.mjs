import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const forwarded = process.argv.slice(2)
const args = forwarded[0] === '--' ? forwarded.slice(1) : forwarded

if (!args.length) {
  process.stderr.write('run-python.mjs requires Python arguments\n')
  process.exit(2)
}

const localCandidates = process.platform === 'win32'
  ? [
      path.join(root, 'venv', 'Scripts', 'python.exe'),
      path.join(root, '.venv', 'Scripts', 'python.exe'),
    ]
  : [
      path.join(root, 'venv', 'bin', 'python'),
      path.join(root, '.venv', 'bin', 'python'),
    ]

const interpreter = process.env.TOOLBOX_PYTHON
  || localCandidates.find(candidate => fs.statSync(candidate, { throwIfNoEntry: false })?.isFile())
  || (process.platform === 'win32' ? 'python' : 'python3')

const result = spawnSync(interpreter, args, {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
})

if (result.error) {
  process.stderr.write(`Unable to start Python (${interpreter}): ${result.error.message}\n`)
  process.exit(1)
}
process.exit(result.status ?? 1)
