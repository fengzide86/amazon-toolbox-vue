import { app, dialog, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { quoteFreight } from '../../src/shared/freight/rate-engine.js'
import type { FreightQuoteRequest, FreightRatePack } from '../../src/shared/freight/types.js'
import type { TrustedHandleRegistrar } from '../ipc/trusted-ipc.cjs'

const { parseFreightWorkbook } = require('./rate-pack.cjs') as {
  parseFreightWorkbook: (filePath: string, options: UnknownRecord) => Promise<UnknownRecord>
}

type UnknownRecord = Record<string, unknown>

interface DesktopFreightControllerOptions {
  getWindow: () => BrowserWindow | null | undefined
  registerAutomationHandle: TrustedHandleRegistrar
}

function asRecord(value: unknown): UnknownRecord {
  return typeof value === 'object' && value !== null ? value as UnknownRecord : {}
}

/** Owns the desktop-only freight workbook selection, cache and IPC surface. */
export class DesktopFreightController {
  private readonly getWindow: () => BrowserWindow | null | undefined
  private readonly registerAutomationHandle: TrustedHandleRegistrar
  private selectedWorkbookPath: string | null = null
  private defaultPackCache: { mtimeMs: number; parsed: UnknownRecord } | null = null

  constructor(options: DesktopFreightControllerOptions) {
    this.getWindow = options.getWindow
    this.registerAutomationHandle = options.registerAutomationHandle
  }

  defaultWorkbookPath(): string {
    return app.isPackaged
      ? join(process.resourcesPath, 'rates', 'FreightTemplate_v2.xlsx')
      : join(app.getAppPath(), 'resources', 'rates', 'FreightTemplate_v2.xlsx')
  }

  registerIpc(): void {
    this.registerAutomationHandle('freight:get-default-pack', () => this.loadDefaultPack())
    this.registerAutomationHandle(
      'freight:parse-workbook',
      async (_event: IpcMainInvokeEvent, rawOptions: unknown) => {
        const options = asRecord(rawOptions)
        const dialogOptions: Electron.OpenDialogOptions = {
          title: '选择物流费率工作簿',
          properties: ['openFile'],
          filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }],
        }
        const window = this.getWindow()
        const result = window
          ? await dialog.showOpenDialog(window, dialogOptions)
          : await dialog.showOpenDialog(dialogOptions)
        if (result.canceled || !result.filePaths[0]) return null
        this.selectedWorkbookPath = result.filePaths[0]
        return parseFreightWorkbook(this.selectedWorkbookPath, options)
      },
    )
    this.registerAutomationHandle(
      'freight:reparse-workbook',
      (_event: IpcMainInvokeEvent, rawOptions: unknown) => {
        if (!this.selectedWorkbookPath) throw new Error('请先选择物流费率工作簿')
        return parseFreightWorkbook(this.selectedWorkbookPath, asRecord(rawOptions))
      },
    )
    this.registerAutomationHandle(
      'freight:quote',
      async (_event: IpcMainInvokeEvent, rawPayload: unknown) => {
        const payload = asRecord(rawPayload)
        const parsed = payload.pack ? { pack: payload.pack } : await this.loadDefaultPack()
        return quoteFreight(
          asRecord(parsed).pack as FreightRatePack,
          asRecord(payload.request) as unknown as FreightQuoteRequest,
        )
      },
    )
  }

  private async loadDefaultPack(): Promise<UnknownRecord> {
    const filePath = this.defaultWorkbookPath()
    if (!existsSync(filePath)) throw new Error('内置费率表不存在，请更新桌面客户端')
    const mtimeMs = statSync(filePath).mtimeMs
    if (this.defaultPackCache?.mtimeMs === mtimeMs) return this.defaultPackCache.parsed
    const parsed = await parseFreightWorkbook(filePath, {
      id: 'competition-freight',
      version: '1.0.0',
      exchangeRateCnyPerUsd: 7,
    }) as UnknownRecord
    this.defaultPackCache = { mtimeMs, parsed }
    return parsed
  }
}
