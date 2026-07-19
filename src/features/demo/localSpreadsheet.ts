import type { Worksheet } from 'exceljs'

import { importPreviewSchema, type ImportPreview } from '@/features/business/model'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const FORMULA_PREFIX = /^[=+\-@]/

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
  if (!file.name.toLowerCase().endsWith('.xlsx')) throw new Error('演示导入仅支持 .xlsx 文件')
  const module = await import('exceljs')
  const ExcelJS = module.default
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())
  const worksheet = workbook.worksheets.find(sheet => sheet.state === 'visible') || workbook.worksheets[0]
  if (!worksheet) throw new Error('导入文件没有可读取的工作表')
  return parseDemoWorksheet(worksheet, file.name, inputSchema, maxRows)
}

export function chooseLocalDemoSpreadsheet(): Promise<File | null> {
  if (typeof document === 'undefined') return Promise.resolve(null)
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
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
