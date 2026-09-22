import { describe, expect, it } from 'vitest'
import { validateSingleToolInput } from '@/features/automation/input-validation'
import { toolCatalogItemSchema } from '@/features/tools/model'

const fields = toolCatalogItemSchema.parse({ id: 'test', name: 'test', single_input_schema: [
  { key: 'name', label: '名称', type: 'text' },
  { key: 'count', label: '数量', type: 'number' },
  { key: 'region', label: '地区', type: 'select', options: ['美国', '英国'] },
  { key: 'optional', label: '备注', required: false },
] }).single_input_schema!
describe('published single-tool input validation', () => {
  it('rejects whitespace-only required input', () => expect(validateSingleToolInput(fields, { name: '  ' })).toBe('请填写名称'))
  it.each([NaN, Infinity, '12'])('rejects non-finite or untyped numeric input %s', count => {
    expect(validateSingleToolInput(fields, { name: '模板', count, region: '美国' })).toContain('有效数字')
  })
  it('rejects a stale select value', () => expect(validateSingleToolInput(fields, { name: '模板', count: 2, region: '失效选项' })).toBe('请重新选择地区'))
  it('does not invent numeric bounds or require an optional field', () => expect(validateSingleToolInput(fields, { name: '模板', count: 0, region: '美国' })).toBeNull())
})
