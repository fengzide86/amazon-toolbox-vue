import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { parseBatchFile, writeBatchErrors } = require('../../../dist-electron/electron/automation/batch-importer.cjs')
const temporaryDirectories = []

async function tempFile(name, content) {
  const directory = await mkdtemp(join(tmpdir(), 'toolbox-batch-'))
  temporaryDirectories.push(directory)
  const filePath = join(directory, name)
  await writeFile(filePath, content, 'utf8')
  return filePath
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('batch importer', () => {
  it('只读取白名单字段并忽略密码列', async () => {
    const filePath = await tempFile('accounts.csv', 'account_label,password,store\n客户甲,secret,店铺A\n')
    const result = await parseBatchFile(filePath, [
      { key: 'account_label', label: '客户简称', required: true },
      { key: 'password', label: '密码', required: true, sensitive: true },
      { key: 'store', label: '店铺', required: false },
    ], 50)

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].input).toEqual({ account_label: '客户甲', store: '店铺A' })
    expect(JSON.stringify(result.rows[0])).not.toContain('secret')
  })

  it('公式内容只形成本地错误，不进入可执行数据', async () => {
    const filePath = await tempFile('accounts.csv', 'account_label\n客户甲\n=HYPERLINK("https://bad.example")\n')
    const result = await parseBatchFile(filePath, [{ key: 'account_label', label: '客户简称', required: true }], 50)

    expect(result.rows).toHaveLength(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).toContain('公式')
  })

  it('导出问题清单时阻止 CSV 公式注入', async () => {
    const filePath = await tempFile('errors.csv', '')
    await writeBatchErrors(filePath, [{ rowNumber: 2, message: '=cmd|calc' }])
    const output = await readFile(filePath, 'utf8')

    expect(output).not.toMatch(/,=cmd/)
    expect(output).toContain("'=cmd")
  })
})
