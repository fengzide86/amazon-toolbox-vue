import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { quoteFreight } from '@/shared/freight/rate-engine'
import type { FreightRatePack } from '@/shared/freight/types'

const require = createRequire(import.meta.url)
const { parseFreightWorkbook } = require('../../../dist-electron/electron/freight/rate-pack.cjs')
let pack: FreightRatePack

beforeAll(async () => {
  const parsed = await parseFreightWorkbook(resolve('resources/rates/FreightTemplate_v2.xlsx'), {
    id: 'competition-freight', version: '1.0.0', exchangeRateCnyPerUsd: 7,
  })
  expect(parsed.summary.carrierCount).toBe(4)
  expect(parsed.summary.countryCount).toBeGreaterThan(30)
  expect(parsed.summary.ruleCount).toBeGreaterThan(100)
  expect(parsed.warnings).toEqual([])
  pack = parsed.pack
})

describe('freight rate engine', () => {
  it('中国邮政将 14% 货代服务费分项展示并执行最低 2 元', () => {
    const result = quoteFreight(pack, { country: 'US', actualWeightKg: 0.1, dimensionsCm: { length: 20, width: 15, height: 8 } })
    const chinaPost = result.candidates.find(candidate => candidate.carrierId === 'china-post-registered')
    expect(chinaPost).toMatchObject({ eligible: true, fixedFeeCny: 13.5 })
    expect(chinaPost?.surchargeCny).toBeCloseTo(2.73, 2)
    expect(chinaPost?.totalCny).toBeCloseTo(22.25, 2)
  })

  it('e邮宝使用最低计费克重，以色列允许到 3kg', () => {
    const brazil = quoteFreight(pack, { country: 'BR', actualWeightKg: 0.01 })
    const ePacketBrazil = brazil.candidates.find(candidate => candidate.carrierId === 'epacket')
    expect(ePacketBrazil?.billableWeightKg).toBe(0.05)

    const israel = quoteFreight(pack, { country: 'IL', actualWeightKg: 2.5 })
    expect(israel.candidates.find(candidate => candidate.carrierId === 'epacket')?.eligible).toBe(true)
  })

  it('UPS 缺少尺寸时拒绝猜测，提供尺寸后使用体积重和完整重量区间', () => {
    const missing = quoteFreight(pack, { country: 'US', actualWeightKg: 2.5 })
    expect(missing.candidates.find(candidate => candidate.carrierId === 'ups-expedited')).toMatchObject({ eligible: false })

    const volume = quoteFreight(pack, { country: 'US', actualWeightKg: 2.5, dimensionsCm: { length: 80, width: 60, height: 50 } })
    const upsVolume = volume.candidates.find(candidate => candidate.carrierId === 'ups-expedited')
    expect(upsVolume?.volumetricWeightKg).toBe(48)
    expect(upsVolume?.billableWeightKg).toBe(48)
    expect(upsVolume?.warnings).toContain('当前费率不含燃油附加费')

    const overTwenty = quoteFreight(pack, { country: 'US', actualWeightKg: 22, dimensionsCm: { length: 20, width: 20, height: 20 } })
    expect(overTwenty.candidates.find(candidate => candidate.carrierId === 'ups-expedited')?.baseFreightCny).toBeCloseTo(22 * 51.947852, 2)
  })

  it('美元金额按分向上取整并记录费率版本', () => {
    const result = quoteFreight(pack, { country: 'US', actualWeightKg: 0.5, dimensionsCm: { length: 20, width: 15, height: 8 }, exchangeRateCnyPerUsd: 7 })
    expect(result.ratePackVersion).toBe('1.0.0')
    expect(result.selected).not.toBeNull()
    expect(((result.selected?.totalUsd || 0) * 100) % 1).toBeCloseTo(0, 8)
  })
})
