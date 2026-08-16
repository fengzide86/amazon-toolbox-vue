import { importPreviewSchema, type ImportPreview } from '@/features/business/model'
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
): Promise<ImportPreview> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./spreadsheet.worker.ts', import.meta.url), { type: 'module' })
    const finish = () => worker.terminate()
    worker.addEventListener('message', (event: MessageEvent<WorkerReply>) => {
      finish()
      if (!event.data.ok) reject(new Error(event.data.error || '文件解析失败'))
      else resolve(importPreviewSchema.parse(event.data.result))
    }, { once: true })
    worker.addEventListener('error', () => {
      finish()
      reject(new Error('浏览器文件解析器启动失败'))
    }, { once: true })
    void file.arrayBuffer().then(buffer => {
      worker.postMessage({ buffer, fileName: file.name, inputSchema, maxRows }, [buffer])
    }, reject)
  })
}

export async function parseBrowserDemoSpreadsheet(
  file: File,
  inputSchema: Array<Record<string, unknown>> = [],
  maxRows = 50,
): Promise<ImportPreview> {
  if (typeof Worker === 'undefined' || import.meta.env.MODE === 'test') {
    return parseLocalDemoSpreadsheet(file, inputSchema, maxRows)
  }
  try {
    return await parseWithWorker(file, inputSchema, maxRows)
  } catch {
    // CSP, browser extensions or unsupported worker module loading must not
    // make local import unavailable; the same pure parser can run inline.
    return parseLocalDemoSpreadsheet(file, inputSchema, maxRows)
  }
}
