import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'

import { parseCsvRows, parseDemoSpreadsheetBuffer, parseDemoWorksheet } from '@/features/demo/localSpreadsheet'

describe('local demo spreadsheet parser', () => {
  it('retains only a masked label and never returns raw account or cookie values', () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('demo')
    sheet.addRow(['客户简称', 'Cookie'])
    sheet.addRow(['seller@example.com', 'sensitive-cookie-value'])

    const result = parseDemoWorksheet(sheet, 'demo.xlsx', [
      { key: 'account_label', label: '客户简称', required: true },
      { key: 'cookie', label: 'Cookie', required: true, sensitive: true },
    ], 10)

    expect(result.validCount).toBe(1)
    expect(result.rows[0]?.preview.account_label).toBe('se***@example.com')
    expect(structuredClone(result).rows[0]?.sourceRow).toBe(2)
    expect(JSON.stringify(result)).not.toContain('seller@example.com')
    expect(JSON.stringify(result)).not.toContain('sensitive-cookie-value')
  })

  it('rejects formula cells instead of evaluating them', () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('demo')
    sheet.addRow(['客户简称'])
    sheet.getCell('A2').value = { formula: 'HYPERLINK("https://example.com")', result: 'seller' }

    expect(() => parseDemoWorksheet(sheet, 'demo.xlsx')).toThrow('公式')
  })

  it('parses quoted browser CSV files and keeps raw values out of the preview', async () => {
    const csv = '\uFEFF客户简称,Cookie\r\n"seller, one@example.com",secret-cookie\r\n'
    expect(parseCsvRows(csv)[1]).toEqual(['seller, one@example.com', 'secret-cookie'])
    const result = await parseDemoSpreadsheetBuffer(new TextEncoder().encode(csv).buffer, 'demo.csv', [
      { key: 'account_label', label: '客户简称', required: true },
      { key: 'cookie', label: 'Cookie', required: true, sensitive: true },
    ])
    expect(result.validCount).toBe(1)
    expect(result.worksheetName).toBe('CSV')
    expect(JSON.stringify(result)).not.toContain('secret-cookie')
  })

  it('finds a matching worksheet and a later header after cover sheets and instructions', async () => {
    const workbook = new ExcelJS.Workbook()
    workbook.addWorksheet('使用说明').addRow(['这里不是待执行数据'])
    const hidden = workbook.addWorksheet('旧数据', { state: 'hidden' })
    hidden.addRows([['客户简称', 'SKU'], ['hidden@example.com', 'hidden-sku']])
    const sheet = workbook.addWorksheet('商品上架')
    sheet.addRows([['填写说明'], [], ['客户简称', 'SKU'], ['seller@example.com', 'source-sku']])
    const result = await parseDemoSpreadsheetBuffer(await workbook.xlsx.writeBuffer(), 'test.xlsx', [
      { key: 'sku', label: 'SKU', required: true },
    ])
    expect(result.worksheetName).toBe('商品上架')
    expect(result.validCount).toBe(1)
    expect(result.rows[0]?.preview).toEqual({ account_label: 'se***@example.com' })
    expect(structuredClone(result).rows[0]?.sourceRow).toBe(4)
    expect(JSON.stringify(result)).not.toContain('source-sku')
    expect(JSON.stringify(result)).not.toContain('hidden@example.com')
  })

  it('honors an explicit worksheet hint instead of choosing an equally matching earlier sheet', async () => {
    const workbook = new ExcelJS.Workbook()
    workbook.addWorksheet('第一张').addRows([['客户简称'], ['wrong@example.com']])
    workbook.addWorksheet('当前工具').addRows([['客户简称'], ['right@example.com']])
    const result = await parseDemoSpreadsheetBuffer(await workbook.xlsx.writeBuffer(), 'test.xlsx', [], 50, {
      worksheetHint: '当前工具',
    })
    expect(result.worksheetName).toBe('当前工具')
    expect(result.rows[0]?.preview.account_label).toBe('ri***@example.com')
  })

  it('keeps a clear missing-column failure rather than importing the instruction sheet', async () => {
    const workbook = new ExcelJS.Workbook()
    workbook.addWorksheet('使用说明').addRow(['请填写本工具要求的列'])
    await expect(parseDemoSpreadsheetBuffer(await workbook.xlsx.writeBuffer(), 'test.xlsx')).rejects.toThrow('缺少必填列')
  })

  it('does not interpret a non-workbook file as a blank successful import', async () => {
    await expect(parseDemoSpreadsheetBuffer(new TextEncoder().encode('not an xlsx workbook').buffer, 'test.xlsx')).rejects.toThrow()
  })
})
