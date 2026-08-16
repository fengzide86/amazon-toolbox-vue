export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function finiteInteger(value: unknown, fallback: number, minimum: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= minimum
    ? parsed
    : fallback
}

/**
 * Normalize the paginated response shapes used by both current and shipped
 * control-plane builds without changing the default API client's data unwrap.
 */
export function normalizePaginatedResponse<T = unknown>(value: unknown): PaginatedResponse<T> {
  if (Array.isArray(value)) {
    return { items: value as T[], total: value.length, page: 1, page_size: value.length || 20 }
  }

  const outer = asRecord(value)
  if (!outer) throw new Error('分页响应格式异常')

  const nested = asRecord(outer.data)
  const pageRecord = nested ?? outer
  const items = Array.isArray(pageRecord.items)
    ? pageRecord.items
    : Array.isArray(pageRecord.data)
      ? pageRecord.data
      : Array.isArray(outer.items)
        ? outer.items
        : Array.isArray(outer.data)
          ? outer.data
          : null

  if (!items) throw new Error('分页响应缺少数据列表')

  const total = finiteInteger(pageRecord.total ?? outer.total, items.length, 0)
  const page = finiteInteger(pageRecord.page ?? outer.page, 1, 1)
  const pageSize = finiteInteger(
    pageRecord.page_size ?? outer.page_size,
    items.length || 20,
    1,
  )

  return { items: items as T[], total, page, page_size: pageSize }
}
