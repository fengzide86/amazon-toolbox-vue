import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const apiDirectory = path.join(root, 'src', 'utils', 'api')
const baselinePath = path.join(root, 'src', 'shared', 'api', 'unknown-response-baseline.json')
const promiseUnknownPattern = /Promise\s*<\s*unknown\s*>/g

function collectUnknownResponses() {
  const result = {}
  for (const name of fs.readdirSync(apiDirectory).filter(entry => entry.endsWith('.ts')).sort()) {
    const source = fs.readFileSync(path.join(apiDirectory, name), 'utf8')
    const count = source.match(promiseUnknownPattern)?.length ?? 0
    if (count > 0) result[name] = count
  }
  return result
}

const current = collectUnknownResponses()
if (process.argv.includes('--write-baseline')) {
  fs.writeFileSync(baselinePath, `${JSON.stringify(current, null, 2)}\n`, 'utf8')
  console.log(`frontend_api_unknown_baseline=written total=${Object.values(current).reduce((sum, value) => sum + value, 0)}`)
  process.exit(0)
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
const errors = []
for (const [name, count] of Object.entries(current)) {
  const allowed = Number(baseline[name] ?? 0)
  if (count > allowed) errors.push(`${name}: current=${count} allowed=${allowed}`)
}

if (errors.length > 0) {
  for (const error of errors) console.error(`frontend_api_contract_error=${error}`)
  process.exit(1)
}

const total = Object.values(current).reduce((sum, value) => sum + value, 0)
const allowedTotal = Object.values(baseline).reduce((sum, value) => sum + Number(value), 0)
console.log(`frontend_api_contracts=verified unknown_responses=${total} baseline=${allowedTotal}`)
