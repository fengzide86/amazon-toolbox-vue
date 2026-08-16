import type { Worksheet } from 'exceljs'

import { importPreviewSchema, type ImportPreview } from '@/features/business/model'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const FORMULA_PREFIX = /^[=+\-@]/
const ALLOWED_EXTENSIONS = new Set(['.xlsx', '.csv'])

interface DemoInputField {
  key: string
  label: string
  required: boolean
}

function localId(prefix: string): string {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`
  return `${prefix}_${suffix}`
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '_')
}

function cellText(cell: ReturnType<Worksheet['getCell']>): string {
  const value = cell.value
  if (value && typeof value === 'object' && 'formula' in value) {
    throw new Error('导入文件不能包含公式单元格')
  }
  if (value instanceof Date) return value.toISOString()
  if (value && typeof value === 'object' && 'text' in value) {
    const text = String(value.text).trim()
    if (FORMULA_PREFIX.test(text)) throw new Error('导入内容不能以公式符号开头')
    return text
  }
  const text = String(value ?? '').trim()
  if (FORMULA_PREFIX.test(text)) throw new Error('导入内容不能以公式符号开头')
  return text
}

function maskLabel(value: string): string {
  const text = value.trim()
  if (!text) return '演示项'
  if (text.includes('@')) {
    const [local = '', domain = ''] = text.split('@')
    return `${local.slice(0, 2)}***@${domain}`
  }
  return text.length > 6 ? `${text.slice(0, 2)}***${text.slice(-2)}` : `${text.slice(0, 1)}***`
}

function normalizeFields(inputSchema: Array<Record<string, unknown>> = []): DemoInputField[] {
  const fields = inputSchema.map((field) => ({
    key: String(field.key || '').trim(),
    label: String(field.label || field.key || '').trim(),
    required: Boolean(field.required),
  })).filter(field => field.key)
  if (!fields.some(field => field.key === 'account_label')) {
    fields.unshift({ key: 'account_label', label: '客户简称', required: true })
  }
  return fields
}

function extensionOf(fileName: string): string {
  const match = fileName.toLowerCase().match(/\.[^.]+$/)
  return match?.[0] || ''
}

/** Parse RFC-4180 style CSV without executing spreadsheet formulas. */
export function parseCsvRows(source: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let value = ''
  let quoted = false
  const text = source.replace(/^\uFEFF/, '')
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"'
        index += 1
      } else if (character === '"') quoted = false
      else value += character
      continue
    }
    if (character === '"') quoted = true
    else if (character === ',') {
      row.push(value)
      value = ''
    } else if (character === '\n') {
      row.push(value.replace(/\r$/, ''))
      rows.push(row)
      row = []
      value = ''
    } else value += character
  }
  if (quoted) throw new Error('CSV 文件包含未闭合的引号')
  if (value || row.length) {
    row.push(value.replace(/\r$/, ''))
    rows.push(row)
  }
  return rows
}

export function parseDemoWorksheet(
  worksheet: Worksheet,
  fileName: string,
  inputSchema: Array<Record<string, unknown>> = [],
  maxRows = 50,
): ImportPreview {
  const fields = normalizeFields(inputSchema)
  const headers = new Map<string, number>()
  worksheet.getRow(1).eachCell((cell, columnNumber) => {
    headers.set(normalizeHeader(cell.text || cell.value), columnNumber)
  })
  const fieldColumns = new Map<string, number>()
  for (const field of fields) {
    const column = headers.get(normalizeHeader(field.key)) || headers.get(normalizeHeader(field.label))
    if (column) fieldColumns.set(field.key, column)
  }
  const missing = fields.filter(field => field.required && !fieldColumns.has(field.key))
  if (missing.length) throw new Error(`缺少必填列：${missing.map(field => field.label).join('、')}`)

  const rows: ImportPreview['rows'] = []
  const errors: ImportPreview['errors'] = []
  const rowLimit = Math.max(1, Math.min(Math.floor(maxRows), 500))
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber)
    if (!row.hasValues) continue
    if (rows.length >= rowLimit) {
      errors.push({ rowNumber, message: `超过当前演示的 ${rowLimit} 行限制` })
      continue
    }
    try {
      const values = new Map<string, string>()
      const rowErrors: string[] = []
      for (const field of fields) {
        const column = fieldColumns.get(field.key)
        const value = column ? cellText(row.getCell(column)) : ''
        values.set(field.key, value)
        if (field.required && !value) rowErrors.push(`${field.label}不能为空`)
      }
      if (rowErrors.length) {
        errors.push({ rowNumber, message: rowErrors.join('；') })
        continue
      }
      // 原始单元格到此即被丢弃；store 只接收脱敏标签，不保留账号、Cookie 或其他输入。
      rows.push({
        itemId: localId('demo_item'),
        preview: { account_label: maskLabel(values.get('account_label') || `第 ${rowNumber} 行`) },
      })
    } catch (error) {
      errors.push({ rowNumber, message: error instanceof Error ? error.message : '无法读取该行' })
    }
  }
  if (!rows.length) throw new Error(errors[0]?.message || '表格中没有可用于演示的有效数据行')
  return importPreviewSchema.parse({
    importId: localId('demo_import'),
    fileName,
    validCount: rows.length,
    errorCount: errors.length,
    rows,
    errors,
  })
}

export async function parseLocalDemoSpreadsheet(
  file: File,
  inputSchema: Array<Record<string, unknown>> = [],
  maxRows = 50,
): Promise<ImportPreview> {
  if (file.size > MAX_FILE_SIZE) throw new Error('导入文件不能超过 10MB')
  const extension = extensionOf(file.name)
  if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error('演示导入仅支持 .xlsx 或 .csv 文件')
  const buffer = await file.arrayBuffer()
  return parseDemoSpreadsheetBuffer(buffer, file.name, inputSchema, maxRows)
}

export async function parseDemoSpreadsheetBuffer(
  buffer: ArrayBuffer,
  fileName: string,
  inputSchema: Array<Record<string, unknown>> = [],
  maxRows = 50,
): Promise<ImportPreview> {
  if (buffer.byteLength > MAX_FILE_SIZE) throw new Error('导入文件不能超过 10MB')
  const extension = extensionOf(fileName)
  if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error('演示导入仅支持 .xlsx 或 .csv 文件')
  const module = await import('exceljs')
  const ExcelJS = module.default
  const workbook = new ExcelJS.Workbook()
  if (extension === '.csv') {
    const worksheet = workbook.addWorksheet('CSV')
    worksheet.addRows(parseCsvRows(new TextDecoder('utf-8').decode(buffer)))
  } else {
    await workbook.xlsx.load(buffer)
  }
  const worksheet = workbook.worksheets.find(sheet => sheet.state === 'visible') || workbook.worksheets[0]
  if (!worksheet) throw new Error('导入文件没有可读取的工作表')
  const preview = parseDemoWorksheet(worksheet, fileName, inputSchema, maxRows)
  return importPreviewSchema.parse({ ...preview, worksheetName: worksheet.name })
}

export function chooseLocalDemoSpreadsheet(): Promise<File | null> {
  if (typeof document === 'undefined') return Promise.resolve(null)
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv'
    input.hidden = true
    const finish = (file: File | null) => {
      input.remove()
      resolve(file)
    }
    input.addEventListener('change', () => finish(input.files?.[0] || null), { once: true })
    input.addEventListener('cancel', () => finish(null), { once: true })
    document.body.appendChild(input)
    input.click()
  })
}

export function createLocalDemoSample(
  inputSchema: Array<Record<string, unknown>> = [],
  maxRows = 50,
  count = 8,
): ImportPreview {
  const fields = normalizeFields(inputSchema)
  const size = Math.max(1, Math.min(count, maxRows, 50))
  const rows = Array.from({ length: size }, (_, index) => ({
    itemId: localId('demo_item'),
    preview: Object.fromEntries(fields.map(field => [field.key, field.key === 'account_label' ? `演示账号 ${String(index + 1).padStart(2, '0')}` : '已校验'])),
  }))
  return importPreviewSchema.parse({
    importId: localId('demo_import'),
    fileName: 'KST 批量演示样例',
    validCount: rows.length,
    errorCount: 0,
    rows,
    errors: [],
  })
}

function csvCell(value: unknown): string {
  const text = String(value ?? '').replace(/^([=+\-@])/, "'$1")
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function downloadCsv(fileName: string, rows: unknown[][]): void {
  if (typeof document === 'undefined') return
  const content = `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}`
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.hidden = true
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function downloadLocalDemoTemplate(inputSchema: Array<Record<string, unknown>> = []): string {
  const fields = normalizeFields(inputSchema)
  const headers = fields.map(field => field.label)
  const example = fields.map(field => field.key === 'account_label' ? '示例账号 01' : '请填写')
  const fileName = 'KST-批量导入模板.csv'
  downloadCsv(fileName, [headers, example])
  return fileName
}

export function downloadLocalImportErrors(errors: Array<{ rowNumber?: number; message: string }>): string {
  const fileName = 'KST-导入问题清单.csv'
  downloadCsv(fileName, [['行号', '问题'], ...errors.map(error => [error.rowNumber || '', error.message])])
  return fileName
}
