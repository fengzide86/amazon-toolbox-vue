import type { Worksheet } from 'exceljs'

import type { FreightRatePack, FreightRateRule, FreightTier } from './types.js'

const MAX_FREIGHT_FILE_SIZE = 20 * 1024 * 1024

export interface FreightWorkbookOptions {
  id?: string
  version?: string
  name?: string
  exchangeRateCnyPerUsd?: number
  sheetMappings?: Record<string, string>
}

export interface FreightWorkbookMapping {
  carrierKey: string
  carrierName: string
  worksheetName: string | null
  confidence: number
  ruleCount: number
}

export interface ParsedFreightWorkbook {
  pack: FreightRatePack
  sourceFileName: string
  availableWorksheets: string[]
  mappings: FreightWorkbookMapping[]
  warnings: string[]
  summary: { carrierCount: number; countryCount: number; ruleCount: number }
}

function numberValue(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(String(value ?? '').trim())
  return Number.isFinite(number) ? number : null
}

function textValue(value: unknown): string {
  if (value && typeof value === 'object' && 'text' in value) {
    return String((value as { text?: unknown }).text || '').trim()
  }
  return String(value ?? '').trim()
}

function ruleBase(
  carrierId: string,
  carrierName: string,
  serviceType: FreightRateRule['serviceType'],
  countryCode: string,
  countryName: string,
  countryNameEn: string,
  priority: number,
): Pick<FreightRateRule, 'carrierId' | 'carrierName' | 'serviceType' | 'countryCode' | 'countryName' | 'countryNameEn' | 'priority'> {
  return { carrierId, carrierName, serviceType, countryCode, countryName, countryNameEn, priority }
}

function tier(maxWeightG: number, perKgCny: unknown, fixedFeeCny: unknown): FreightTier | null {
  const rate = numberValue(perKgCny)
  const fixed = numberValue(fixedFeeCny)
  return rate === null || fixed === null ? null : { maxWeightG, perKgCny: rate, fixedFeeCny: fixed }
}

function present<T>(value: T | null): value is T {
  return value !== null
}

export function parseChinaPostSheet(worksheet: Worksheet | undefined): FreightRateRule[] {
  if (!worksheet) return []
  const rules: FreightRateRule[] = []
  for (let rowNumber = 10; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber)
    const countryName = textValue(row.getCell(1).value)
    const countryNameEn = textValue(row.getCell(2).value)
    const countryCode = textValue(row.getCell(3).value).toUpperCase()
    if (!countryName || !countryCode) continue
    const tiers = [
      tier(150, row.getCell(4).value, row.getCell(5).value),
      tier(300, row.getCell(6).value, row.getCell(7).value),
      tier(2_000, row.getCell(8).value, row.getCell(9).value),
    ].filter(present)
    if (tiers.length !== 3) continue
    rules.push({
      ...ruleBase('china-post-registered', '中国邮政挂号小包', 'tiered', countryCode, countryName, countryNameEn, 30),
      maxWeightKg: 2,
      suspended: /暂停/.test(textValue(row.getCell(10).value)),
      tiers,
      percentageSurcharge: 0.14,
      minimumSurchargeCny: 2,
    })
  }
  return rules
}

export function parseEPacketSheet(worksheet: Worksheet | undefined): FreightRateRule[] {
  if (!worksheet) return []
  const rules: FreightRateRule[] = []
  for (let rowNumber = 9; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber)
    const countryNameEn = textValue(row.getCell(1).value)
    const countryCode = textValue(row.getCell(2).value).toUpperCase()
    const countryName = textValue(row.getCell(3).value)
    const minWeight = numberValue(row.getCell(4).value)
    const perKg = numberValue(row.getCell(5).value)
    const fixed = numberValue(row.getCell(6).value)
    if (!countryName || !countryCode || minWeight === null || perKg === null || fixed === null) continue
    rules.push({
      ...ruleBase('epacket', 'e邮宝', 'epacket', countryCode, countryName, countryNameEn, 10),
      maxWeightKg: countryCode === 'IL' || /以色列/.test(countryName) ? 3 : 2,
      minBillableWeightG: minWeight,
      perKgCny: perKg,
      fixedFeeCny: fixed,
    })
  }
  return rules
}

export function parseYanwenSheet(worksheet: Worksheet | undefined): FreightRateRule[] {
  if (!worksheet) return []
  const rules: FreightRateRule[] = []
  for (let rowNumber = 8; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber)
    const countryName = textValue(row.getCell(2).value)
    const countryNameEn = textValue(row.getCell(3).value)
    const countryCode = textValue(row.getCell(4).value).toUpperCase()
    if (!countryName || !countryCode) continue
    const tiers = [
      tier(150, row.getCell(5).value, row.getCell(6).value),
      tier(300, row.getCell(7).value, row.getCell(8).value),
      tier(2_000, row.getCell(9).value, row.getCell(10).value),
    ].filter(present)
    if (tiers.length !== 3) continue
    rules.push({
      ...ruleBase('yanwen-air-registered', '燕文航空挂号小包', 'tiered', countryCode, countryName, countryNameEn, 20),
      maxWeightKg: 2,
      tiers,
    })
  }
  return rules
}

export function parseUpsSheet(worksheet: Worksheet | undefined): FreightRateRule[] {
  if (!worksheet) return []
  const rules: FreightRateRule[] = []
  const bandLimits = [44, 70, 99, 299, 499, 999, 9_999]
  for (let rowNumber = 9; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber)
    const countryNameEn = textValue(row.getCell(1).value)
    const countryName = textValue(row.getCell(2).value)
    const countryCode = textValue(row.getCell(3).value).toUpperCase()
    if (!countryName || !countryCode) continue
    const fixedPrices = Array.from({ length: 20 }, (_, index) => numberValue(row.getCell(4 + index).value))
    const bandPrices = bandLimits.map((maxWeightKg, index) => ({ maxWeightKg, perKgCny: numberValue(row.getCell(24 + index).value) }))
    if (fixedPrices.some(value => value === null) || bandPrices.some(value => value.perKgCny === null)) continue
    rules.push({
      ...ruleBase('ups-expedited', 'UPS 全球快捷', 'ups', countryCode, countryName, countryNameEn, 40),
      maxWeightKg: 9_999,
      volumetricDivisor: 5_000,
      fixedPricesCny: fixedPrices as number[],
      perKgBands: bandPrices as Array<{ maxWeightKg: number; perKgCny: number }>,
      fuelSurchargeIncluded: false,
    })
  }
  return rules
}

function findSheet(workbook: import('exceljs').Workbook, names: string[]): Worksheet | undefined {
  return workbook.worksheets.find(sheet => names.some(name => sheet.name.toLowerCase().includes(name.toLowerCase())))
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('当前浏览器不支持费率文件校验')
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function parseFreightWorkbookBuffer(
  buffer: ArrayBuffer,
  sourceFileName: string,
  options: FreightWorkbookOptions = {},
): Promise<ParsedFreightWorkbook> {
  if (buffer.byteLength > MAX_FREIGHT_FILE_SIZE) throw new Error('费率工作簿不能超过 20MB')
  if (!/\.xlsx$/i.test(sourceFileName)) throw new Error('费率中心仅支持 .xlsx 工作簿')
  const module = await import('exceljs')
  const ExcelJS = module.default
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as never)
  const sheetMappings = options.sheetMappings || {}
  const mappedSheet = (key: string, aliases: string[]) => {
    const explicit = textValue(sheetMappings[key])
    return explicit ? workbook.getWorksheet(explicit) : findSheet(workbook, aliases)
  }
  const groups = [
    { key: 'china_post', label: '中国邮政挂号小包', sheet: mappedSheet('china_post', ['中国邮政挂号小包', 'china post']), parse: parseChinaPostSheet },
    { key: 'epacket', label: 'e邮宝', sheet: mappedSheet('epacket', ['e邮宝', 'epacket']), parse: parseEPacketSheet },
    { key: 'yanwen', label: '燕文航空挂号小包', sheet: mappedSheet('yanwen', ['燕文航空挂号小包', 'yanwen']), parse: parseYanwenSheet },
    { key: 'ups', label: 'UPS 全球快捷', sheet: mappedSheet('ups', ['ups']), parse: parseUpsSheet },
  ]
  const warnings: string[] = []
  const parsedGroups = groups.map(group => {
    const rules = group.parse(group.sheet)
    if (!group.sheet) warnings.push(`未识别 ${group.label} 工作表`)
    else if (!rules.length) warnings.push(`${group.label} 工作表未识别到有效费率行`)
    return {
      carrierKey: group.key,
      carrierName: group.label,
      worksheetName: group.sheet?.name || null,
      confidence: group.sheet && rules.length ? 1 : 0,
      ruleCount: rules.length,
      rules,
    }
  })
  const rules = parsedGroups.flatMap(group => group.rules)
  const exchangeRate = Number(options.exchangeRateCnyPerUsd || 7)
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) throw new Error('人民币兑美元汇率无效')
  const pack: FreightRatePack = {
    schemaVersion: 1,
    resourceType: 'freight-rate-pack',
    id: String(options.id || 'competition-freight'),
    version: String(options.version || '1.0.0'),
    name: String(options.name || '赛训物流首版费率包'),
    currency: 'CNY',
    exchangeRateCnyPerUsd: exchangeRate,
    sourceHash: await sha256Hex(buffer),
    createdAt: new Date().toISOString(),
    rules,
    mappingWarnings: warnings,
  }
  return {
    pack,
    sourceFileName,
    availableWorksheets: workbook.worksheets.map(sheet => sheet.name),
    mappings: parsedGroups.map(({ rules: _rules, ...mapping }) => mapping),
    warnings,
    summary: {
      carrierCount: parsedGroups.filter(group => group.ruleCount > 0).length,
      ruleCount: rules.length,
      countryCount: new Set(rules.map(rule => rule.countryCode)).size,
    },
  }
}

export async function parseFreightWorkbookFile(file: File, options: FreightWorkbookOptions = {}): Promise<ParsedFreightWorkbook> {
  return parseFreightWorkbookBuffer(await file.arrayBuffer(), file.name, options)
}

export function chooseBrowserFreightWorkbook(): Promise<File | null> {
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

export const builtInFreightWorkbookUrl = new URL('../../../resources/rates/FreightTemplate_v2.xlsx', import.meta.url).href

export async function loadBuiltInFreightWorkbook(
  options: FreightWorkbookOptions = {},
  request: typeof fetch = fetch,
): Promise<ParsedFreightWorkbook> {
  const response = await request(builtInFreightWorkbookUrl, { cache: 'no-store' })
  if (!response.ok) throw new Error('内置费率包暂时无法读取')
  return parseFreightWorkbookBuffer(await response.arrayBuffer(), 'FreightTemplate_v2.xlsx', options)
}
