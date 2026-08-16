import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'

import { quoteFreight } from '@/shared/freight/rate-engine'
import { parseFreightWorkbookBuffer } from '@/shared/freight/workbook-parser'

describe('browser freight workbook parser', () => {
  it('normalizes the bundled workbook in memory and quotes without Electron', async () => {
    const workbook = new ExcelJS.Workbook()
    const chinaPost = workbook.addWorksheet('中国邮政挂号小包')
    chinaPost.getRow(10).values = ['美国', 'United States', 'US', 30, 10, 28, 11, 26, 12, '']
    const ePacket = workbook.addWorksheet('e邮宝')
    ePacket.getRow(9).values = ['United States', 'US', '美国', 50, 55, 12]
    const yanwen = workbook.addWorksheet('燕文航空挂号小包')
    yanwen.getRow(8).values = [null, '美国', 'United States', 'US', 29, 9, 27, 10, 25, 11]
    const ups = workbook.addWorksheet('UPS')
    ups.getRow(9).values = ['United States', '美国', 'US', ...Array.from({ length: 20 }, (_, index) => 80 + index), ...[50, 48, 46, 44, 42, 40, 38]]
    const buffer = await workbook.xlsx.writeBuffer()
    const parsed = await parseFreightWorkbookBuffer(buffer, 'FreightTemplate_v2.xlsx', {
      id: 'competition-freight', version: '1.0.0', exchangeRateCnyPerUsd: 7,
    })

    expect(parsed.summary.carrierCount).toBe(4)
    expect(parsed.summary.countryCount).toBe(1)
    expect(parsed.summary.ruleCount).toBe(4)
    expect(parsed.pack.sourceHash).toMatch(/^[a-f0-9]{64}$/)
    expect(quoteFreight(parsed.pack, {
      country: 'US', actualWeightKg: 0.5, dimensionsCm: { length: 20, width: 15, height: 8 },
    }).selected).not.toBeNull()
  }, 30_000)
})
