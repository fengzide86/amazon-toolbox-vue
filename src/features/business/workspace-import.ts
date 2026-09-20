import type { SavedFileResult } from '@/shared/ipc/electron-api'
import {
  chooseLocalDemoSpreadsheet,
  createLocalDemoSample,
  downloadLocalDemoTemplate,
  downloadLocalImportErrors,
} from '@/features/demo/localSpreadsheet'
import { parseBrowserDemoSpreadsheet } from '@/features/demo/browserSpreadsheet'

import { importPreviewSchema, type BusinessTool, type ImportPreview } from './model'
import { errorMessage, importOptions, ipcPayload, requireBatchApi, toolCapabilityKey } from './workspace-helpers'

export interface WorkspaceImportDependencies {
  getSelectedTool(): BusinessTool | null
  getMaxRows(): number
  getPreview(): ImportPreview | null
  setPreview(preview: ImportPreview | null): void
  setLoading(loading: boolean): void
  setError(message: string | null): void
}

/**
 * Owns the desktop/browser import boundary while the Pinia store remains the
 * public facade. Imported rows always return through the same validated model.
 */
export class WorkspaceImportCoordinator {
  private requestSequence = 0
  private loadingRequestId: number | null = null

  constructor(private readonly dependencies: WorkspaceImportDependencies) {}

  private isCurrent(requestId: number, tool: BusinessTool): boolean {
    return requestId === this.requestSequence && this.dependencies.getSelectedTool() === tool
  }

  invalidate(): void {
    this.requestSequence += 1
    if (this.loadingRequestId !== null) this.dependencies.setLoading(false)
    this.loadingRequestId = null
  }

  private finishLoading(requestId: number): void {
    if (this.loadingRequestId !== requestId) return
    this.loadingRequestId = null
    this.dependencies.setLoading(false)
  }

  async loadSample(): Promise<ImportPreview> {
    const tool = this.requireTool()
    const requestId = ++this.requestSequence
    this.loadingRequestId = requestId
    this.dependencies.setLoading(true)
    this.dependencies.setError(null)
    try {
      const maxRows = this.dependencies.getMaxRows()
      const batch = window.electronAPI?.batch
      const payload = batch
        ? await batch.loadSampleImport(importOptions(tool, maxRows))
        : createLocalDemoSample(tool.batch_input_schema || [], maxRows)
      const preview = importPreviewSchema.parse(payload)
      if (this.isCurrent(requestId, tool)) this.dependencies.setPreview(preview)
      return preview
    } catch (cause) {
      if (this.isCurrent(requestId, tool)) this.dependencies.setError(errorMessage(cause, '内置演示数据载入失败'))
      throw cause
    } finally {
      this.finishLoading(requestId)
    }
  }

  async saveSampleTemplate(): Promise<SavedFileResult | string | null> {
    const batch = window.electronAPI?.batch
    if (batch) return batch.saveSampleTemplate()
    return downloadLocalDemoTemplate(this.dependencies.getSelectedTool()?.batch_input_schema || [])
  }

  async selectFile(): Promise<ImportPreview> {
    const tool = this.requireTool()
    const requestId = ++this.requestSequence
    this.loadingRequestId = requestId
    this.dependencies.setLoading(true)
    this.dependencies.setError(null)
    try {
      const maxRows = this.dependencies.getMaxRows()
      const batch = window.electronAPI?.batch
      let payload: ImportPreview | null
      if (batch) payload = await batch.selectImportFile(importOptions(tool, maxRows))
      else {
        const file = await chooseLocalDemoSpreadsheet()
        if (!file) throw new Error('未选择 Excel 或 CSV 文件')
        payload = await parseBrowserDemoSpreadsheet(file, tool.batch_input_schema || [], maxRows, { capabilityKey: toolCapabilityKey(tool) })
      }
      if (!payload) throw new Error('未选择 Excel 文件')
      const preview = importPreviewSchema.parse(payload)
      if (this.isCurrent(requestId, tool)) this.dependencies.setPreview(preview)
      return preview
    } catch (cause) {
      if (this.isCurrent(requestId, tool)) this.dependencies.setError(errorMessage(cause, '文件导入失败'))
      throw cause
    } finally {
      this.finishLoading(requestId)
    }
  }

  async exportErrors(): Promise<SavedFileResult | string | null> {
    const preview = this.dependencies.getPreview()
    if (!preview?.errors.length) return null
    if (!window.electronAPI?.batch) return downloadLocalImportErrors(preview.errors)
    if (this.dependencies.getSelectedTool()?.availability === 'demo_only') return null
    return requireBatchApi().exportImportErrors(ipcPayload(preview.errors))
  }

  private requireTool(): BusinessTool {
    const tool = this.dependencies.getSelectedTool()
    if (!tool) throw new Error('请先选择批量工具')
    return tool
  }
}
