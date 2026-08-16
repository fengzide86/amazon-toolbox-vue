const fs = require('node:fs')
const path = require('node:path')
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
  const temporaryExecutablePath = path.join(context.appOutDir, `kst-branding-${process.pid}.exe`)
  const iconPath = path.join(projectDir, metadata.build?.win?.icon || 'build/icon.ico')
  // electron-winstaller is a declared direct development dependency. Resolve
  // its package root instead of relying on electron-builder's transitive
  // node_modules layout, which can change after a clean npm install.
  const winInstallerPackage = require.resolve('electron-winstaller/package.json', { paths: [projectDir] })
  const rceditPath = path.join(path.dirname(winInstallerPackage), 'vendor', 'rcedit.exe')

  for (const requiredPath of [executablePath, iconPath, rceditPath]) {
    if (!fs.existsSync(requiredPath)) throw new Error(`KST Windows branding input is missing: ${requiredPath}`)
  }

  // The bundled rcedit cannot open an executable whose filesystem path
  // contains CJK characters. Rename only while editing, then restore the
  // final user-facing filename before electron-builder continues.
  fs.renameSync(executablePath, temporaryExecutablePath)
  try {
    execFileSync(rceditPath, [
      temporaryExecutablePath,
      '--set-icon', iconPath,
      '--set-file-version', metadata.version,
      '--set-product-version', metadata.version,
      '--set-version-string', 'ProductName', productName,
      '--set-version-string', 'FileDescription', metadata.description || productName,
      '--set-version-string', 'CompanyName', authorName(metadata.author),
      '--set-version-string', 'OriginalFilename', executableName,
      '--set-version-string', 'InternalName', productName,
    ], { stdio: 'inherit', windowsHide: true })
  } finally {
    if (fs.existsSync(temporaryExecutablePath)) {
      fs.renameSync(temporaryExecutablePath, executablePath)
    }
  }
}
