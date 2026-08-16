import {
  app,
  dialog,
  webContents,
  type BrowserWindow,
  type IpcMainInvokeEvent,
  type SaveDialogOptions,
} from 'electron'
import { copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import {
  parseDesktopIpcEvent,
  type NotificationFocusPayload,
} from '../../src/shared/ipc/desktop-contract.js'
import type { TrustedHandleRegistrar } from '../ipc/trusted-ipc.cjs'

type UnknownRecord = Record<string, unknown>

interface CoordinatorLike {
  storeImport(parsed: unknown): unknown
  remapImportItems(importId: string, itemIds: string[]): unknown
  create(payload: UnknownRecord): unknown
  startItem(itemId: string, tool: UnknownRecord): Promise<unknown>
  failProvision(itemId: string, message?: string): unknown
  completeUserAction(itemId: string): Promise<unknown>
  restartItem(itemId: string): Promise<unknown>
  cancel(status?: string): Promise<unknown>
  snapshot(): UnknownRecord
  registerBrowser(itemId: string, guest: Electron.WebContents): unknown
  unregisterBrowser(itemId: string): unknown
}

interface EmbeddedBrowserHostManagerLike {
  releaseAll(): unknown
}

const { BatchCoordinator } = require('./batch-coordinator.cjs') as {
  BatchCoordinator: new (options: UnknownRecord) => CoordinatorLike
}
const { parseBatchFile, writeBatchErrors } = require('./batch-importer.cjs') as {
  parseBatchFile: (filePath: string, options: UnknownRecord) => Promise<unknown>
  writeBatchErrors: (filePath: string, errors: unknown[]) => Promise<unknown>
}
const { EmbeddedBrowserHostManager } = require('./embedded-browser-host-manager.cjs') as {
  EmbeddedBrowserHostManager: new () => EmbeddedBrowserHostManagerLike
}

interface ActionNotification {
  title: string
  body: string
  focus: NotificationFocusPayload
}

interface DesktopBatchControllerOptions {
  getWindow: () => BrowserWindow | null | undefined
  runnerEnvironment: () => NodeJS.ProcessEnv
  registerAutomationHandle: TrustedHandleRegistrar
  onActivityChanged: () => void
  showNotification: (notification: ActionNotification) => void
}

function asRecord(value: unknown): UnknownRecord {
  return typeof value === 'object' && value !== null ? value as UnknownRecord : {}
}

/** Owns batch import, coordinator, per-item browser hosts and batch IPC. */
export class DesktopBatchController {
  private readonly options: DesktopBatchControllerOptions
  private readonly browserHosts = new EmbeddedBrowserHostManager()
  private coordinator: CoordinatorLike | null = null
  private selectedImportPath: string | null = null
  private selectedItem: string | null = null

  constructor(options: DesktopBatchControllerOptions) {
    this.options = options
  }

  registerIpc(): void {
    const register = this.options.registerAutomationHandle
    register('batch:store-demo-import', (_event: IpcMainInvokeEvent, rawPayload: unknown) => {
      const payload = asRecord(rawPayload)
      const rawRows = Array.isArray(payload.rows) ? payload.rows.slice(0, 100) : []
      if (!rawRows.length) throw new Error('本地演示项为空')
      const importId = typeof payload.importId === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(payload.importId)
        ? payload.importId
        : `demo_import_${Date.now()}`
      return this.getCoordinator().storeImport({
        importId,
        fileName: '本地交互演示数据',
        rows: rawRows.map((value, index) => {
          const row = asRecord(value)
          const itemId = typeof row.itemId === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(row.itemId)
            ? row.itemId
            : `demo_item_${index + 1}`
          const accountLabel = typeof row.accountLabel === 'string'
            ? row.accountLabel.slice(0, 80)
            : `演示项 ${index + 1}`
          return {
            itemId,
            input: asRecord(row.input),
            preview: { account_label: accountLabel },
            accountLabelMasked: accountLabel,
          }
        }),
        errors: [],
      })
    })

    register('batch:select-import-file', async (_event: IpcMainInvokeEvent, rawOptions: unknown) => {
      const dialogOptions: Electron.OpenDialogOptions = {
        title: '选择批量数据文件',
        properties: ['openFile'],
        filters: [{ name: '批量数据', extensions: ['xlsx', 'csv'] }],
      }
      const window = this.options.getWindow()
      const result = window
        ? await dialog.showOpenDialog(window, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions)
      if (result.canceled || !result.filePaths[0]) return null
      this.selectedImportPath = result.filePaths[0]
      const parsed = await parseBatchFile(this.selectedImportPath, asRecord(rawOptions))
      return this.getCoordinator().storeImport(parsed)
    })
    register('batch:parse-import-file', async (_event: IpcMainInvokeEvent, rawOptions: unknown) => {
      if (!this.selectedImportPath) throw new Error('请先选择批量数据文件')
      const parsed = await parseBatchFile(this.selectedImportPath, asRecord(rawOptions))
      return this.getCoordinator().storeImport(parsed)
    })
    register('batch:load-sample-import', async (_event: IpcMainInvokeEvent, rawOptions: unknown) => {
      const templatePath = this.sampleTemplatePath()
      if (!existsSync(templatePath)) throw new Error('内置测试 Excel 不存在，请更新桌面客户端')
      const parsed = await parseBatchFile(templatePath, asRecord(rawOptions))
      return this.getCoordinator().storeImport(parsed)
    })
    register('batch:save-sample-template', async () => {
      const templatePath = this.sampleTemplatePath()
      if (!existsSync(templatePath)) throw new Error('内置测试 Excel 不存在，请更新桌面客户端')
      const options: SaveDialogOptions = {
        title: '保存 B 端测试 Excel',
        defaultPath: 'B端批量自动化测试数据.xlsx',
        filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }],
      }
      const window = this.options.getWindow()
      const result = window
        ? await dialog.showSaveDialog(window, options)
        : await dialog.showSaveDialog(options)
      if (result.canceled || !result.filePath) return null
      copyFileSync(templatePath, result.filePath)
      return { filePath: result.filePath }
    })
    register('batch:remap-import-items', (_event: IpcMainInvokeEvent, rawPayload: unknown) => {
      const payload = asRecord(rawPayload)
      const itemIds = Array.isArray(payload.itemIds)
        ? payload.itemIds.map(value => String(value || '')).filter(Boolean)
        : []
      return this.getCoordinator().remapImportItems(String(payload.importId || ''), itemIds)
    })
    register('batch:export-import-errors', async (_event: IpcMainInvokeEvent, rawErrors: unknown) => {
      const errors = Array.isArray(rawErrors) ? rawErrors : []
      const options: SaveDialogOptions = {
        title: '导出导入问题',
        defaultPath: '批量导入问题.csv',
        filters: [{ name: 'CSV 文件', extensions: ['csv'] }],
      }
      const window = this.options.getWindow()
      const result = window
        ? await dialog.showSaveDialog(window, options)
        : await dialog.showSaveDialog(options)
      if (result.canceled || !result.filePath) return null
      return writeBatchErrors(result.filePath, errors)
    })
    register('batch:create', (_event: IpcMainInvokeEvent, payload: unknown) => this.getCoordinator().create(asRecord(payload)))
    register('batch:start', (_event: IpcMainInvokeEvent, payload: unknown) => {
      const data = asRecord(payload)
      return this.getCoordinator().startItem(String(data.itemId || ''), asRecord(data.tool))
    })
    register('batch:fail-item', (_event: IpcMainInvokeEvent, payload: unknown) => {
      const data = asRecord(payload)
      return this.getCoordinator().failProvision(
        String(data.itemId || ''),
        typeof data.message === 'string' ? data.message : undefined,
      )
    })
    register('batch:complete-user-action', (_event: IpcMainInvokeEvent, itemId: unknown) => (
      this.getCoordinator().completeUserAction(String(itemId || ''))
    ))
    register('batch:restart-item', (_event: IpcMainInvokeEvent, itemId: unknown) => (
      this.getCoordinator().restartItem(String(itemId || ''))
    ))
    register('batch:cancel', async (_event: IpcMainInvokeEvent, status: unknown) => {
      this.selectedItem = null
      return this.getCoordinator().cancel(typeof status === 'string' ? status : 'cancelled')
    })
    register('batch:get-snapshot', () => this.getCoordinator().snapshot())
    register('batch:select-item', (_event: IpcMainInvokeEvent, rawItemId: unknown) => {
      const itemId = String(rawItemId || '')
      this.selectedItem = itemId
      return { itemId, snapshot: this.getCoordinator().snapshot() }
    })
    register(
      'batch:register-browser',
      (event: IpcMainInvokeEvent, rawItemId: unknown, webContentsId: unknown) => {
        const itemId = String(rawItemId || '')
        const guest = webContents.fromId(Number(webContentsId))
        if (!guest || guest.getType?.() !== 'webview') throw new Error('无法注册批量工作区浏览器')
        if (guest.hostWebContents && guest.hostWebContents.id !== event.sender.id) {
          throw new Error('批量浏览器归属校验失败')
        }
        return this.getCoordinator().registerBrowser(itemId, guest)
      },
    )
    register('batch:unregister-browser', (_event: IpcMainInvokeEvent, itemId: unknown) => (
      this.getCoordinator().unregisterBrowser(String(itemId || ''))
    ))
  }

  selectedItemId(): string | null {
    return this.selectedItem
  }

  isActive(): boolean {
    return this.coordinator?.snapshot()?.status === 'running'
  }

  async cancelActiveForWindowClose(): Promise<void> {
    await this.coordinator?.cancel('interrupted').catch(() => undefined)
  }

  async cleanup(): Promise<void> {
    this.selectedItem = null
    this.browserHosts.releaseAll()
    if (!this.coordinator) return
    await this.coordinator.cancel('interrupted')
    this.coordinator = null
  }

  private getCoordinator(): CoordinatorLike {
    if (this.coordinator) return this.coordinator
    this.coordinator = new BatchCoordinator({
      scriptPath: join(__dirname, '..', 'automation-runner.cjs'),
      env: this.options.runnerEnvironment(),
      hostManager: this.browserHosts,
      onEvent: (event: UnknownRecord) => {
        this.options.onActivityChanged()
        const parsedEvent = parseDesktopIpcEvent('batch:event', event)
        const window = this.options.getWindow()
        if (window && !window.isDestroyed()) window.webContents.send('batch:event', parsedEvent)
      },
      onNotify: ({ itemId, accountLabelMasked, type }: {
        itemId: string
        accountLabelMasked: string
        type: string
      }) => this.options.showNotification({
        title: `${accountLabelMasked || '一个客户账号'}需要操作`,
        body: ({ login: '请完成账号登录', captcha: '请完成页面验证码', two_factor: '请完成二次验证' } as Record<string, string>)[type]
          || '请完成页面提示的操作',
        focus: { mode: 'batch', itemId },
      }),
    }) as CoordinatorLike
    return this.coordinator
  }

  private sampleTemplatePath(): string {
    return app.isPackaged
      ? join(process.resourcesPath, 'templates', 'B端批量自动化测试数据.xlsx')
      : join(app.getAppPath(), 'resources', 'templates', 'B端批量自动化测试数据.xlsx')
  }
}
