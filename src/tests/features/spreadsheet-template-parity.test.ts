import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { parseDemoSpreadsheetBuffer } from '@/features/demo/localSpreadsheet'

const require = createRequire(import.meta.url)
const { parseBatchFile } = require('../../../dist-electron/electron/automation/batch-importer.cjs')
const templatePath = resolve('resources/templates/B端批量自动化测试数据.xlsx')
const fields = [{ key: 'account_label', label: '客户简称', required: true }]
const templateTools = [
  ['register', '快速注册'],
  ['listing_script', '商品上架'],
  ['logistics_cost', '物流比价'],
  ['logistics_standard', '物流模板'],
  ['ship_script', '自动发货'],
  ['replenishment', '智能补货'],
  ['fba_agl', 'FBA发货'],
  ['agl', 'AGL入库'],
  ['ad_script', '广告活动'],
  ['ali_listing', '速卖通上品'],
  ['ali_ship', '速卖通发货'],
] as const

describe('the shipped multi-sheet template on desktop and Web', () => {
  it.each(templateTools)('%s selects %s with the same eight source rows', async (capabilityKey, worksheetName) => {
    // All schemas intentionally match: capability metadata, not sheet order,
    // must disambiguate tools in the real, namespace-prefixed resource file.
    const source = await readFile(templatePath)
    const desktop = await parseBatchFile(templatePath, { capabilityKey, schema: fields, maxRows: 50 })
    const web = await parseDemoSpreadsheetBuffer(
      Uint8Array.from(source).buffer, 'template.xlsx', fields, 50, { capabilityKey },
    )

    expect(web.worksheetName).toBe(worksheetName)
    expect(web.worksheetName).toBe(desktop.worksheetName)
    expect(web.templateVersion).toBe('1.0.0')
    expect(web.templateVersion).toBe(desktop.templateVersion)
    expect(web.validCount).toBe(8)
    expect(web.validCount).toBe(desktop.rows.length)
    expect(web.errors).toEqual(desktop.errors)
    for (const row of web.rows) {
      expect(Object.keys(row).sort()).toEqual(['itemId', 'preview', 'sourceRow'])
      expect(Object.keys(row.preview)).toEqual(['account_label'])
      expect(row.preview.account_label).toContain('***')
    }
    expect(structuredClone(web).rows.map(row => row.sourceRow)).toEqual(desktop.rows.map(row => row.sourceRow))
    expect(web.rows.every(row => Number.isInteger(row.sourceRow) && row.sourceRow! > 1)).toBe(true)
    for (const row of desktop.rows) expect(JSON.stringify(web)).not.toContain(row.input.account_label)
    expect(await readFile(templatePath)).toEqual(source)
  })

  it('preserves the caller limit and the actual template row numbers on both runtimes', async () => {
    const source = await readFile(templatePath)
    const desktop = await parseBatchFile(templatePath, { capabilityKey: 'listing_script', schema: fields, maxRows: 2 })
    const web = await parseDemoSpreadsheetBuffer(
      Uint8Array.from(source).buffer, 'template.xlsx', fields, 2, { capabilityKey: 'listing_script' },
    )
    expect(web.validCount).toBe(2)
    expect(desktop.rows).toHaveLength(2)
    expect(web.errors).toHaveLength(6)
    expect(web.rows.map(row => row.sourceRow)).toEqual(desktop.rows.map(row => row.sourceRow))
    expect(web.errors.map(error => error.rowNumber)).toEqual(desktop.errors.map(error => error.rowNumber))
  })
})
