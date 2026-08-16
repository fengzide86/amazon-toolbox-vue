import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function commandOutput(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${(result.stderr || result.stdout || '').trim()}`)
  }
  return result.stdout.trim()
}

const headSha = commandOutput('git', ['rev-parse', 'HEAD'])
const attestedSha = (process.env.TOOLBOX_CI_ATTESTED_SHA || '').trim()

function githubMariaDbCheckPassed(commitSha) {
  try {
    const remoteUrl = commandOutput('git', ['remote', 'get-url', 'origin'])
    const repository = /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/.exec(remoteUrl)
    if (!repository) return false
    const response = commandOutput('gh', [
      'api',
      '--hostname', 'github.com',
      '-H', 'Accept: application/vnd.github+json',
      `repos/${repository[1]}/${repository[2]}/commits/${commitSha}/check-runs?per_page=100`,
    ])
    const checks = JSON.parse(response).check_runs || []
    const requiredName = 'MariaDB migrations and concurrency'
    const required = checks
      .filter(check => check.name === requiredName)
      .sort((left, right) => Number(right.id) - Number(left.id))[0]
    return Boolean(
      required
      && required.status === 'completed'
      && required.conclusion === 'success'
      && required.head_sha === commitSha,
    )
  } catch (error) {
    process.stderr.write(`Unable to independently verify the MariaDB GitHub check: ${error instanceof Error ? error.message : error}\n`)
    return false
  }
}

if (
  /^[0-9a-f]{40}$/.test(attestedSha)
  && attestedSha === headSha
  && githubMariaDbCheckPassed(headSha)
) {
  process.stdout.write(`mariadb_release_gate=ci_attested sha=${headSha}\n`)
  process.exit(0)
}

if (attestedSha) {
  process.stderr.write('CI attestation was absent, mismatched, or not independently verified; running the required local integration test.\n')
}

const environment = { ...process.env }
delete environment.TOOLBOX_CI_ATTESTED_SHA
const isWindows = process.platform === 'win32'
const command = isWindows ? (process.env.ComSpec || 'cmd.exe') : 'npm'
const args = isWindows
  ? ['/d', '/s', '/c', 'npm run test:mariadb:required']
  : ['run', 'test:mariadb:required']
const result = spawnSync(command, args, {
  cwd: root,
  env: environment,
  stdio: 'inherit',
  windowsHide: true,
})
if (result.error) throw result.error
if (result.status !== 0) process.exitCode = result.status ?? 1
