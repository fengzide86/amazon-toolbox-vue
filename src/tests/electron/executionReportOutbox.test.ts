import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import type { ExecutionReportOutbox as OutboxType } from '../../../electron/automation/execution-report-outbox.cjs'

const require = createRequire(import.meta.url)
const { ExecutionReportOutbox } = require(resolve('dist-electron/electron/automation/execution-report-outbox.cjs')) as { ExecutionReportOutbox: typeof OutboxType }
const directories: string[] = []
const outboxes: OutboxType[] = []
const codec = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(Buffer.from(value).toString('base64')),
  decryptString: (value: Buffer) => Buffer.from(value.toString(), 'base64').toString(),
}
const receipt = { token: 'private-launch-grant', run_id: 'run-1', status: 'succeeded', error_code: null, adapter_version: '1', page_fingerprint: 'hash', page_changed: false, completed_steps: 5 }
function setup(request: typeof fetch, directory = mkdtempSync(join(tmpdir(), 'kst-report-test-')), apiBase = 'https://control.test') {
  if (!directories.includes(directory)) directories.push(directory)
  const queue = new ExecutionReportOutbox({ directory, apiBase, version: 'test', codec, request })
  outboxes.push(queue)
  return { queue, directory }
}
const ok = () => Promise.resolve(new Response(JSON.stringify({ success: true, data: { execution_id: 123 } })))
afterEach(() => {
  for (const queue of outboxes.splice(0)) queue.dispose()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
  vi.useRealTimers()
})

describe('durable Runner receipt outbox', () => {
  it('persists a minimal encrypted receipt before sending and retries after restart', async () => {
    const fail = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'))
    const { queue, directory } = setup(fail)
    expect(await queue.submit({ ...receipt, password: 'never-store', pageText: 'never-store', input: { secret: true } })).toMatchObject({ warning: expect.stringContaining('本机') })
    const target = join(directory, readdirSync(directory)[0])
    const bytes = readFileSync(target)
    expect(bytes.toString()).not.toContain(receipt.token)
    expect(codec.decryptString(bytes)).not.toContain('never-store')
    expect(JSON.parse(String(fail.mock.calls[0][1]?.body))).toEqual(receipt)
    const succeed = vi.fn<typeof fetch>().mockImplementation(ok)
    await setup(succeed, directory).queue.flush()
    expect(succeed).toHaveBeenCalledTimes(1)
    expect(JSON.parse(codec.decryptString(readFileSync(target))).entries).toEqual([])
  })

  it('retains one receipt for duplicate submissions and accepts server idempotency', async () => {
    const send = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error('lost response')).mockImplementation(ok)
    const { queue } = setup(send)
    await queue.submit(receipt)
    expect(await queue.submit(receipt)).toEqual({ executionId: 123 })
    await queue.flush()
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[0][1]?.body).toBe(send.mock.calls[1][1]?.body)
  })

  it('isolates receipt files by configured control server', async () => {
    const { queue, directory } = setup(vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')))
    await queue.submit(receipt)
    const other = vi.fn<typeof fetch>().mockImplementation(ok)
    await setup(other, directory, 'https://other.test').queue.flush()
    expect(other).not.toHaveBeenCalled()
  })

  it('retains a permanently rejected receipt without repeated requests', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 403 }))
    const { queue, directory } = setup(send)
    expect(await queue.submit(receipt)).toMatchObject({ warning: expect.stringContaining('联系支持') })
    await queue.flush()
    await setup(send, directory).queue.flush()
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('fails closed on unavailable encryption and on corrupt stored data', async () => {
    const { directory } = setup(vi.fn<typeof fetch>())
    const send = vi.fn<typeof fetch>()
    const disabled = new ExecutionReportOutbox({ directory, apiBase: 'https://control.test', version: 'test', request: send, codec: { ...codec, isEncryptionAvailable: () => false } })
    await expect(disabled.submit(receipt)).rejects.toThrow('安全存储')
    const { queue } = setup(vi.fn<typeof fetch>().mockRejectedValue(new Error()), directory)
    await queue.submit(receipt)
    const target = join(directory, readdirSync(directory)[0])
    writeFileSync(target, 'invalid')
    await expect(setup(send, directory).queue.submit(receipt)).rejects.toThrow()
    expect(readFileSync(target, 'utf8')).toBe('invalid')
    expect(send).not.toHaveBeenCalled()
  })

  it('serializes concurrent reports without losing one receipt', async () => {
    const send = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'))
    const { queue, directory } = setup(send)
    await Promise.all([queue.submit(receipt), queue.submit({ ...receipt, token: 'other-grant', run_id: 'run-2' })])
    const stored = JSON.parse(codec.decryptString(readFileSync(join(directory, readdirSync(directory)[0]))))
    expect(stored.entries).toHaveLength(2)
  })

  it('rejects invalid receipts before saving or sending', async () => {
    const send = vi.fn<typeof fetch>()
    const { queue, directory } = setup(send)
    expect(() => queue.submit({ ...receipt, status: 'pending' })).toThrow()
    expect(readdirSync(directory)).toEqual([])
    expect(send).not.toHaveBeenCalled()
  })
})
