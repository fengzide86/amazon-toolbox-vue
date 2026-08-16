const DEFAULT_MANIFEST_PATH = '/updates/latest.yml'

function unquote(value: string): string {
  const trimmed = value.trim()
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

export function installerPathFromManifest(manifest: string): string {
  const pathMatch = manifest.match(/^path:\s*(.+?)\s*$/m)
  const fileMatch = manifest.match(/^\s*-\s+url:\s*(.+?)\s*$/m)
  const candidate = unquote(pathMatch?.[1] || fileMatch?.[1] || '')
  if (!candidate || !/\.exe$/i.test(candidate)) throw new Error('桌面安装包清单暂时不可用')
  if (candidate.includes('..') || /^[a-z]+:/i.test(candidate)) throw new Error('桌面安装包地址无效')
  return candidate.replace(/^\/+/, '')
}

function configuredDownloadUrl(): string {
  return String(import.meta.env.VITE_DESKTOP_DOWNLOAD_URL || '').trim()
}

export async function resolveDesktopInstallerUrl(
  request: typeof fetch = fetch,
  origin = typeof window !== 'undefined' ? window.location.origin : '',
): Promise<string> {
  const configured = configuredDownloadUrl()
  if (configured) return new URL(configured, origin || 'http://localhost').toString()
  if (!origin) throw new Error('无法确定桌面安装包地址')
  const manifestUrl = new URL(DEFAULT_MANIFEST_PATH, origin)
  manifestUrl.searchParams.set('t', String(Date.now()))
  const response = await request(manifestUrl.toString(), { cache: 'no-store' })
  if (!response.ok) throw new Error('桌面安装包清单暂时无法读取')
  const installerPath = installerPathFromManifest(await response.text())
  const encodedPath = installerPath.split('/').map(segment => encodeURIComponent(segment)).join('/')
  return new URL(`/updates/${encodedPath}`, origin).toString()
}

export async function downloadDesktopInstaller(): Promise<string> {
  const url = await resolveDesktopInstallerUrl()
  window.location.assign(url)
  return url
}
