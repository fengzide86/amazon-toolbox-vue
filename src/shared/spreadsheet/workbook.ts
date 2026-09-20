import type { Workbook, Worksheet } from 'exceljs'

export interface SpreadsheetField {
  key: string
  label: string
  required: boolean
}

export interface SpreadsheetSelectionOptions {
  capabilityKey?: string
  worksheetHint?: string
}

interface HeaderMatch {
  rowNumber: number
  columns: Map<string, number>
  score: number
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '_')
}

/** No paths or platform APIs: both browser workers and Electron load the same bytes. */
export async function loadXlsxWorkbook(source: ArrayBuffer | Uint8Array): Promise<Workbook> {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const buffer = source instanceof Uint8Array ? Uint8Array.from(source).buffer : source
  try {
    await workbook.xlsx.load(buffer)
  } catch (error) {
    // Our bundled template uses valid x:-prefixed SpreadsheetML. ExcelJS only
    // understands unprefixed tags; normalize in memory, never rewrite the file.
    const { default: JSZip } = await import('jszip')
    const zip = await JSZip.loadAsync(buffer)
    const entry = zip.file('xl/workbook.xml')
    const xml = entry ? await entry.async('string') : ''
    if (!/<x:workbook\b/.test(xml)) throw error
    const entries = Object.values(zip.files).filter(file => (
      !file.dir && /^(?:xl\/.*|docProps\/.*|\[Content_Types\]\.xml)$/.test(file.name) && file.name.endsWith('.xml')
    ))
    await Promise.all(entries.map(async file => {
      const content = await file.async('string')
      if (/<\/?x:/.test(content)) {
        zip.file(file.name, content.replace(/(<\/?)(?:x:)/g, '$1').replace(/xmlns:x=/g, 'xmlns='))
      }
    }))
    await workbook.xlsx.load(await zip.generateAsync({ type: 'arraybuffer' }))
  }
  return workbook
}

function readManifest(workbook: Workbook, capabilityKey = ''): { worksheetName?: string; templateVersion?: string } {
  const manifest = workbook.getWorksheet('_toolbox_manifest')
  if (!manifest || !capabilityKey) return {}
  const headers = new Map<string, number>()
  manifest.getRow(1).eachCell((cell, columnNumber) => headers.set(normalizeHeader(cell.text || cell.value), columnNumber))
  const capabilityColumn = headers.get('capability_key')
  const worksheetColumn = headers.get('worksheet')
  const versionColumn = headers.get('template_version')
  if (!capabilityColumn || !worksheetColumn) return {}
  for (let rowNumber = 2; rowNumber <= manifest.rowCount; rowNumber += 1) {
    const row = manifest.getRow(rowNumber)
    if (normalizeHeader(row.getCell(capabilityColumn).text) !== normalizeHeader(capabilityKey)) continue
    return {
      worksheetName: row.getCell(worksheetColumn).text.trim(),
      templateVersion: versionColumn ? row.getCell(versionColumn).text.trim() : undefined,
    }
  }
  return {}
}

export function findSpreadsheetHeader(worksheet: Worksheet, fields: SpreadsheetField[]): HeaderMatch {
  let best: HeaderMatch = { rowNumber: 1, columns: new Map(), score: -1 }
  const maxHeaderRow = Math.min(Math.max(worksheet.rowCount, 1), 20)
  for (let rowNumber = 1; rowNumber <= maxHeaderRow; rowNumber += 1) {
    const headers = new Map<string, number>()
    worksheet.getRow(rowNumber).eachCell((cell, columnNumber) => {
      const normalized = normalizeHeader(cell.text || cell.value)
      if (normalized) headers.set(normalized, columnNumber)
    })
    const columns = new Map<string, number>()
    for (const field of fields) {
      const column = headers.get(normalizeHeader(field.key)) || headers.get(normalizeHeader(field.label))
      if (column) columns.set(field.key, column)
    }
    const score = fields.filter(field => field.required && columns.has(field.key)).length * 100 + columns.size
    if (score > best.score) best = { rowNumber, columns, score }
  }
  return best
}

export function selectSpreadsheetWorksheet(
  workbook: Workbook,
  fields: SpreadsheetField[],
  options: SpreadsheetSelectionOptions = {},
): { worksheet: Worksheet; header: HeaderMatch; templateVersion?: string } {
  const manifest = readManifest(workbook, options.capabilityKey)
  const hintedName = options.worksheetHint || manifest.worksheetName
  const hinted = hintedName ? workbook.getWorksheet(hintedName) : undefined
  if (hinted) return { worksheet: hinted, header: findSpreadsheetHeader(hinted, fields), templateVersion: manifest.templateVersion }
  const candidates = workbook.worksheets
    .filter(sheet => sheet.state === 'visible' && !sheet.name.startsWith('_'))
    .map(worksheet => ({ worksheet, header: findSpreadsheetHeader(worksheet, fields) }))
    .sort((left, right) => right.header.score - left.header.score)
  if (!candidates[0]) {
    throw Object.assign(new Error('导入文件没有与当前工具匹配的工作表'), { code: 'BATCH_SHEET_MISSING' })
  }
  return { ...candidates[0], templateVersion: manifest.templateVersion }
}
