import { accessSync, constants, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const required = ['ELECTRON_UPDATE_URL', 'CSC_LINK', 'CSC_KEY_PASSWORD', 'WINDOWS_PUBLISHER_NAME'] as const
const missing = required.filter(name => !process.env[name]?.trim())
if (missing.length) {
  throw new Error(`Release blocked: missing ${missing.join(', ')}`)
}

const updateUrl = new URL(process.env.ELECTRON_UPDATE_URL as string)
if (updateUrl.protocol !== 'https:') {
  throw new Error('Release blocked: ELECTRON_UPDATE_URL must use HTTPS')
}

const certificate = process.env.CSC_LINK as string
if (!/^(https:\/\/|data:)/i.test(certificate)) {
  const certificatePath = resolve(certificate)
  accessSync(certificatePath, constants.R_OK)
}

const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
  build?: { publish?: { url?: string }; win?: { signAndEditExecutable?: boolean } }
}
if (packageJson.build?.win?.signAndEditExecutable === false) {
  throw new Error('Release blocked: Windows executable signing is disabled')
}
if (packageJson.build?.publish?.url?.startsWith('http://')) {
  throw new Error('Release blocked: package publish URL is insecure')
}

process.stdout.write(`Release environment verified for ${updateUrl.origin}\n`)
