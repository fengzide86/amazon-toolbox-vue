import { spawn, spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import readline from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const isWindows = process.platform === 'win32'
const RELEASE_STAGES = ['prepared', 'backend_deployed', 'web_activated', 'desktop_published', 'verified']
const REMOTE_PRODUCTION_LEASE = '/var/lib/amazon-toolbox/release-control/production.lease'
const REMOTE_PRODUCTION_LEASE_GUARD = `${REMOTE_PRODUCTION_LEASE}.guard`
const releaseSessionId = crypto.randomUUID()

function log(message) {
  console.log(`[TOOLBOX] ${message}`)
}

function fail(message) {
  throw new Error(message)
}

function cmdQuote(value) {
  const text = String(value)
  return /[\s&|<>^]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function invocation(command, args) {
  if (isWindows && command === 'npm') {
    return {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', ['npm', ...args].map(cmdQuote).join(' ')],
    }
  }
  return { command, args }
}

function run(command, args, options = {}) {
  const call = invocation(command, args)
  const displayArgs = (options.redactValues || []).reduce(
    (current, secret) => secret ? current.replaceAll(String(secret), '<redacted>') : current,
    args.join(' '),
  )
  log(`运行：${command} ${displayArgs}`)
  const result = spawnSync(call.command, call.args, {
    cwd: options.cwd || root,
    env: options.env || process.env,
    stdio: options.stdio || 'inherit',
    windowsHide: true,
    encoding: options.stdio === 'pipe' ? 'utf8' : undefined,
  })
  if (result.error) throw result.error
  if (result.status !== 0) fail(`${command} 执行失败，退出码 ${result.status ?? 'unknown'}`)
  return result
}

function runAsync(command, args, options = {}) {
  const call = invocation(command, args)
  log(`运行：${command} ${args.join(' ')}`)
  return new Promise((resolve, reject) => {
    const child = spawn(call.command, call.args, {
      cwd: options.cwd || root,
      env: options.env || process.env,
      stdio: options.stdio || 'inherit',
      windowsHide: options.windowsHide ?? true,
    })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} 执行失败，退出码 ${code ?? 'unknown'}`)))
  })
}

function stopProcessTree(child) {
  if (!child?.pid || child.exitCode !== null) return
  if (isWindows) {
    spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
      timeout: 15_000,
    })
  } else {
    child.kill('SIGTERM')
  }
}

function parseEnvFile(filename) {
  const target = path.join(root, filename)
  if (!fs.existsSync(target)) return {}
  const values = {}
  for (const rawLine of fs.readFileSync(target, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator < 1) continue
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    value = value.replace(/%([^%]+)%/g, (_, name) => process.env[name] || '')
    values[key] = value
  }
  return values
}

function packageVersion() {
  return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
}

function syncOpenApiReleaseVersion(version) {
  const filename = path.join(root, 'backend', 'openapi.json')
  if (!fs.existsSync(filename)) fail(`OpenAPI 快照不存在：${filename}`)

  const source = fs.readFileSync(filename, 'utf8')
  const document = JSON.parse(source)
  if (document.info?.version === version) return

  const infoVersion = /("info"\s*:\s*\{[\s\S]*?"version"\s*:\s*")([^"]+)(")/
  if (!infoVersion.test(source)) fail('OpenAPI 快照缺少 info.version')

  fs.writeFileSync(
    filename,
    source.replace(infoVersion, (_match, prefix, _current, suffix) => `${prefix}${version}${suffix}`),
    'utf8',
  )
  log(`OpenAPI 发布版本已同步：v${version}`)
}

function nextPatch(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) fail(`当前版本不是标准 SemVer：${version}`)
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`
}

function semverKey(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) fail(`版本号必须使用 x.y.z：${version}`)
  return match.slice(1).map(Number)
}

function compareSemver(left, right) {
  const a = semverKey(left)
  const b = semverKey(right)
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index]
  }
  return 0
}

function output(command, args, options = {}) {
  return run(command, args, { ...options, stdio: 'pipe' }).stdout.trim()
}

function gitOutput(args) {
  return output('git', args)
}

function toolboxDataRoot() {
  return path.resolve(
    process.env.TOOLBOX_DATA_ROOT
      || (isWindows ? 'D:\\AmazonToolboxData' : path.join(os.tmpdir(), 'AmazonToolboxData')),
  )
}

function releaseStateDirectory(releaseId) {
  if (!/^[A-Za-z0-9._-]+$/.test(releaseId)) fail(`发布 ID 无效：${releaseId}`)
  return path.join(toolboxDataRoot(), 'release-workflows', releaseId)
}

function productionReleaseLockDirectory() {
  if (isWindows) {
    return path.join(process.env.ProgramData || 'C:\\ProgramData', 'AmazonToolbox', 'release-control')
  }
  return path.join('/var/tmp', 'amazon-toolbox-release-control')
}

function statePath(releaseId) {
  return path.join(releaseStateDirectory(releaseId), 'state.json')
}

function writeReleaseState(state) {
  const filename = statePath(state.releaseId)
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  const temporary = `${filename}.${process.pid}.tmp`
  state.updatedAt = new Date().toISOString()
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(temporary, filename)
  if (!isWindows) fs.chmodSync(filename, 0o600)
  log(`发布状态：${state.stage}（${state.releaseId}）`)
}

function readReleaseState(releaseId) {
  const filename = statePath(releaseId)
  if (!fs.existsSync(filename)) fail(`未找到可恢复的发布状态：${filename}`)
  const state = JSON.parse(fs.readFileSync(filename, 'utf8'))
  if (state.schemaVersion !== 1 || state.releaseId !== releaseId || !RELEASE_STAGES.includes(state.stage)) {
    fail(`发布状态文件无效：${filename}`)
  }
  return state
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

function acquireProductionReleaseLock(releaseId) {
  const directory = productionReleaseLockDirectory()
  const filename = path.join(directory, 'production-release.lock')
  const token = `${process.pid}-${crypto.randomUUID()}`
  fs.mkdirSync(directory, { recursive: true })

  const create = () => {
    const descriptor = fs.openSync(filename, 'wx', 0o600)
    try {
      fs.writeFileSync(descriptor, JSON.stringify({
        token,
        releaseId,
        pid: process.pid,
        hostname: os.hostname(),
        createdAt: new Date().toISOString(),
      }))
    } finally {
      fs.closeSync(descriptor)
    }
  }

  try {
    create()
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error
    let owner
    try { owner = JSON.parse(fs.readFileSync(filename, 'utf8')) } catch { /* invalid lock stays blocking */ }
    if (!owner || processIsAlive(Number(owner.pid))) {
      const ownerDetails = [owner?.releaseId, owner?.pid ? `PID ${owner.pid}` : ''].filter(Boolean).join('，')
      fail(`本机已有生产发布正在执行${ownerDetails ? `（${ownerDetails}）` : ''}`)
    }
    fs.unlinkSync(filename)
    try {
      create()
    } catch (retryError) {
      if (retryError?.code === 'EEXIST') fail('本机生产发布锁已被另一个进程接管')
      throw retryError
    }
  }

  return () => {
    try {
      const current = JSON.parse(fs.readFileSync(filename, 'utf8'))
      if (current.token === token) fs.unlinkSync(filename)
    } catch {
      // A missing lock during cleanup does not change the release result.
    }
  }
}

function hasReached(state, stage) {
  return RELEASE_STAGES.indexOf(state.stage) >= RELEASE_STAGES.indexOf(stage)
}

function sha512File(filename) {
  const digest = crypto.createHash('sha512')
  const descriptor = fs.openSync(filename, 'r')
  const buffer = Buffer.allocUnsafe(1024 * 1024)
  try {
    let bytesRead
    while ((bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0) {
      digest.update(buffer.subarray(0, bytesRead))
    }
  } finally {
    fs.closeSync(descriptor)
  }
  return digest.digest('hex')
}

function artifactRecord(filename) {
  const stat = fs.statSync(filename, { throwIfNoEntry: false })
  if (!stat?.isFile() || stat.size === 0) fail(`发布产物不存在或为空：${filename}`)
  return { path: path.resolve(filename), size: stat.size, sha512: sha512File(filename) }
}

function verifyArtifactRecord(artifact) {
  const current = artifactRecord(artifact.path)
  if (current.size !== artifact.size || current.sha512 !== artifact.sha512) {
    fail(`可恢复发布产物已变化：${artifact.path}`)
  }
}

function optionValue(args, name, fallback = '') {
  const prefix = `--${name}=`
  const inline = args.find(value => value.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] || fallback : fallback
}

async function getJson(url, timeoutMs = 10_000) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!response.ok) throw new Error(`${url} 返回 HTTP ${response.status}`)
  return response.json()
}

async function health(url) {
  const base = url.replace(/\/+$/, '')
  return getJson(`${base}/api/health/live`)
}

async function waitForHealth(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const result = await health(url)
      if (result.status === 'ok') return result
    } catch {
      // The local backend can take time to create its environment on first use.
    }
    await new Promise(resolve => setTimeout(resolve, 1_000))
  }
  fail(`后端在 ${Math.round(timeoutMs / 1000)} 秒内未就绪：${url}`)
}

function ensureDependencies() {
  const requiredMarkers = [
    path.join(root, 'node_modules', 'electron', 'package.json'),
    path.join(root, 'node_modules', 'vite', 'package.json'),
    path.join(root, 'node_modules', 'typescript', 'package.json'),
  ]
  if (requiredMarkers.some(marker => !fs.existsSync(marker))) {
    log('前端依赖不完整，正在执行 npm ci...')
    const dataRoot = toolboxDataRoot()
    const buildTemp = path.join(dataRoot, 'build-tmp')
    const npmCache = path.join(dataRoot, 'npm-cache')
    fs.mkdirSync(buildTemp, { recursive: true })
    fs.mkdirSync(npmCache, { recursive: true })
    run('npm', ['ci'], {
      env: {
        ...process.env,
        TOOLBOX_DATA_ROOT: dataRoot,
        TEMP: buildTemp,
        TMP: buildTemp,
        npm_config_cache: npmCache,
      },
    })
  }
}

function localBackendEnvironment() {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
  const defaultRuntimeRoot = process.env.TOOLBOX_DATA_ROOT || (isWindows
    ? path.win32.join('D:\\', 'AmazonToolboxData')
    : path.join(localAppData, 'AmazonToolboxData'))
  return {
    ...process.env,
    APP_ENV: 'development',
    TOOL_EXECUTION_MODE: 'demo',
    AI_SUPPORT_MODE: 'rules',
    BUNDLED_BACKEND_ENABLED: 'false',
    TOOLBOX_RUNTIME_DIR: process.env.TOOLBOX_RUNTIME_DIR || defaultRuntimeRoot,
    TOOLBOX_DATA_ROOT: defaultRuntimeRoot,
    PYTHONUTF8: process.env.PYTHONUTF8 || '1',
    PYTHONIOENCODING: process.env.PYTHONIOENCODING || 'utf-8',
  }
}

function localPythonExecutable() {
  return path.join(root, 'venv', isWindows ? 'Scripts' : 'bin', isWindows ? 'python.exe' : 'python')
}

function ensureLocalStaffAdmin(env) {
  const python = localPythonExecutable()
  if (!fs.existsSync(python)) fail(`本地 Python 环境不存在：${python}`)
  const status = spawnSync(python, ['-m', 'scripts.bootstrap_staff', '--check'], {
    cwd: path.join(root, 'backend'),
    env,
    stdio: 'pipe',
    windowsHide: true,
    encoding: 'utf8',
  })
  if (status.error) throw status.error
  if (status.status === 0) {
    log((status.stdout || '').trim() || '后台账号已配置。')
    return
  }
  if (status.status !== 3) {
    const reason = (status.stderr || status.stdout || '').trim()
    fail(`无法检查本地后台账号${reason ? `：${reason}` : ''}`)
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    fail('本地数据库尚未创建管理员账号；请在带命令行窗口中双击“开发预览.bat”，并按提示设置首次登录密码')
  }
  log('首次运行需要创建本地管理员账号（用户名默认为 admin）。')
  run(python, ['-m', 'scripts.bootstrap_staff'], {
    cwd: path.join(root, 'backend'),
    env,
  })
}

async function preview(args) {
  ensureDependencies()
  const adminEntry = args.includes('admin') || args.includes('--admin') || process.env.TOOLBOX_PREVIEW_ENTRY === 'admin'
  const requested = optionValue(args, 'backend', args.includes('remote') ? 'remote' : args.includes('local') ? 'local' : 'auto')
  if (!['auto', 'local', 'remote'].includes(requested)) fail(`未知后端模式：${requested}`)
  const development = parseEnvFile('.env.development')
  const deploy = parseEnvFile('.env.deploy')
  const mode = requested === 'auto' ? (process.env.TOOLBOX_PREVIEW_BACKEND || 'local') : requested
  const localUrl = development.VITE_CONTROL_API_BASE || development.VITE_API_BASE || 'http://127.0.0.1:8000'
  const remoteUrl = process.env.TOOLBOX_CONTROL_API_URL || deploy.TOOLBOX_CONTROL_API_URL
  const dryRun = args.includes('--dry-run') || process.env.TOOLBOX_DRY_RUN === '1'
  const backendEnv = localBackendEnvironment()
  let backendProcess
  let url

  if (mode === 'remote') {
    if (!remoteUrl) fail('远程预览缺少 TOOLBOX_CONTROL_API_URL')
    url = remoteUrl
    const result = await health(url)
    if (result.status !== 'ok') fail(`远程后端状态异常：${result.status}`)
    if (result.version !== packageVersion()) {
      log(`警告：远程后端 v${result.version} 与本地 v${packageVersion()} 不一致；预览继续启动。`)
    }
  } else {
    url = localUrl
    try {
      await health(url)
      log(`复用已运行的本地后端：${url}`)
    } catch {
      if (dryRun) {
        log(`本地后端尚未运行；正式预览时会自动启动：${url}`)
      } else {
        log('本地后端未运行，正在自动启动...')
        const backendBat = path.join(root, 'backend', 'start.bat')
        backendProcess = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', cmdQuote(backendBat)], {
          cwd: path.join(root, 'backend'),
          env: { ...backendEnv, TOOLBOX_NO_PAUSE: '1' },
          stdio: 'inherit',
          windowsHide: true,
        })
        await waitForHealth(url)
      }
    }
  }

  try {
    if (mode === 'local' && !dryRun) ensureLocalStaffAdmin(backendEnv)

    log(`预览后端：${url}`)
    if (adminEntry) log('启动入口：管理员登录（保留已记住的 C 端授权码）')
    if (dryRun) {
      log('预览配置检查通过。')
      return
    }

    const env = {
      ...process.env,
      TOOLBOX_CONTROL_API_URL: url,
      VITE_CONTROL_API_BASE: url,
      VITE_API_BASE: url,
      TOOLBOX_USE_BUNDLED_BACKEND: 'false',
      TOOLBOX_START_ROUTE: adminEntry ? '/admin/login' : '',
    }
    await runAsync('npm', ['run', 'electron:dev'], { env, windowsHide: false })
  } finally {
    stopProcessTree(backendProcess)
  }
}

function check(args) {
  ensureDependencies()
  const full = args.includes('full') || args.includes('--full')
  if (args.includes('--dry-run') || process.env.TOOLBOX_DRY_RUN === '1') {
    log(`检查入口配置通过；正式运行将执行${full ? '完整发布门禁' : '前后端快速测试'}。`)
    return
  }
  run('npm', ['run', full ? 'verify:release' : 'verify:quick'])
  log(full ? '完整发布门禁通过。' : '快速检查通过；发布前请运行“检查.bat full”。')
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`
}

function sshConfiguration() {
  const deploy = parseEnvFile('.env.deploy')
  const required = ['DEPLOY_SERVER_HOST', 'DEPLOY_SERVER_USER', 'DEPLOY_SSH_KEY_FILE', 'DEPLOY_REMOTE_DIR', 'DEPLOY_UPDATE_DIR']
  const missing = required.filter(key => !deploy[key])
  if (missing.length) fail(`.env.deploy 缺少：${missing.join(', ')}`)
  if (!/^[A-Za-z_][A-Za-z0-9._-]*\$?$/.test(deploy.DEPLOY_SERVER_USER)) {
    fail(`DEPLOY_SERVER_USER 无效：${deploy.DEPLOY_SERVER_USER}`)
  }
  if (deploy.DEPLOY_SERVER_HOST.startsWith('-') || !/^[A-Za-z0-9._:[\]-]+$/.test(deploy.DEPLOY_SERVER_HOST)) {
    fail(`DEPLOY_SERVER_HOST 无效：${deploy.DEPLOY_SERVER_HOST}`)
  }
  const configuredKey = deploy.DEPLOY_SSH_KEY_FILE.replace(/^~(?=[/\\])/, os.homedir())
  const keyFile = path.isAbsolute(configuredKey) ? configuredKey : path.resolve(root, configuredKey)
  if (!fs.existsSync(keyFile)) fail(`SSH 私钥不存在：${keyFile}`)
  const port = deploy.DEPLOY_SSH_PORT || '22'
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    fail(`DEPLOY_SSH_PORT 无效：${port}`)
  }
  const target = `${deploy.DEPLOY_SERVER_USER}@${deploy.DEPLOY_SERVER_HOST}`
  const base = [
    '-i', keyFile,
    '-o', 'IdentitiesOnly=yes',
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=20',
    '-o', 'ServerAliveInterval=10',
    '-o', 'ServerAliveCountMax=3',
    '-o', 'StrictHostKeyChecking=accept-new',
  ]
  return { deploy, target, sshArgs: ['-p', port, ...base], scpArgs: ['-P', port, ...base] }
}

function privileged(command) {
  return `if [ "$(id -u)" -eq 0 ]; then bash -lc ${shellQuote(command)}; else sudo -n bash -lc ${shellQuote(command)}; fi`
}

function deploymentControlUrl(deploy) {
  const configured = deploy.TOOLBOX_CONTROL_API_URL
    || (deploy.DEPLOY_SERVER_HOST ? `https://${deploy.DEPLOY_SERVER_HOST}` : '')
  if (!configured) fail('.env.deploy 缺少生产控制面地址')
  let parsed
  try {
    parsed = new URL(configured)
  } catch {
    fail(`生产控制面地址无效：${configured}`)
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname) {
    fail(`生产控制面地址必须是 HTTPS 绝对地址：${configured}`)
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    fail('生产控制面地址不得包含凭据、查询参数或片段')
  }
  return parsed.toString().replace(/\/+$/, '')
}

function deploymentIdentity(deploy, controlUrl) {
  return {
    serverHost: deploy.DEPLOY_SERVER_HOST,
    serverUser: deploy.DEPLOY_SERVER_USER,
    sshPort: deploy.DEPLOY_SSH_PORT || '22',
    remoteDir: deploy.DEPLOY_REMOTE_DIR.replace(/\/+$/, ''),
    updateDir: deploy.DEPLOY_UPDATE_DIR.replace(/\/+$/, ''),
    controlUrl,
  }
}

function sameDeploymentIdentity(left, right) {
  const keys = ['serverHost', 'serverUser', 'sshPort', 'remoteDir', 'updateDir', 'controlUrl']
  return Boolean(left && right) && keys.every(key => left[key] === right[key])
}

function requireReleaseLeaseToken(state) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(state.leaseToken || '')) {
    fail(`发布状态缺少有效的服务器租约 token：${state.releaseId}`)
  }
}

function remoteLeaseOwner(state) {
  return JSON.stringify({
    releaseId: state.releaseId,
    version: state.version,
    commitSha: state.commitSha,
    clientHost: os.hostname(),
    clientPid: process.pid,
    sessionId: releaseSessionId,
    claimedAt: new Date().toISOString(),
  })
}

function remoteLeaseGuardedCommand(state, guardedCommand) {
  requireReleaseLeaseToken(state)
  return [
    'set -Eeuo pipefail',
    `lease_file=${shellQuote(REMOTE_PRODUCTION_LEASE)}`,
    `lease_guard=${shellQuote(REMOTE_PRODUCTION_LEASE_GUARD)}`,
    'exec 9>"$lease_guard"',
    'flock -x 9',
    'current_token="$(sed -n \'1p\' "$lease_file" 2>/dev/null || true)"',
    'current_session="$(sed -n \'2p\' "$lease_file" 2>/dev/null || true)"',
    `if [ "$current_token" != ${shellQuote(state.leaseToken)} ] || [ "$current_session" != ${shellQuote(releaseSessionId)} ]; then`,
    '  echo "Production release lease is missing, fenced, or owned by another release" >&2',
    '  exit 74',
    'fi',
    guardedCommand,
  ].join('\n')
}

function acquireRemoteReleaseLease(state, connection) {
  requireReleaseLeaseToken(state)
  const leaseParent = path.posix.dirname(REMOTE_PRODUCTION_LEASE)
  const leaseTemporary = `${leaseParent}/.production.lease.${releaseSessionId}`
  const payload = `${state.leaseToken}\n${releaseSessionId}\n${remoteLeaseOwner(state)}\n`
  const command = [
    'set -Eeuo pipefail',
    `lease_parent=${shellQuote(leaseParent)}`,
    `lease_file=${shellQuote(REMOTE_PRODUCTION_LEASE)}`,
    `lease_guard=${shellQuote(REMOTE_PRODUCTION_LEASE_GUARD)}`,
    `lease_tmp=${shellQuote(leaseTemporary)}`,
    'install -d -o root -g root -m 0700 "$lease_parent"',
    'touch "$lease_guard"',
    'chmod 0600 "$lease_guard"',
    'exec 9>"$lease_guard"',
    'flock -x 9',
    'current_token="$(sed -n \'1p\' "$lease_file" 2>/dev/null || true)"',
    'if [ -e "$lease_file" ] && [ -z "$current_token" ]; then',
    '  echo "Production release lease metadata is invalid; refusing unsafe takeover" >&2',
    '  exit 73',
    'fi',
    `if [ -n "$current_token" ] && [ "$current_token" != ${shellQuote(state.leaseToken)} ]; then`,
    '  current_owner="$(sed -n \'3p\' "$lease_file" 2>/dev/null || true)"',
    '  echo "Production release lease is already held: ${current_owner:-owner metadata unavailable}" >&2',
    '  exit 73',
    'fi',
    'rm -f "$lease_tmp"',
    `printf '%s' ${shellQuote(payload)} >"$lease_tmp"`,
    'chmod 0600 "$lease_tmp"',
    'mv -f "$lease_tmp" "$lease_file"',
  ].join('\n')
  run('ssh', [...connection.sshArgs, connection.target, privileged(command)], {
    redactValues: [state.leaseToken],
  })
  log(`服务器生产租约已持有：${state.releaseId}`)
}

function assertRemoteReleaseLease(state, connection) {
  const command = remoteLeaseGuardedCommand(state, 'true')
  run('ssh', [...connection.sshArgs, connection.target, privileged(command)], {
    redactValues: [state.leaseToken],
  })
}

function releaseRemoteReleaseLease(state, connection) {
  requireReleaseLeaseToken(state)
  const command = [
    'set -Eeuo pipefail',
    `lease_file=${shellQuote(REMOTE_PRODUCTION_LEASE)}`,
    `lease_guard=${shellQuote(REMOTE_PRODUCTION_LEASE_GUARD)}`,
    'exec 9>"$lease_guard"',
    'flock -x 9',
    'current_token="$(sed -n \'1p\' "$lease_file" 2>/dev/null || true)"',
    'current_session="$(sed -n \'2p\' "$lease_file" 2>/dev/null || true)"',
    `if [ "$current_token" != ${shellQuote(state.leaseToken)} ] || [ "$current_session" != ${shellQuote(releaseSessionId)} ]; then`,
    '  echo "Refusing to release a production lease owned by another release session" >&2',
    '  exit 75',
    'fi',
    'rm -f "$lease_file"',
  ].join('\n')
  run('ssh', [...connection.sshArgs, connection.target, privileged(command)], {
    redactValues: [state.leaseToken],
  })
  log(`服务器生产租约已释放：${state.releaseId}`)
}

function parseGithubRepository(remoteUrl) {
  const match = /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/.exec(remoteUrl)
  if (!match) fail(`origin 不是可识别的 GitHub 仓库：${remoteUrl}`)
  return `${match[1]}/${match[2]}`
}

function verifyCleanWorktree() {
  const status = gitOutput(['status', '--porcelain=v1', '--untracked-files=all'])
  if (status) fail(`生产发布要求干净工作区；请先提交或移走以下文件：\n${status}`)
}

function verifyPushedHead() {
  const commitSha = gitOutput(['rev-parse', 'HEAD'])
  let upstream
  try {
    upstream = gitOutput(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])
  } catch {
    fail('当前分支没有上游分支；请先 git push -u')
  }
  const upstreamSha = gitOutput(['rev-parse', upstream])
  if (commitSha !== upstreamSha) {
    fail(`HEAD 尚未完整推送：本地 ${commitSha.slice(0, 12)}，${upstream} ${upstreamSha.slice(0, 12)}`)
  }
  return { commitSha, upstream }
}

function verifyGithubCi(commitSha) {
  const repository = parseGithubRepository(gitOutput(['remote', 'get-url', 'origin']))
  let payload
  try {
    payload = JSON.parse(output('gh', [
      'api',
      '--hostname', 'github.com',
      '-H', 'Accept: application/vnd.github+json',
      `repos/${repository}/commits/${commitSha}/check-runs?per_page=100`,
    ]))
  } catch (error) {
    fail(`无法验证 GitHub CI；请安装并登录 gh 后重试：${error instanceof Error ? error.message : error}`)
  }
  const allChecks = Array.isArray(payload.check_runs) ? payload.check_runs : []
  const latestByName = new Map()
  for (const check of allChecks) {
    const existing = latestByName.get(check.name)
    if (!existing || Number(check.id) > Number(existing.id)) latestByName.set(check.name, check)
  }
  const checks = [...latestByName.values()]
  if (!checks.length) fail(`GitHub 尚无 ${commitSha.slice(0, 12)} 的 CI 结果`)
  const requiredNames = [
    'Frontend and Electron contracts',
    'Backend domains and API',
    'MariaDB migrations and concurrency',
    'Responsive C B Admin smoke',
    'Internal critical-flow acceptance',
    'Windows NSIS install and runtime smoke',
  ]
  const required = requiredNames.map(name => checks.find(check => check.name === name))
  const missing = requiredNames.filter((_name, index) => !required[index])
  const incomplete = required.filter(check => check && (
    check.status !== 'completed'
    || check.conclusion !== 'success'
    || check.head_sha !== commitSha
  ))
  if (missing.length || incomplete.length) {
    const details = [
      ...missing.map(name => `${name}:missing`),
      ...incomplete.map(check => `${check.name}:${check.status}/${check.conclusion || '-'}`),
    ].join(', ')
    fail(`GitHub 必需 CI 尚未全部通过：${details}`)
  }
  log(`GitHub 必需 CI 已通过：${requiredNames.length} 项检查`)
  return commitSha
}

function remoteSemverTags() {
  const records = new Map()
  const remoteRefs = gitOutput(['ls-remote', '--tags', 'origin', 'refs/tags/v*'])
  for (const line of remoteRefs.split(/\r?\n/)) {
    const match = /^([0-9a-f]{40})\s+refs\/tags\/v(\d+\.\d+\.\d+)(\^\{\})?$/.exec(line.trim())
    if (!match) continue
    const [, objectSha, version, peeled] = match
    const record = records.get(version) || { version, objectSha: '', commitSha: '' }
    if (peeled) record.commitSha = objectSha
    else record.objectSha = objectSha
    records.set(version, record)
  }
  return [...records.values()]
    .map(record => ({ ...record, commitSha: record.commitSha || record.objectSha }))
    .sort((left, right) => compareSemver(right.version, left.version))
}

function localTagCommit(tag) {
  let objectSha = ''
  try {
    objectSha = gitOutput(['show-ref', '--verify', '--hash', `refs/tags/${tag}`])
  } catch {
    return ''
  }
  try {
    return gitOutput(['rev-parse', '--verify', `${tag}^{commit}`])
  } catch {
    fail(`本地目标标签 ${tag} 已存在但不能解析为提交：${objectSha}`)
  }
}

async function onlineDesktopVersion(controlUrl) {
  const response = await fetch(`${controlUrl.replace(/\/+$/, '')}/updates/latest.yml`, {
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) fail(`无法读取线上 latest.yml：HTTP ${response.status}`)
  const latest = /^version:\s*['"]?([^'"\s]+)['"]?\s*$/m.exec(await response.text())?.[1]
  if (!latest) fail('线上 latest.yml 缺少版本号')
  return latest
}

async function productionPreflight(version, { verifyCi = true, verifyOnline = true, allowCurrent = false } = {}) {
  verifyCleanWorktree()
  run('git', ['fetch', '--prune', 'origin'])
  const { commitSha, upstream } = verifyPushedHead()
  const mainSha = gitOutput(['rev-parse', 'origin/main'])
  if (commitSha !== mainSha) {
    fail(`生产发布只能从最新 origin/main 执行：HEAD ${commitSha.slice(0, 12)}，origin/main ${mainSha.slice(0, 12)}`)
  }
  if (packageVersion() !== version) {
    fail(`生产发布版本必须已提交到 package.json：当前 ${packageVersion()}，请求 ${version}`)
  }
  const tag = `v${version}`
  const remoteTags = remoteSemverTags()
  const remoteTarget = remoteTags.find(candidate => candidate.version === version)
  if (remoteTarget && remoteTarget.commitSha !== commitSha) {
    fail(`远端目标标签 ${tag} 已指向其他提交：${remoteTarget.commitSha}`)
  }
  if (remoteTarget && !allowCurrent) fail(`远端目标标签 ${tag} 已存在；禁止覆盖已发布版本`)
  const localTarget = localTagCommit(tag)
  if (localTarget && localTarget !== commitSha) {
    fail(`本地目标标签 ${tag} 已指向其他提交：${localTarget}`)
  }
  const latestTag = remoteTags[0]?.version || '0.0.0'
  const tagComparison = compareSemver(version, latestTag)
  if (tagComparison < 0 || (!allowCurrent && tagComparison === 0)) {
    fail(`生产发布版本必须${allowCurrent ? '不低于' : '高于'}远端最新标签 v${latestTag}`)
  }
  const ciAttestedSha = verifyCi ? verifyGithubCi(commitSha) : ''

  const connection = sshConfiguration()
  const { deploy } = connection
  const controlUrl = deploymentControlUrl(deploy)
  if (verifyOnline) {
    const latestOnline = await onlineDesktopVersion(controlUrl)
    const onlineComparison = compareSemver(version, latestOnline)
    if (onlineComparison < 0 || (!allowCurrent && onlineComparison === 0)) {
      fail(`生产发布版本必须${allowCurrent ? '不低于' : '高于'}线上 v${latestOnline}`)
    }
  }
  return {
    commitSha,
    upstream,
    controlUrl,
    deploymentTarget: deploymentIdentity(deploy, controlUrl),
    connection,
    ciAttestedSha,
  }
}

function verifyDeploymentAccess(connection = sshConfiguration()) {
  log(`验证生产 SSH 与免交互 sudo：${connection.target}`)
  run('ssh', [...connection.sshArgs, connection.target, privileged('command -v flock >/dev/null')])
  return connection
}

function deploymentArchive(version, commitSha, artifactDir) {
  const archive = path.join(artifactDir, `amazon-toolbox-backend-${version}-${commitSha.slice(0, 12)}.tar.gz`)
  fs.mkdirSync(artifactDir, { recursive: true })
  fs.rmSync(archive, { force: true })
  run('git', [
    'archive',
    '--format=tar.gz',
    `--output=${archive}`,
    commitSha,
    'package.json',
    'backend',
    'ops',
  ])
  const listing = output('tar', ['-tzf', archive])
  for (const required of ['backend/main.py', 'backend/constraints-py310.txt', 'ops/deploy/deploy-backend.sh', 'package.json']) {
    if (!listing.split(/\r?\n/).includes(required)) fail(`提交归档缺少必要文件：${required}`)
  }
  for (const shellScript of [
    'ops/deploy/deploy-backend.sh',
    'ops/deploy/deploy-web.sh',
    'ops/deploy/restore-backup.sh',
  ]) {
    const source = output('tar', ['-xOf', archive, shellScript])
    if (source.includes('\r')) fail(`提交归档的 Linux 脚本包含 CRLF：${shellScript}`)
  }
  return archive
}

async function deployBackend(state, connection) {
  const { target, sshArgs, scpArgs } = connection
  const archive = state.artifacts.backend.path
  verifyArtifactRecord(state.artifacts.backend)
  const remoteStage = `/tmp/amazon-toolbox-${state.releaseId}-${releaseSessionId}-backend`
  const remoteArchive = `${remoteStage}/${path.basename(archive)}`
  const remoteScript = `${remoteStage}/ops/deploy/deploy-backend.sh`
  try {
    run('ssh', [...sshArgs, target, `rm -rf ${shellQuote(remoteStage)} && mkdir -p ${shellQuote(remoteStage)} && chmod 700 ${shellQuote(remoteStage)}`])
    run('scp', [...scpArgs, archive, `${target}:${remoteStage}/`])
    run('ssh', [...sshArgs, target, [
      'tar -xzf', shellQuote(remoteArchive), '-C', shellQuote(remoteStage),
      shellQuote('ops/deploy/deploy-backend.sh'),
    ].join(' ')])
    const deployCommand = [
      'bash', shellQuote(remoteScript), shellQuote(remoteArchive), shellQuote(state.version),
      shellQuote(state.commitSha), shellQuote(state.releaseId), shellQuote(state.controlUrl),
    ].join(' ')
    run('ssh', [...sshArgs, target, privileged(remoteLeaseGuardedCommand(state, deployCommand))], {
      redactValues: [state.leaseToken],
    })
    const result = await waitForHealth(state.controlUrl, 90_000)
    if (result.version !== state.version) fail(`部署后端版本不匹配：期望 ${state.version}，实际 ${result.version}`)
    if (result.commit_sha !== state.commitSha) {
      fail(`部署后端提交不匹配：期望 ${state.commitSha}，实际 ${result.commit_sha}`)
    }
    if (result.release_id !== state.releaseId) {
      fail(`部署后端发布 ID 不匹配：期望 ${state.releaseId}，实际 ${result.release_id}`)
    }
    log(`生产后端已部署：v${state.version} / ${state.commitSha.slice(0, 12)}`)
  } finally {
    try { run('ssh', [...sshArgs, target, `rm -rf ${shellQuote(remoteStage)}`]) } catch { /* best-effort cleanup */ }
  }
}

function releaseArtifacts(version, releaseDir = path.join(root, 'release')) {
  const manifestPath = path.join(releaseDir, 'latest.yml')
  if (!fs.existsSync(manifestPath)) fail('release/latest.yml 不存在')
  const manifest = fs.readFileSync(manifestPath, 'utf8')
  const manifestVersion = /^version:\s*['"]?([^'"\s]+)['"]?\s*$/m.exec(manifest)?.[1]
  const installerName = /^path:\s*(.+?)\s*$/m.exec(manifest)?.[1]?.replace(/^['"]|['"]$/g, '')
  if (manifestVersion !== version || !installerName) fail('latest.yml 版本或安装包路径无效')
  const installer = path.join(releaseDir, installerName)
  const blockmap = `${installer}.blockmap`
  for (const artifact of [installer, blockmap, manifestPath]) {
    if (!fs.existsSync(artifact)) fail(`发布产物不存在：${artifact}`)
  }
  return { installer, blockmap, manifest: manifestPath }
}

function createWebArtifact(state, artifactDir) {
  const distDir = path.join(root, 'dist')
  if (!fs.existsSync(path.join(distDir, 'index.html'))) fail('Web 构建缺少 dist/index.html')
  const versionMetadata = {
    version: state.version,
    commitSha: state.commitSha,
    releaseId: state.releaseId,
    builtAt: new Date().toISOString(),
  }
  fs.writeFileSync(path.join(distDir, 'web-version.json'), JSON.stringify(versionMetadata), 'utf8')
  const archive = path.join(artifactDir, `kst-web-${state.releaseId}.tar.gz`)
  fs.rmSync(archive, { force: true })
  run('tar', ['-czf', archive, '-C', distDir, '.'])
  return artifactRecord(archive)
}

function copyDesktopArtifacts(version, artifactDir) {
  const built = releaseArtifacts(version)
  const desktopDir = path.join(artifactDir, 'desktop')
  fs.rmSync(desktopDir, { recursive: true, force: true })
  fs.mkdirSync(desktopDir, { recursive: true })
  const copied = {}
  for (const [name, filename] of Object.entries(built)) {
    const target = path.join(desktopDir, path.basename(filename))
    fs.copyFileSync(filename, target)
    copied[name] = artifactRecord(target)
  }
  return copied
}

function releaseVerificationEnvironment(ciAttestedSha = '') {
  const environment = { ...process.env }
  delete environment.TOOLBOX_CI_ATTESTED_SHA
  if (ciAttestedSha) environment.TOOLBOX_CI_ATTESTED_SHA = ciAttestedSha
  return environment
}

function preparedArtifactRecords(state) {
  const desktop = state.artifacts?.desktop
  return [
    state.artifacts?.backend,
    state.artifacts?.web,
    desktop?.installer,
    desktop?.blockmap,
    desktop?.manifest,
  ]
}

function hasPreparedArtifacts(state) {
  return preparedArtifactRecords(state).every(Boolean)
}

function verifyPreparedArtifacts(state) {
  if (!hasPreparedArtifacts(state)) fail(`发布 ${state.releaseId} 的可恢复产物不完整`)
  preparedArtifactRecords(state).forEach(verifyArtifactRecord)
}

async function prepareRelease(state, ciAttestedSha) {
  if (ciAttestedSha !== state.commitSha) fail('MariaDB CI attestation 与发布提交不一致')
  const artifactDir = path.join(releaseStateDirectory(state.releaseId), 'artifacts')
  fs.mkdirSync(artifactDir, { recursive: true })
  run('npm', ['run', 'verify:release'], { env: releaseVerificationEnvironment(ciAttestedSha) })
  run('npm', ['run', 'build:web'])
  const web = createWebArtifact(state, artifactDir)
  run('npm', ['run', 'electron:release'])
  run('npm', ['run', 'package:audit'])
  const desktop = copyDesktopArtifacts(state.version, artifactDir)
  const backend = artifactRecord(deploymentArchive(state.version, state.commitSha, artifactDir))
  return { backend, web, desktop }
}

async function publishWeb(state, connection) {
  const { target, sshArgs, scpArgs } = connection
  verifyArtifactRecord(state.artifacts.web)
  const remoteStage = `/tmp/amazon-toolbox-${state.releaseId}-${releaseSessionId}-web`
  const remoteArchive = `${remoteStage}/${path.basename(state.artifacts.web.path)}`
  const remoteScript = `${remoteStage}/deploy-web.sh`
  try {
    run('ssh', [...sshArgs, target, `rm -rf ${shellQuote(remoteStage)} && mkdir -p ${shellQuote(remoteStage)} && chmod 700 ${shellQuote(remoteStage)}`])
    run('scp', [...scpArgs, state.artifacts.web.path, path.join(root, 'ops', 'deploy', 'deploy-web.sh'), `${target}:${remoteStage}/`])
    const deployCommand = [
      'bash', shellQuote(remoteScript), shellQuote(remoteArchive), shellQuote(state.version),
      shellQuote(state.commitSha), shellQuote(state.releaseId), shellQuote(state.controlUrl),
    ].join(' ')
    run('ssh', [...sshArgs, target, privileged(remoteLeaseGuardedCommand(state, deployCommand))], {
      redactValues: [state.leaseToken],
    })
    const deployed = await getJson(`${state.controlUrl}/web-version.json`, 30_000)
    if (deployed.version !== state.version || deployed.commitSha !== state.commitSha || deployed.releaseId !== state.releaseId) {
      fail('线上 Web 版本元数据与本次发布不一致')
    }
    log(`Web 已原子切换：v${state.version} / ${state.releaseId}`)
  } finally {
    try { run('ssh', [...sshArgs, target, `rm -rf ${shellQuote(remoteStage)}`]) } catch { /* best-effort cleanup */ }
  }
}

async function publishedDesktopMatches(state, baseUrl) {
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/updates/latest.yml`, {
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) return false
  return (await response.text()) === fs.readFileSync(state.artifacts.desktop.manifest.path, 'utf8')
}

async function publishDesktop(state, connection) {
    const { deploy, target, sshArgs, scpArgs } = connection
    const artifacts = Object.values(state.artifacts.desktop)
    artifacts.forEach(verifyArtifactRecord)
    const baseUrl = state.controlUrl
    if (await publishedDesktopMatches(state, baseUrl)) {
      log(`桌面更新已存在且校验一致：v${state.version}`)
      return
    }
    const remoteStage = `/tmp/amazon-toolbox-${state.releaseId}-${releaseSessionId}-desktop`
    run('ssh', [...sshArgs, target, `rm -rf ${shellQuote(remoteStage)} && mkdir -p ${shellQuote(remoteStage)} && chmod 700 ${shellQuote(remoteStage)}`])
    const artifactPaths = artifacts.map(artifact => artifact.path)
    run('scp', [...scpArgs, ...artifactPaths, `${target}:${remoteStage}/`])
    const remoteArtifacts = artifactPaths.map(file => `${remoteStage}/${path.basename(file)}`)
    const backendDir = `${deploy.DEPLOY_REMOTE_DIR.replace(/\/$/, '')}/backend`
    const backendPython = `${deploy.DEPLOY_REMOTE_DIR.replace(/\/$/, '')}/current-venv/bin/python`
    const publishCommand = [
    `chown -R toolbox:toolbox ${shellQuote(remoteStage)}`,
    `cd ${shellQuote(backendDir)}`,
    `runuser -u toolbox -- env UPDATE_RELEASE_DIR=${shellQuote(deploy.DEPLOY_UPDATE_DIR)} PYTHONPATH=. ${shellQuote(backendPython)} scripts/publish_update.py ${shellQuote(state.version)} ${remoteArtifacts.map(shellQuote).join(' ')}`,
  ].join(' && ')
    run('ssh', [...sshArgs, target, privileged(remoteLeaseGuardedCommand(state, publishCommand))], {
      redactValues: [state.leaseToken],
    })
    run('ssh', [...sshArgs, target, `rm -rf ${shellQuote(remoteStage)}`])

  const latestUrl = `${baseUrl}/updates/latest.yml`
  const response = await fetch(latestUrl, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) fail(`线上 latest.yml 返回 HTTP ${response.status}`)
  const latest = await response.text()
  if (!new RegExp(`^version:\\s*${state.version.replaceAll('.', '\\.')}\\s*$`, 'm').test(latest)) {
    fail(`线上 latest.yml 尚未切换到 v${state.version}`)
  }
  if (latest !== fs.readFileSync(state.artifacts.desktop.manifest.path, 'utf8')) {
    fail('线上 latest.yml 与本次已验证产物不一致')
  }
  log(`桌面更新已原子发布：v${state.version}`)
}

async function ask(question) {
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    return (await terminal.question(question)).trim()
  } finally {
    terminal.close()
  }
}

async function verifyPublishedRelease(state) {
  const baseUrl = state.controlUrl
  const live = await getJson(`${baseUrl}/api/health/live`, 30_000)
  if (live.version !== state.version) fail(`最终健康检查版本不匹配：${live.version}`)
  if (live.commit_sha !== state.commitSha) fail(`最终健康检查提交不匹配：${live.commit_sha}`)
  if (live.release_id !== state.releaseId) fail(`最终健康检查发布 ID 不匹配：${live.release_id}`)
  const ready = await getJson(`${baseUrl}/api/health/ready`, 30_000)
  if (ready.status !== 'ok') fail(`生产就绪检查失败：${ready.status}`)
  const web = await getJson(`${baseUrl}/web-version.json`, 30_000)
  if (web.version !== state.version || web.commitSha !== state.commitSha || web.releaseId !== state.releaseId) {
    fail('最终 Web 版本检查不匹配')
  }
  if (!(await publishedDesktopMatches(state, baseUrl))) fail('最终桌面更新清单检查不匹配')
}

async function verifyResumeCheckpoints(state) {
  const baseUrl = state.controlUrl
  if (hasReached(state, 'backend_deployed')) {
    const live = await getJson(`${baseUrl}/api/health/live`, 30_000)
    if (live.version !== state.version || live.commit_sha !== state.commitSha || live.release_id !== state.releaseId) {
      fail('恢复发布前检查失败：线上后端不再匹配已记录的 checkpoint')
    }
    const ready = await getJson(`${baseUrl}/api/health/ready`, 30_000)
    if (ready.status !== 'ok') fail(`恢复发布前检查失败：线上后端未就绪（${ready.status}）`)
  }
  if (hasReached(state, 'web_activated')) {
    const web = await getJson(`${baseUrl}/web-version.json`, 30_000)
    if (web.version !== state.version || web.commitSha !== state.commitSha || web.releaseId !== state.releaseId) {
      fail('恢复发布前检查失败：线上 Web 不再匹配已记录的 checkpoint')
    }
  }
  if (hasReached(state, 'desktop_published') && !(await publishedDesktopMatches(state, baseUrl))) {
    fail('恢复发布前检查失败：线上桌面更新不再匹配已记录的 checkpoint')
  }
  log(`恢复发布 checkpoint 已核对：${state.stage}`)
}

function createAndPushReleaseTag(state) {
  const tag = `v${state.version}`
  const remote = remoteSemverTags().find(candidate => candidate.version === state.version)
  if (remote) {
    if (remote.commitSha !== state.commitSha) fail(`${tag} 已在远端指向其他提交：${remote.commitSha}`)
    log(`远端发布标签已存在且提交一致：${tag}`)
    return
  }
  const existing = localTagCommit(tag)
  if (existing && existing !== state.commitSha) fail(`${tag} 已指向其他提交：${existing}`)
  if (!existing) run('git', ['tag', '-a', tag, state.commitSha, '-m', `Release ${tag}`])
  run('git', ['push', 'origin', tag])
}

async function release(args) {
  ensureDependencies()
  const current = packageVersion()
  const publish = args.includes('--publish')
  const dryRun = args.includes('--dry-run') || process.env.TOOLBOX_DRY_RUN === '1'
  const resumeId = optionValue(args, 'resume', '')
  if (resumeId && !publish) fail('--resume 只能用于生产发布恢复')
  if (publish && (args.includes('--skip-verify') || args.includes('--skip-build'))) {
    fail('生产发布禁止 --skip-verify 和 --skip-build；紧急操作也必须先通过 verify:release')
  }
  let version = optionValue(
    args,
    'version',
    process.env.TOOLBOX_RELEASE_VERSION || args.find(value => /^\d+\.\d+\.\d+$/.test(value)) || (resumeId ? readReleaseState(resumeId).version : ''),
  )
  if (!version) {
    if (!process.stdin.isTTY) fail('非交互发布必须提供 --version=x.y.z')
    const suggested = publish ? current : nextPatch(current)
    version = await ask(`新版本号（回车使用 ${suggested}）：`) || suggested
  }
  semverKey(version)
  if (compareSemver(version, current) < 0) fail(`新版本不能低于当前版本 v${current}`)

  if (publish) {
    if (dryRun) {
      const preflight = await productionPreflight(version, {
        verifyCi: false,
        verifyOnline: false,
        allowCurrent: Boolean(resumeId),
      })
      log(`生产发布 Git/远端标签预检通过：v${version} / ${preflight.commitSha.slice(0, 12)}（未执行 CI、线上健康或 SSH 检查）`)
      log(`正式执行阶段：${RELEASE_STAGES.join(' → ')}`)
      return
    }
    const releaseLock = acquireProductionReleaseLock(resumeId || `v${version}`)
    try {
      const preflight = await productionPreflight(version, {
        verifyCi: true,
        verifyOnline: true,
        allowCurrent: Boolean(resumeId),
      })
      if (process.env.TOOLBOX_AUTO_PUBLISH !== '1') {
        if (!process.stdin.isTTY) fail('非交互生产发布需要 TOOLBOX_AUTO_PUBLISH=1')
        const confirmation = await ask(`确认构建并发布 v${version} 到生产环境？输入 publish 继续：`)
        if (confirmation !== 'publish') fail('已取消生产发布')
      }
      const releaseId = resumeId || `${version}-${preflight.commitSha.slice(0, 12)}`
      const connection = verifyDeploymentAccess(preflight.connection)

      let state
      if (resumeId) {
        state = readReleaseState(resumeId)
        if (state.version !== version || state.commitSha !== preflight.commitSha) {
          fail('恢复发布的版本或提交与当前 HEAD 不一致')
        }
        if (state.controlUrl && state.controlUrl !== preflight.controlUrl) {
          fail(`恢复发布的控制面地址已变化：${state.controlUrl} -> ${preflight.controlUrl}`)
        }
        if (state.deploymentTarget && !sameDeploymentIdentity(state.deploymentTarget, preflight.deploymentTarget)) {
          fail('恢复发布的服务器目标与原发布状态不一致')
        }
        let upgradedState = false
        if (!state.controlUrl) {
          state.controlUrl = preflight.controlUrl
          upgradedState = true
        }
        if (!state.deploymentTarget) {
          state.deploymentTarget = preflight.deploymentTarget
          upgradedState = true
        }
        if (!state.leaseToken) {
          state.leaseToken = crypto.randomUUID()
          upgradedState = true
        }
        if (!state.leaseStatus) {
          state.leaseStatus = 'pending'
          upgradedState = true
        }
        if (typeof state.artifactsPrepared !== 'boolean') {
          state.artifactsPrepared = hasPreparedArtifacts(state)
          upgradedState = true
        }
        if (upgradedState) writeReleaseState(state)
        log(`从 ${state.stage} 恢复发布：${state.releaseId}`)
      } else {
        if (fs.existsSync(statePath(releaseId))) {
          fail(`发布状态已存在，请使用 --resume=${releaseId}`)
        }
        state = {
          schemaVersion: 1,
          releaseId,
          version,
          commitSha: preflight.commitSha,
          upstream: preflight.upstream,
          controlUrl: preflight.controlUrl,
          deploymentTarget: preflight.deploymentTarget,
          leaseToken: crypto.randomUUID(),
          leaseStatus: 'pending',
          artifactsPrepared: false,
          stage: 'prepared',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          artifacts: {},
        }
        writeReleaseState(state)
      }

      if (state.stage === 'verified' && state.leaseStatus === 'released') {
        verifyPreparedArtifacts(state)
        await verifyResumeCheckpoints(state)
        log(`发布流程已经完成：v${version}（生产环境，${state.releaseId}）`)
        return
      }

      acquireRemoteReleaseLease(state, connection)
      state.leaseStatus = 'held'
      writeReleaseState(state)

      let lockedPreflight
      try {
        lockedPreflight = await productionPreflight(version, {
          verifyCi: true,
          verifyOnline: true,
          allowCurrent: Boolean(resumeId),
        })
        if (
          lockedPreflight.commitSha !== state.commitSha
          || lockedPreflight.controlUrl !== state.controlUrl
          || !sameDeploymentIdentity(lockedPreflight.deploymentTarget, state.deploymentTarget)
        ) {
          fail('取得服务器租约后的生产预检上下文已变化')
        }
      } catch (error) {
        if (!resumeId && !state.artifactsPrepared && state.stage === 'prepared') {
          releaseRemoteReleaseLease(state, connection)
          state.leaseStatus = 'pending'
          writeReleaseState(state)
        }
        throw error
      }

      if (!state.artifactsPrepared) {
        if (hasReached(state, 'backend_deployed')) fail('已部署的恢复状态缺少经过验证的发布产物')
        state.artifacts = await prepareRelease(state, lockedPreflight.ciAttestedSha)
        state.artifactsPrepared = true
        writeReleaseState(state)
      }
      verifyPreparedArtifacts(state)
      if (resumeId) await verifyResumeCheckpoints(state)

      if (!hasReached(state, 'backend_deployed')) {
        assertRemoteReleaseLease(state, connection)
        await deployBackend(state, connection)
        assertRemoteReleaseLease(state, connection)
        state.stage = 'backend_deployed'
        writeReleaseState(state)
      }
      if (!hasReached(state, 'web_activated')) {
        assertRemoteReleaseLease(state, connection)
        await publishWeb(state, connection)
        assertRemoteReleaseLease(state, connection)
        state.stage = 'web_activated'
        writeReleaseState(state)
      }
      if (!hasReached(state, 'desktop_published')) {
        assertRemoteReleaseLease(state, connection)
        await publishDesktop(state, connection)
        assertRemoteReleaseLease(state, connection)
        state.stage = 'desktop_published'
        writeReleaseState(state)
      }
      if (!hasReached(state, 'verified')) {
        assertRemoteReleaseLease(state, connection)
        await verifyPublishedRelease(state)
        createAndPushReleaseTag(state)
        assertRemoteReleaseLease(state, connection)
        state.stage = 'verified'
        writeReleaseState(state)
      }
      assertRemoteReleaseLease(state, connection)
      releaseRemoteReleaseLease(state, connection)
      state.leaseStatus = 'released'
      writeReleaseState(state)
      log(`发布流程完成：v${version}（生产环境，${state.releaseId}）`)
      return
    } finally {
      releaseLock()
    }
  }

  if (dryRun) {
    log(`本地发布入口配置通过：当前 v${current}。`)
    return
  }
  if (version !== current) run('npm', ['version', version, '--no-git-tag-version'])
  syncOpenApiReleaseVersion(version)
  if (!args.includes('--skip-verify')) {
    run('npm', ['run', 'verify:release'], { env: releaseVerificationEnvironment() })
  }
  if (!args.includes('--skip-build')) run('npm', ['run', 'electron:release'])
  run('npm', ['run', 'package:audit'])
  log(`发布流程完成：v${version}（仅本地构建）`)
}

function help() {
  console.log(`用法：
  node scripts/toolbox-cli.mjs preview [admin] [local|remote] [--dry-run]
  node scripts/toolbox-cli.mjs check [full] [--dry-run]
  node scripts/toolbox-cli.mjs release [--version=x.y.z] [--publish] [--resume=release-id] [--dry-run]
  本地构建可使用 --skip-verify/--skip-build；生产发布禁止跳过完整门禁。
`)
}

async function main() {
  process.chdir(root)
  const [command = 'help', ...args] = process.argv.slice(2)
  if (command === 'preview') await preview(args)
  else if (command === 'check') check(args)
  else if (command === 'release') await release(args)
  else help()
}

main().catch(error => {
  console.error(`[TOOLBOX] 失败：${error instanceof Error ? error.message : error}`)
  process.exitCode = 1
})
