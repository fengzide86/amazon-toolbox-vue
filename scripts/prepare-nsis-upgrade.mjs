import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { appendFile, mkdir, readFile, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

// A pinned, actually released binary. Never substitute today's latest.yml.
const fixture = JSON.parse(await readFile(new URL('./nsis-upgrade-fixture.json', import.meta.url), 'utf8'))
const destination = path.resolve(process.env.NSIS_FIXTURE_DIR || 'D:/AmazonToolboxData/installer-fixtures')
if (path.parse(destination).root.toLowerCase() !== 'd:\\') throw new Error('Installer fixtures must stay on D:')
await mkdir(destination, { recursive: true })
const output = path.join(destination, fixture.fileName)
async function matches(file) {
  if ((await stat(file).catch(() => null))?.size !== fixture.size) return false
  const hash = createHash('sha512')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex') === fixture.sha512
}
if (!await matches(output)) {
  if (await stat(output).catch(() => null)) throw new Error('Cached old installer has unexpected bytes; preserve it for inspection instead of overwriting')
  const temporary = `${output}.${process.pid}.download`
  const signal = AbortSignal.timeout(900_000)
  try {
    console.log('Downloading pinned 1.8.5 installer (maximum 15 minutes, SHA512 checked before execution)')
    const response = await fetch(fixture.url, { signal, redirect: 'error' })
    if (!response.ok || !response.body) throw new Error(`Pinned old installer download failed: HTTP ${response.status}`)
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary, { flags: 'wx' }), { signal })
    if (!await matches(temporary)) throw new Error('Pinned old installer SHA512/size mismatch')
    await rename(temporary, output)
  } finally { await rm(temporary, { force: true }) }
}
if (process.env.GITHUB_ENV) await appendFile(process.env.GITHUB_ENV, `NSIS_PREVIOUS_INSTALLER=${output}\n`)
console.log(`nsis_previous_version=${fixture.version}`)
console.log(`nsis_previous_installer=${output}`)
console.log('nsis_previous_sha512=verified')
