import { describe, expect, it } from 'vitest'

import { updateSnapshotSchema } from './update-contract.js'

describe('updateSnapshotSchema', () => {
  it('accepts an actionable downloaded update', () => {
    const snapshot = updateSnapshotSchema.parse({
      status: 'downloaded',
      currentVersion: '1.7.2',
      availableVersion: '1.8.0',
      releaseNotes: ['改进公告中心'],
      percent: 100,
      transferredBytes: 1024,
      totalBytes: 1024,
      canRestart: true,
    })

    expect(snapshot.releaseNotes).toEqual(['改进公告中心'])
  })

  it('rejects fabricated progress values', () => {
    expect(() => updateSnapshotSchema.parse({
      status: 'downloading',
      currentVersion: '1.7.2',
      percent: 120,
      canRestart: false,
    })).toThrow()
  })
})
