import { describe, expect, it } from 'vitest'

import { demoBatchSchema } from './model'

describe('demo batch model', () => {
  it('normalizes omitted and null list items to an empty collection', () => {
    const base = { id: 'batch-1', tool_id: 'tool-1', row_count: 8 }

    expect(demoBatchSchema.parse(base).items).toEqual([])
    expect(demoBatchSchema.parse({ ...base, items: null }).items).toEqual([])
  })
})
