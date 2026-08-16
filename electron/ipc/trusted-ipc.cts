import type {
  BrowserWindow,
  IpcMain,
  IpcMainEvent,
  IpcMainInvokeEvent,
} from 'electron'

import {
  parseDesktopIpcArgs,
  type DesktopIpcInvocationChannel,
} from '../../src/shared/ipc/desktop-contract.js'
import { assertTrustedSender } from './sender-guard.js'

type ErrorMessage = (error: unknown, fallback?: string) => string

export type TrustedHandleRegistrar = <TArgs extends unknown[], TResult>(
  channel: DesktopIpcInvocationChannel,
  handler: (event: IpcMainInvokeEvent, ...args: TArgs) => TResult,
) => void

export type TrustedEventRegistrar = <TArgs extends unknown[]>(
  channel: string,
  handler: (event: IpcMainEvent, ...args: TArgs) => void | Promise<void>,
) => void

export interface TrustedIpcRegistrar {
  handle: TrustedHandleRegistrar
  automationHandle: TrustedHandleRegistrar
  on: TrustedEventRegistrar
}

interface TrustedIpcRegistrarOptions {
  ipcMain: IpcMain
  getWindow: () => BrowserWindow | null | undefined
  allowDevelopmentOrigin: boolean
  automationEnabled: boolean
  errorMessage: ErrorMessage
}

/**
 * Centralizes renderer trust checks and shared IPC argument validation.
 * Feature controllers only receive these registrars, so they cannot
 * accidentally publish an unguarded desktop channel.
 */
export function createTrustedIpcRegistrar(options: TrustedIpcRegistrarOptions): TrustedIpcRegistrar {
  function handle<TArgs extends unknown[], TResult>(
    channel: DesktopIpcInvocationChannel,
    handler: (event: IpcMainInvokeEvent, ...args: TArgs) => TResult,
  ): void {
    options.ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      assertTrustedSender(event, options.getWindow, options.allowDevelopmentOrigin)
      const parsedArgs = parseDesktopIpcArgs(channel, args) as TArgs
      return handler(event, ...parsedArgs)
    })
  }

  function automationHandle<TArgs extends unknown[], TResult>(
    channel: DesktopIpcInvocationChannel,
    handler: (event: IpcMainInvokeEvent, ...args: TArgs) => TResult,
  ): void {
    if (options.automationEnabled) handle(channel, handler)
  }

  function on<TArgs extends unknown[]>(
    channel: string,
    handler: (event: IpcMainEvent, ...args: TArgs) => void | Promise<void>,
  ): void {
    options.ipcMain.on(channel, (event: IpcMainEvent, ...args: unknown[]) => {
      try {
        assertTrustedSender(event, options.getWindow, options.allowDevelopmentOrigin)
        void handler(event, ...(args as TArgs))
      } catch (error) {
        console.warn(`[IPC] Rejected ${channel}:`, options.errorMessage(error))
      }
    })
  }

  return { handle, automationHandle, on }
}
