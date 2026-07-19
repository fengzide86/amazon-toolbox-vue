import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'

import { parseDemoWorksheet } from '@/features/demo/localSpreadsheet'

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
})
