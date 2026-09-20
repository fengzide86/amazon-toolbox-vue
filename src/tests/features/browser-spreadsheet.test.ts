import ExcelJS from 'exceljs'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { parseBrowserDemoSpreadsheet } from '@/features/demo/browserSpreadsheet'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('browser spreadsheet boundary', () => {
  it('passes worksheet context and transfers bytes to the existing worker', async () => {
    vi.stubEnv('MODE', 'production')
    const terminate = vi.fn()
    const postMessage = vi.fn()
    let reply: (event: MessageEvent) => void = () => {}
    vi.stubGlobal('Worker', class {
      terminate = terminate
      addEventListener(type: string, listener: (event: MessageEvent) => void) {
        if (type === 'message') reply = listener
      }
      postMessage(message: unknown, transfer: unknown[]) {
        postMessage(message, transfer)
        reply({ data: { ok: true, result: { importId: 'worker-preview', validCount: 1, rows: [], errors: [] } } } as MessageEvent)
      }
    })
    const buffer = new TextEncoder().encode('客户简称\nlocal@example.com').buffer
    const file = { name: 'local.csv', size: buffer.byteLength, arrayBuffer: async () => buffer } as File
    const selection = { capabilityKey: 'listing_script', worksheetHint: '商品上架' }
    const result = await parseBrowserDemoSpreadsheet(file, [], 7, selection)

    expect(postMessage).toHaveBeenCalledWith({ buffer, fileName: 'local.csv', inputSchema: [], maxRows: 7, selection }, [buffer])
    expect(result.importId).toBe('worker-preview')
    expect(terminate).toHaveBeenCalledOnce()
  })

  it('retains worksheet selection when a browser cannot start a worker', async () => {
    vi.stubEnv('MODE', 'production')
    vi.stubGlobal('Worker', class {
      constructor() { throw new Error('Worker unavailable') }
    })
    const workbook = new ExcelJS.Workbook()
    workbook.addWorksheet('非当前工具').addRows([['客户简称'], ['wrong@example.com']])
    workbook.addWorksheet('当前工具').addRows([['客户简称'], ['right@example.com']])
    const bytes = await workbook.xlsx.writeBuffer()
    const file = { name: 'local.xlsx', size: bytes.byteLength, arrayBuffer: async () => bytes } as File
    const result = await parseBrowserDemoSpreadsheet(file, [], 50, { worksheetHint: '当前工具' })

    expect(result.worksheetName).toBe('当前工具')
    expect(result.rows[0]?.preview.account_label).toBe('ri***@example.com')
    expect(JSON.stringify(result)).not.toContain('right@example.com')
  })
})
