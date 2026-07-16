import { accessSync, constants, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
  build?: { publish?: { url?: string }; win?: { signAndEditExecutable?: boolean } }
}
const updateUrlValue = process.env.ELECTRON_UPDATE_URL?.trim() || packageJson.build?.publish?.url?.trim()
if (!updateUrlValue) throw new Error('Release blocked: missing update publish URL')

const updateUrl = new URL(updateUrlValue)
if (['localhost', '127.0.0.1', 'updates.invalid'].includes(updateUrl.hostname)) {
  throw new Error('Release blocked: ELECTRON_UPDATE_URL cannot use a local or placeholder host')
}
if (updateUrl.protocol !== 'https:' && process.env.ALLOW_INSECURE_UPDATE_URL !== '1') {
  throw new Error('Release blocked: HTTP requires the explicit ALLOW_INSECURE_UPDATE_URL=1 compatibility flag')
}

const signingNames = ['CSC_LINK', 'CSC_KEY_PASSWORD', 'WINDOWS_PUBLISHER_NAME'] as const
const configuredSigning = signingNames.filter(name => Boolean(process.env[name]?.trim()))
if (configuredSigning.length && configuredSigning.length !== signingNames.length) {
  const missing = signingNames.filter(name => !process.env[name]?.trim())
  throw new Error(`Release blocked: incomplete optional signing configuration, missing ${missing.join(', ')}`)
}
if (configuredSigning.length) {
  const certificate = process.env.CSC_LINK as string
  if (!/^(https:\/\/|data:)/i.test(certificate)) accessSync(resolve(certificate), constants.R_OK)
}

if (configuredSigning.length && packageJson.build?.win?.signAndEditExecutable === false) {
  throw new Error('Release blocked: Windows executable signing is disabled')
}

const mode = configuredSigning.length ? 'signed' : 'unsigned (Windows may show unknown publisher)'
const transport = updateUrl.protocol === 'https:' ? 'HTTPS' : 'explicit HTTP compatibility mode'
process.stdout.write(`Release environment verified: ${mode}, ${transport}, ${updateUrl.origin}\n`)
