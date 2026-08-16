import type { ToolboxElectronApi } from '@/shared/ipc/electron-api'

export type RuntimeKind = 'desktop' | 'web'

export interface RuntimeCapabilities {
  kind: RuntimeKind
  isDesktop: boolean
  singleDemo: true
  singleLive: boolean
  batchDemo: true
  batchLive: boolean
  credentialStore: boolean
  desktopUpdates: boolean
  notifications: boolean
  freightWorkbook: boolean
  freightQuote: boolean
}

function browserFileSupport(): boolean {
  return typeof window !== 'undefined'
    && typeof File !== 'undefined'
    && typeof Blob !== 'undefined'
    && typeof ArrayBuffer !== 'undefined'
}

/**
 * Resolve renderer capabilities from the bridge that Electron exposes.
 *
 * Demo workflows deliberately remain available without Electron. Live
 * automation is only enabled when the matching desktop bridge exists.
 */
export function resolveRuntimeCapabilities(
  electronApi: ToolboxElectronApi | undefined = typeof window !== 'undefined' ? window.electronAPI : undefined,
): RuntimeCapabilities {
  const isDesktop = Boolean(electronApi)
  return {
    kind: isDesktop ? 'desktop' : 'web',
    isDesktop,
    singleDemo: true,
    singleLive: Boolean(electronApi?.automation),
    batchDemo: true,
    batchLive: Boolean(electronApi?.batch),
    credentialStore: Boolean(electronApi?.credentialStore),
    desktopUpdates: Boolean(electronApi?.updates),
    notifications: Boolean(electronApi?.notifications),
    freightWorkbook: Boolean(electronApi?.freight) || browserFileSupport(),
    freightQuote: Boolean(electronApi?.freight) || typeof window !== 'undefined',
  }
}

export function getRuntimeCapabilities(): RuntimeCapabilities {
  return resolveRuntimeCapabilities()
}
