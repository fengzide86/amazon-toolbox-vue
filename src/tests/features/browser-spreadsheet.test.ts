import ExcelJS from 'exceljs'
import { reactive } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { parseBrowserDemoSpreadsheet } from '@/features/demo/browserSpreadsheet'
import { parseDemoSpreadsheetBuffer } from '@/features/demo/localSpreadsheet'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('browser spreadsheet boundary', () => {
  it('retains non-contiguous source rows through the worker structured-clone round trip', async () => {
    vi.stubEnv('MODE', 'production')
    const terminate = vi.fn()
    let reply: (event: MessageEvent) => void = () => {}
    vi.stubGlobal('Worker', class {
      terminate = terminate
      addEventListener(type: string, listener: (event: MessageEvent) => void) {
        if (type === 'message') reply = listener
      }
      postMessage(message: { buffer: ArrayBuffer; fileName: string; inputSchema: Array<Record<string, unknown>>; maxRows: number }) {
        const request = structuredClone(message)
        void parseDemoSpreadsheetBuffer(request.buffer, request.fileName, request.inputSchema, request.maxRows)
          .then(result => reply({ data: structuredClone({ ok: true, result }) } as MessageEvent))
          .catch(error => reply({ data: { ok: false, error: String(error) } } as MessageEvent))
      }
    })
    const workbook = new ExcelJS.Workbook()
    workbook.addWorksheet('导入数据').addRows([
      ['填写说明'], [], ['客户简称', '密码'], ['first@example.com', 'first-secret'], [],
      ['invalid@example.com', ''], ['last@example.com', 'last-secret'],
    ])
    const buffer = await workbook.xlsx.writeBuffer()
    const arrayBuffer = vi.fn(async () => buffer)
    const file = { name: 'local.xlsx', size: buffer.byteLength, arrayBuffer } as unknown as File
    const result = await parseBrowserDemoSpreadsheet(file, [
      { key: 'password', label: '密码', required: true, sensitive: true },
    ])

    expect(result.rows.map(row => row.sourceRow)).toEqual([4, 7])
    expect(result.errors.map(error => error.rowNumber)).toEqual([6])
    expect(result.rows.map(row => Object.keys(row).sort())).toEqual([
      ['itemId', 'preview', 'sourceRow'], ['itemId', 'preview', 'sourceRow'],
    ])
    expect(JSON.stringify(result)).not.toMatch(/first@example.com|invalid@example.com|last@example.com|first-secret|last-secret/)
    // A successful worker parse must not be rescued by the inline fallback.
    expect(arrayBuffer).toHaveBeenCalledOnce()
    expect(terminate).toHaveBeenCalledOnce()
  })

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

  it('copies reactive schema and selection into a structured-clone-safe worker message', async () => {
    vi.stubEnv('MODE', 'production')
    let reply: (event: MessageEvent) => void = () => {}
    const sent = vi.fn()
    vi.stubGlobal('Worker', class {
      terminate = vi.fn()
      addEventListener(type: string, listener: (event: MessageEvent) => void) {
        if (type === 'message') reply = listener
      }
      postMessage(message: unknown) {
        sent(structuredClone(message))
        reply({ data: { ok: true, result: { importId: 'real-worker', validCount: 1, rows: [], errors: [] } } } as MessageEvent)
      }
    })
    const schema = reactive([{ key: 'account_label', label: '客户简称', required: true, ignored: reactive({ value: 'unused' }) }])
    const selection = reactive({ capabilityKey: 'logistics_standard' })
    const buffer = new TextEncoder().encode('客户简称\nlocal@example.com').buffer
    const file = { name: 'local.csv', size: buffer.byteLength, arrayBuffer: async () => buffer } as File
    expect((await parseBrowserDemoSpreadsheet(file, schema, 50, selection)).importId).toBe('real-worker')
    expect(sent).toHaveBeenCalledWith(expect.objectContaining({
      inputSchema: [{ key: 'account_label', label: '客户简称', required: true }],
      selection: { capabilityKey: 'logistics_standard', worksheetHint: undefined },
    }))
  })

  it.each(['postMessage', 'invalidReply'] as const)('terminates and safely falls back after %s instead of remaining pending', async failure => {
    vi.stubEnv('MODE', 'production')
    const terminate = vi.fn()
    let reply: (event: MessageEvent) => void = () => {}
    vi.stubGlobal('Worker', class {
      terminate = terminate
      addEventListener(type: string, listener: (event: MessageEvent) => void) {
        if (type === 'message') reply = listener
      }
      postMessage() {
        if (failure === 'postMessage') throw new Error('DataCloneError')
        reply({ data: { ok: true, result: null } } as MessageEvent)
      }
    })
    const buffer = new TextEncoder().encode('客户简称\nlocal@example.com').buffer
    const file = { name: 'local.csv', size: buffer.byteLength, arrayBuffer: async () => buffer } as File
    const result = await parseBrowserDemoSpreadsheet(file)
    expect(result.rows[0]?.preview.account_label).toBe('lo***@example.com')
    expect(terminate).toHaveBeenCalledOnce()
  })
})
