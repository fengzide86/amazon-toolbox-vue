import { net, protocol } from 'electron'
import { resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([{
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false },
  }])
}

export function registerAppProtocol(distRoot: string): void {
  const root = resolve(distRoot)
  protocol.handle('app', request => {
    const requestUrl = new URL(request.url)
    const relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '') || 'index.html'
    const target = resolve(root, relativePath)
    if (target !== root && !target.startsWith(`${root}${sep}`)) {
      return new Response('Not found', { status: 404 })
    }
    return net.fetch(pathToFileURL(target).toString())
  })
}
