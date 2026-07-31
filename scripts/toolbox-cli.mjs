import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import readline from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const isWindows = process.platform === 'win32'

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
  log(`运行：${command} ${args.join(' ')}`)
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
    run('npm', ['ci'])
  }
}

function localBackendEnvironment() {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
  const defaultRuntimeRoot = isWindows
    ? path.win32.join('D:\\', 'AmazonToolboxData')
    : path.join(localAppData, 'AmazonToolboxData')
  return {
    ...process.env,
    APP_ENV: 'development',
    TOOL_EXECUTION_MODE: 'demo',
    AI_SUPPORT_MODE: 'rules',
    BUNDLED_BACKEND_ENABLED: 'false',
    TOOLBOX_RUNTIME_DIR: process.env.TOOLBOX_RUNTIME_DIR || defaultRuntimeRoot,
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
  run('npm', ['run', full ? 'verify' : 'verify:quick'])
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

function verifyDeploymentAccess() {
  const connection = sshConfiguration()
  log(`验证生产 SSH 与免交互 sudo：${connection.target}`)
  run('ssh', [...connection.sshArgs, connection.target, privileged('true')])
  return connection
}

function deploymentArchive(version) {
  const archive = path.join(os.tmpdir(), `amazon-toolbox-backend-${version}-${Date.now()}.tar.gz`)
  const listPath = `${archive}.files.txt`
  try {
    const listed = run(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', 'backend', 'ops', 'package.json'],
      { stdio: 'pipe' },
    ).stdout
    const files = listed
      .split(/\r?\n/)
      .map(value => value.trim())
      .filter(Boolean)
      .filter(value => !value.startsWith('backend/tests/'))
      .filter(value => !['backend/.env', 'backend/.env.production', 'backend/database.db'].includes(value))
    if (!files.includes('backend/main.py') || !files.includes('package.json') || !files.includes('ops/deploy/deploy-backend.sh')) {
      fail('后端部署白名单缺少必要文件')
    }
    fs.writeFileSync(listPath, `${files.join('\n')}\n`, 'utf8')
    run('tar', ['-czf', archive, '-T', listPath])
    return archive
  } catch (error) {
    fs.rmSync(archive, { force: true })
    throw error
  } finally {
    fs.rmSync(listPath, { force: true })
  }
}

async function deployBackend(version) {
  const { deploy, target, sshArgs, scpArgs } = sshConfiguration()
  const archive = deploymentArchive(version)
  const stamp = Date.now()
  const remoteStage = `/tmp/amazon-toolbox-${version}-${stamp}`
  const remoteArchive = `${remoteStage}/${path.basename(archive)}`
  const remoteScript = `${remoteStage}/deploy-backend.sh`
  try {
    run('ssh', [...sshArgs, target, `mkdir -p ${shellQuote(remoteStage)} && chmod 700 ${shellQuote(remoteStage)}`])
    run('scp', [...scpArgs, archive, path.join(root, 'ops', 'deploy', 'deploy-backend.sh'), `${target}:${remoteStage}/`])
    run('ssh', [...sshArgs, target, privileged(`bash ${shellQuote(remoteScript)} ${shellQuote(remoteArchive)} ${shellQuote(version)}`)])
    const controlUrl = deploy.TOOLBOX_CONTROL_API_URL || `https://${deploy.DEPLOY_SERVER_HOST}`
    const result = await waitForHealth(controlUrl, 90_000)
    if (result.version !== version) fail(`部署后端版本不匹配：期望 ${version}，实际 ${result.version}`)
    log(`生产后端已部署：v${version}`)
    return { deploy, target, sshArgs, scpArgs, remoteStage }
  } finally {
    fs.rmSync(archive, { force: true })
  }
}

function releaseArtifacts(version) {
  const releaseDir = path.join(root, 'release')
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
  return [installer, blockmap, manifestPath]
}

async function publishDesktop(version, connection) {
    const { deploy, target, sshArgs, scpArgs, remoteStage } = connection
    const artifacts = releaseArtifacts(version)
    run('scp', [...scpArgs, ...artifacts, `${target}:${remoteStage}/`])
    const remoteArtifacts = artifacts.map(file => `${remoteStage}/${path.basename(file)}`)
    const backendDir = `${deploy.DEPLOY_REMOTE_DIR.replace(/\/$/, '')}/backend`
    const publishCommand = [
    `chown -R toolbox:toolbox ${shellQuote(remoteStage)}`,
    `cd ${shellQuote(backendDir)}`,
    `runuser -u toolbox -- env UPDATE_RELEASE_DIR=${shellQuote(deploy.DEPLOY_UPDATE_DIR)} PYTHONPATH=. .venv/bin/python scripts/publish_update.py ${shellQuote(version)} ${remoteArtifacts.map(shellQuote).join(' ')}`,
  ].join(' && ')
    run('ssh', [...sshArgs, target, privileged(publishCommand)])
    run('ssh', [...sshArgs, target, `rm -rf ${shellQuote(remoteStage)}`])

  const latestUrl = `${(deploy.TOOLBOX_CONTROL_API_URL || `https://${deploy.DEPLOY_SERVER_HOST}`).replace(/\/+$/, '')}/updates/latest.yml`
  const response = await fetch(latestUrl, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) fail(`线上 latest.yml 返回 HTTP ${response.status}`)
  const latest = await response.text()
  if (!new RegExp(`^version:\\s*${version.replaceAll('.', '\\.')}\\s*$`, 'm').test(latest)) {
    fail(`线上 latest.yml 尚未切换到 v${version}`)
  }
  log(`桌面更新已原子发布：v${version}`)
}

async function ask(question) {
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    return (await terminal.question(question)).trim()
  } finally {
    terminal.close()
  }
}

async function release(args) {
  ensureDependencies()
  const current = packageVersion()
  const publish = args.includes('--publish')
  const dryRun = args.includes('--dry-run') || process.env.TOOLBOX_DRY_RUN === '1'
  if (dryRun) {
    if (publish) verifyDeploymentAccess()
    log(`发布入口配置通过：当前 v${current}${publish ? '，目标为生产发布' : '，目标为本地构建'}。`)
    return
  }
  let version = optionValue(
    args,
    'version',
    process.env.TOOLBOX_RELEASE_VERSION || args.find(value => /^\d+\.\d+\.\d+$/.test(value)) || '',
  )
  if (!version) {
    if (!process.stdin.isTTY) fail('非交互发布必须提供 --version=x.y.z')
    const suggested = nextPatch(current)
    version = await ask(`新版本号（回车使用 ${suggested}）：`) || suggested
  }
  semverKey(version)
  if (compareSemver(version, current) < 0) fail(`新版本不能低于当前版本 v${current}`)

  if (publish) {
    const deploy = parseEnvFile('.env.deploy')
    const controlUrl = deploy.TOOLBOX_CONTROL_API_URL || (deploy.DEPLOY_SERVER_HOST ? `https://${deploy.DEPLOY_SERVER_HOST}` : '')
    if (!controlUrl) fail('.env.deploy 缺少生产控制面地址')
    const response = await fetch(`${controlUrl.replace(/\/+$/, '')}/updates/latest.yml`, { signal: AbortSignal.timeout(30_000) })
    if (!response.ok) fail(`无法读取线上 latest.yml：HTTP ${response.status}`)
    const latest = /^version:\s*['"]?([^'"\s]+)['"]?\s*$/m.exec(await response.text())?.[1]
    if (!latest) fail('线上 latest.yml 缺少版本号')
    if (compareSemver(version, latest) <= 0) fail(`生产发布版本必须高于线上 v${latest}`)
    verifyDeploymentAccess()
  }
  if (publish && process.env.TOOLBOX_AUTO_PUBLISH !== '1') {
    if (!process.stdin.isTTY) fail('非交互生产发布需要 TOOLBOX_AUTO_PUBLISH=1')
    const confirmation = await ask(`确认构建并发布 v${version} 到生产环境？输入 publish 继续：`)
    if (confirmation !== 'publish') fail('已取消生产发布')
  }

  if (version !== current) run('npm', ['version', version, '--no-git-tag-version'])
  syncOpenApiReleaseVersion(version)
  if (!args.includes('--skip-verify')) run('npm', ['run', 'verify'])
  if (!args.includes('--skip-build')) run('npm', ['run', 'electron:release'])
  run('npm', ['run', 'package:audit'])

  if (publish) {
    const connection = await deployBackend(version)
    await publishDesktop(version, connection)
  }
  log(`发布流程完成：v${version}${publish ? '（生产环境）' : '（仅本地构建）'}`)
}

function help() {
  console.log(`用法：
  node scripts/toolbox-cli.mjs preview [admin] [local|remote] [--dry-run]
  node scripts/toolbox-cli.mjs check [full] [--dry-run]
  node scripts/toolbox-cli.mjs release [--version=x.y.z] [--publish] [--skip-verify] [--skip-build] [--dry-run]
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
