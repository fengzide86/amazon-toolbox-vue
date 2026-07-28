import type {
  FreightQuoteCandidate,
  FreightQuoteRequest,
  FreightQuoteResult,
  FreightRatePack,
  FreightRateRule,
} from './types.js'

const EPSILON = 1e-9

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function ceilCent(value: number): number {
  return Math.ceil((value - EPSILON) * 100) / 100
}

function normalizeCountry(value: string): string {
  return value.trim().toLowerCase().replace(/[\s._-]+/g, '')
}

function matchesCountry(rule: FreightRateRule, country: string): boolean {
  const target = normalizeCountry(country)
  return [rule.countryCode, rule.countryName, rule.countryNameEn || '']
    .some(value => normalizeCountry(value) === target)
}

function ineligible(rule: FreightRateRule, request: FreightQuoteRequest, reason: string, warnings: string[] = []): FreightQuoteCandidate {
  return {
    carrierId: rule.carrierId,
    carrierName: rule.carrierName,
    eligible: false,
    reason,
    priority: rule.priority,
    actualWeightKg: request.actualWeightKg,
    warnings,
  }
}

function totals(
  rule: FreightRateRule,
  request: FreightQuoteRequest,
  exchangeRate: number,
  values: { billableWeightKg: number; volumetricWeightKg?: number; baseFreightCny: number; fixedFeeCny: number; warnings?: string[] },
): FreightQuoteCandidate {
  const subtotal = values.baseFreightCny + values.fixedFeeCny
  const surcharge = rule.percentageSurcharge
    ? Math.max(subtotal * rule.percentageSurcharge, rule.minimumSurchargeCny || 0)
    : 0
  const totalCny = roundMoney(subtotal + surcharge)
  return {
    carrierId: rule.carrierId,
    carrierName: rule.carrierName,
    eligible: true,
    priority: rule.priority,
    actualWeightKg: request.actualWeightKg,
    volumetricWeightKg: values.volumetricWeightKg,
    billableWeightKg: values.billableWeightKg,
    baseFreightCny: roundMoney(values.baseFreightCny),
    fixedFeeCny: roundMoney(values.fixedFeeCny),
    surchargeCny: roundMoney(surcharge),
    totalCny,
    totalUsd: ceilCent(totalCny / exchangeRate),
    warnings: values.warnings || [],
  }
}

function quoteTiered(rule: FreightRateRule, request: FreightQuoteRequest, exchangeRate: number): FreightQuoteCandidate {
  if (rule.suspended) return ineligible(rule, request, '该渠道当前暂停服务')
  if (rule.maxWeightKg && request.actualWeightKg > rule.maxWeightKg + EPSILON) {
    return ineligible(rule, request, `超过 ${rule.maxWeightKg}kg 限重`)
  }
  const weightG = request.actualWeightKg * 1_000
  const tier = [...(rule.tiers || [])].sort((a, b) => a.maxWeightG - b.maxWeightG).find(item => weightG <= item.maxWeightG + EPSILON)
  if (!tier) return ineligible(rule, request, '没有匹配的重量区间')
  return totals(rule, request, exchangeRate, {
    billableWeightKg: request.actualWeightKg,
    baseFreightCny: request.actualWeightKg * tier.perKgCny,
    fixedFeeCny: tier.fixedFeeCny,
  })
}

function quoteEPacket(rule: FreightRateRule, request: FreightQuoteRequest, exchangeRate: number): FreightQuoteCandidate {
  if (rule.maxWeightKg && request.actualWeightKg > rule.maxWeightKg + EPSILON) {
    return ineligible(rule, request, `超过 ${rule.maxWeightKg}kg 限重`)
  }
  const billableWeightG = Math.max(request.actualWeightKg * 1_000, rule.minBillableWeightG || 1)
  const billableWeightKg = billableWeightG / 1_000
  return totals(rule, request, exchangeRate, {
    billableWeightKg,
    baseFreightCny: billableWeightKg * Number(rule.perKgCny || 0),
    fixedFeeCny: Number(rule.fixedFeeCny || 0),
  })
}

function quoteUps(rule: FreightRateRule, request: FreightQuoteRequest, exchangeRate: number): FreightQuoteCandidate {
  const dimensions = request.dimensionsCm
  if (!dimensions || ![dimensions.length, dimensions.width, dimensions.height].every(value => Number.isFinite(value) && value > 0)) {
    return ineligible(rule, request, 'UPS 报价需要完整的长、宽、高', ['未猜测缺失尺寸'])
  }
  const volumetricWeightKg = dimensions.length * dimensions.width * dimensions.height / Number(rule.volumetricDivisor || 5_000)
  const billableWeightKg = Math.ceil(Math.max(request.actualWeightKg, volumetricWeightKg) - EPSILON)
  let baseFreightCny: number | undefined
  if (billableWeightKg <= 20) baseFreightCny = rule.fixedPricesCny?.[Math.max(0, billableWeightKg - 1)]
  else {
    const band = [...(rule.perKgBands || [])].sort((a, b) => a.maxWeightKg - b.maxWeightKg).find(item => billableWeightKg <= item.maxWeightKg)
    if (band) baseFreightCny = billableWeightKg * band.perKgCny
  }
  if (!Number.isFinite(baseFreightCny)) return ineligible(rule, request, '没有匹配的 UPS 重量区间')
  const warnings = rule.fuelSurchargeIncluded === false ? ['当前费率不含燃油附加费'] : []
  return totals(rule, request, exchangeRate, {
    billableWeightKg,
    volumetricWeightKg,
    baseFreightCny: Number(baseFreightCny),
    fixedFeeCny: 0,
    warnings,
  })
}

export function validateFreightRatePack(pack: FreightRatePack): FreightRatePack {
  if (pack.schemaVersion !== 1 || pack.resourceType !== 'freight-rate-pack') throw new Error('费率包格式不受支持')
  if (!pack.id || !pack.version || !Array.isArray(pack.rules) || !pack.rules.length) throw new Error('费率包内容不完整')
  if (!Number.isFinite(pack.exchangeRateCnyPerUsd) || pack.exchangeRateCnyPerUsd <= 0) throw new Error('费率包汇率无效')
  return pack
}

export function quoteFreight(packInput: FreightRatePack, request: FreightQuoteRequest): FreightQuoteResult {
  const pack = validateFreightRatePack(packInput)
  if (!request.country?.trim()) throw new Error('请选择配送国家')
  if (!Number.isFinite(request.actualWeightKg) || request.actualWeightKg <= 0) throw new Error('实际重量必须大于 0')
  const exchangeRate = Number(request.exchangeRateCnyPerUsd || pack.exchangeRateCnyPerUsd)
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) throw new Error('人民币兑美元汇率无效')
  const rules = pack.rules.filter(rule => matchesCountry(rule, request.country))
  const candidates = rules.map(rule => {
    if (rule.serviceType === 'ups') return quoteUps(rule, request, exchangeRate)
    if (rule.serviceType === 'epacket') return quoteEPacket(rule, request, exchangeRate)
    return quoteTiered(rule, request, exchangeRate)
  }).sort((left, right) => {
    if (left.eligible !== right.eligible) return left.eligible ? -1 : 1
    if ((left.totalCny ?? Infinity) !== (right.totalCny ?? Infinity)) return (left.totalCny ?? Infinity) - (right.totalCny ?? Infinity)
    return left.priority - right.priority
  })
  const selected = candidates.find(candidate => candidate.eligible) || null
  const warnings = [...(pack.mappingWarnings || [])]
  if (!rules.length) warnings.push('当前费率包没有该国家的渠道')
  if (rules.length && !selected) warnings.push('所有匹配渠道均不可用，请检查重量、尺寸或暂停状态')
  return {
    ratePackId: pack.id,
    ratePackVersion: pack.version,
    exchangeRateCnyPerUsd: exchangeRate,
    request,
    selected,
    candidates,
    warnings,
  }
}
