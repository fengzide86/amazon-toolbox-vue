import { describe, expect, it } from 'vitest'

import {
  AUTOMATION_PROTOCOL_ERROR_CODE,
  AUTOMATION_PROTOCOL_VERSION,
  hostToRunnerMessageSchema,
  runnerProtocolError,
  runnerToHostMessageSchema,
} from './automation-contract.js'

describe('automation IPC contract', () => {
  it('accepts the existing command and event names', () => {
    expect(hostToRunnerMessageSchema.parse({
      type: 'command', id: 'cmd-1', command: 'complete-user-action', payload: {},
    })).toEqual(expect.objectContaining({ command: 'complete-user-action' }))
    expect(runnerToHostMessageSchema.parse({
      type: 'event',
      event: { protocolVersion: AUTOMATION_PROTOCOL_VERSION, eventId: 'event-1', type: 'run.started' },
    })).toEqual(expect.objectContaining({ type: 'event' }))
  })

  it('rejects malformed cross-process payloads with a stable error code', () => {
    expect(hostToRunnerMessageSchema.safeParse({ type: 'command', id: '', command: 'start' }).success).toBe(false)
    expect(runnerToHostMessageSchema.safeParse({ type: 'response', id: 'cmd-1', ok: 'yes' }).success).toBe(false)
    expect(runnerProtocolError().code).toBe(AUTOMATION_PROTOCOL_ERROR_CODE)
  })
})
