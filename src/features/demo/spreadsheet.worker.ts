/// <reference lib="webworker" />

import { parseDemoSpreadsheetBuffer } from './localSpreadsheet'

interface SpreadsheetWorkerRequest {
  buffer: ArrayBuffer
  fileName: string
  inputSchema: Array<Record<string, unknown>>
  maxRows: number
}

self.addEventListener('message', (event: MessageEvent<SpreadsheetWorkerRequest>) => {
  const { buffer, fileName, inputSchema, maxRows } = event.data
  void parseDemoSpreadsheetBuffer(buffer, fileName, inputSchema, maxRows)
    .then(result => self.postMessage({ ok: true, result }))
    .catch((error: unknown) => self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : '文件解析失败',
    }))
})

export {}
