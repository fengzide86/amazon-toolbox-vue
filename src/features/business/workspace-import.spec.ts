import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BatchBridge } from '@/shared/ipc/electron-api'
import { businessToolSchema, importPreviewSchema, type ImportPreview } from './model'
import { WorkspaceImportCoordinator } from './workspace-import'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline })
  return { promise, resolve, reject }
}

function setup() {
  const toolA = businessToolSchema.parse({ id: 'a', name: '工具 A' })
  const toolB = businessToolSchema.parse({ id: 'b', name: '工具 B' })
  let selectedTool = toolA
  const dependencies = {
    getSelectedTool: () => selectedTool,
    getMaxRows: () => 50,
    getPreview: () => null,
    setPreview: vi.fn(), setLoading: vi.fn(), setError: vi.fn(),
  }
  const batch = { selectImportFile: vi.fn(), loadSampleImport: vi.fn() }
  window.electronAPI = { batch: batch as unknown as BatchBridge }
  const coordinator = new WorkspaceImportCoordinator(dependencies)
  return { coordinator, dependencies, batch, switchTool: () => { selectedTool = toolB }, switchBack: () => { selectedTool = toolA } }
}

const preview = (id: string) => importPreviewSchema.parse({ importId: id, validCount: 1, rows: [], errors: [] })

describe('business import request ownership', () => {
  afterEach(() => { delete window.electronAPI })

  it.each(['selectFile', 'loadSample'] as const)('does not attach a late %s from tool A to tool B', async action => {
    const context = setup()
    const result = deferred<ImportPreview>()
    context.batch[action === 'selectFile' ? 'selectImportFile' : 'loadSampleImport'].mockReturnValue(result.promise)
    const pending = context.coordinator[action]()
    context.switchTool()
    result.resolve(preview('tool-a-import'))
    await pending
    expect(context.dependencies.setPreview).not.toHaveBeenCalled()
    expect(context.dependencies.setLoading).toHaveBeenLastCalledWith(false)
  })

  it('keeps the latest import and prevents an older completion from clearing its loading state', async () => {
    const { coordinator, dependencies, batch } = setup()
    const old = deferred<ImportPreview>()
    const recent = deferred<ImportPreview>()
    batch.selectImportFile.mockReturnValueOnce(old.promise).mockReturnValueOnce(recent.promise)
    const first = coordinator.selectFile()
    const second = coordinator.selectFile()
    old.resolve(preview('old'))
    await first
    expect(dependencies.setPreview).not.toHaveBeenCalled()
    expect(dependencies.setLoading).toHaveBeenLastCalledWith(true)
    recent.resolve(preview('recent'))
    await second
    expect(dependencies.setPreview).toHaveBeenCalledExactlyOnceWith(preview('recent'))
    expect(dependencies.setLoading).toHaveBeenLastCalledWith(false)
  })

  it('does not let an older failure overwrite a newer successful import', async () => {
    const { coordinator, dependencies, batch } = setup()
    const old = deferred<ImportPreview>()
    batch.selectImportFile.mockReturnValueOnce(old.promise)
    batch.loadSampleImport.mockResolvedValueOnce(preview('current'))
    const first = coordinator.selectFile()
    const rejection = expect(first).rejects.toThrow('old failure')
    await coordinator.loadSample()
    old.reject(new Error('old failure'))
    await rejection
    expect(dependencies.setError).not.toHaveBeenCalledWith('old failure')
    expect(dependencies.setPreview).toHaveBeenCalledExactlyOnceWith(preview('current'))
  })

  it('invalidates an import even after switching from A to B and back to the same A object', async () => {
    const context = setup()
    const old = deferred<ImportPreview>()
    context.batch.selectImportFile.mockReturnValueOnce(old.promise)
    const pending = context.coordinator.selectFile()
    context.coordinator.invalidate()
    context.switchTool()
    context.coordinator.invalidate()
    context.switchBack()
    expect(context.dependencies.setLoading).toHaveBeenLastCalledWith(false)
    old.resolve(preview('old-a'))
    await pending
    expect(context.dependencies.setPreview).not.toHaveBeenCalled()
  })
})
