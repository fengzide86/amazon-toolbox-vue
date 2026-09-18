const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { execFileSync } = require('node:child_process')

function authorName(author) {
  if (typeof author === 'string') return author
  if (author && typeof author.name === 'string') return author.name
  return '课赛通 KST 团队'
}

module.exports = async function brandAfterPack(context) {
  if (context.electronPlatformName !== 'win32') return

  const projectDir = context.packager.projectDir
  const metadata = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'))
  const productName = metadata.build?.productName || '课赛通 KST'
  const executableName = `${productName}.exe`
  const executablePath = path.join(context.appOutDir, executableName)
  const iconPath = path.join(projectDir, metadata.build?.win?.icon || 'build/icon.ico')
  // electron-winstaller is a declared direct development dependency. Resolve
  // its package root instead of relying on electron-builder's transitive
  // node_modules layout, which can change after a clean npm install.
  const winInstallerPackage = require.resolve('electron-winstaller/package.json', { paths: [projectDir] })
  const rceditPath = path.join(path.dirname(winInstallerPackage), 'vendor', 'rcedit.exe')

  for (const requiredPath of [executablePath, iconPath, rceditPath]) {
    if (!fs.existsSync(requiredPath)) throw new Error(`KST Windows branding input is missing: ${requiredPath}`)
  }

  // Both rcedit inputs need ASCII-safe paths. The build wrapper redirects
  // TEMP/TMP to D:; the source project may still have a Chinese directory name.
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'kst-branding-'))
  const temporaryExecutablePath = path.join(temporaryDirectory, 'app.exe')
  const temporaryIconPath = path.join(temporaryDirectory, 'icon.ico')
  try {
    fs.copyFileSync(executablePath, temporaryExecutablePath)
    fs.copyFileSync(iconPath, temporaryIconPath)
    execFileSync(rceditPath, [
      temporaryExecutablePath,
      '--set-icon', temporaryIconPath,
      '--set-file-version', metadata.version,
      '--set-product-version', metadata.version,
      '--set-version-string', 'ProductName', productName,
      '--set-version-string', 'FileDescription', metadata.description || productName,
      '--set-version-string', 'CompanyName', authorName(metadata.author),
      '--set-version-string', 'OriginalFilename', executableName,
      '--set-version-string', 'InternalName', productName,
    ], { stdio: 'inherit', windowsHide: true })
    // Never replace the packaged executable with a partially edited file when
    // rcedit fails. Only a successful resource edit is copied back.
    fs.copyFileSync(temporaryExecutablePath, executablePath)
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true })
  }
}
