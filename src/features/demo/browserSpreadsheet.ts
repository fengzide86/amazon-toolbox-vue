import { importPreviewSchema, type ImportPreview } from '@/features/business/model'
import type { SpreadsheetSelectionOptions } from '@/shared/spreadsheet/workbook'
import { parseLocalDemoSpreadsheet } from './localSpreadsheet'

interface WorkerReply {
  ok: boolean
  result?: unknown
  error?: string
}

function parseWithWorker(
  file: File,
  inputSchema: Array<Record<string, unknown>>,
  maxRows: number,
  selection: SpreadsheetSelectionOptions,
): Promise<ImportPreview> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./spreadsheet.worker.ts', import.meta.url), { type: 'module' })
    const finish = () => worker.terminate()
    worker.addEventListener('message', (event: MessageEvent<WorkerReply>) => {
      finish()
      if (!event.data.ok) reject(new Error(event.data.error || '文件解析失败'))
      else {
        const parsed = importPreviewSchema.safeParse(event.data.result)
        if (parsed.success) resolve(parsed.data)
        else reject(new Error('浏览器文件解析结果格式异常'))
      }
    }, { once: true })
    worker.addEventListener('error', () => {
      finish()
      reject(new Error('浏览器文件解析器启动失败'))
    }, { once: true })
    void file.arrayBuffer().then(buffer => {
      // Vue/Pinia schema arrays are proxies and cannot cross structured-clone
      // boundaries. Send only the primitive fields consumed by the parser.
      const fields = inputSchema.map(field => ({
        key: String(field.key || ''),
        label: String(field.label || field.key || ''),
        required: Boolean(field.required),
      }))
      const context = { capabilityKey: selection.capabilityKey, worksheetHint: selection.worksheetHint }
      worker.postMessage({ buffer, fileName: file.name, inputSchema: fields, maxRows, selection: context }, [buffer])
    }).catch(error => {
      finish()
      reject(error)
    })
  })
}

export async function parseBrowserDemoSpreadsheet(
  file: File,
  inputSchema: Array<Record<string, unknown>> = [],
  maxRows = 50,
  selection: SpreadsheetSelectionOptions = {},
): Promise<ImportPreview> {
  if (typeof Worker === 'undefined' || import.meta.env.MODE === 'test') {
    return parseLocalDemoSpreadsheet(file, inputSchema, maxRows, selection)
  }
  try {
    return await parseWithWorker(file, inputSchema, maxRows, selection)
  } catch {
    // CSP, browser extensions or unsupported worker module loading must not
    // make local import unavailable; the same pure parser can run inline.
    return parseLocalDemoSpreadsheet(file, inputSchema, maxRows, selection)
  }
}
