import type { ToolCatalogItem } from '@/features/tools/model'

/** Validate only published input rules; never guess business ranges or supply Live data. */
export function validateSingleToolInput(
  fields: NonNullable<ToolCatalogItem['single_input_schema']>,
  input: Record<string, string | number | undefined>,
): string | null {
  for (const field of fields) {
    const value = input[field.key]
    const empty = value === undefined || (typeof value === 'string' && !value.trim())
    if (empty) {
      if (field.required) return `请填写${field.label}`
      continue
    }
    if (field.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) return `${field.label}请输入有效数字`
    if (field.type === 'select' && !field.options?.includes(String(value))) return `请重新选择${field.label}`
  }
  return null
}
