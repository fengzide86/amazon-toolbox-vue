interface RuntimePackageMetadata {
  toolbox?: {
    controlApiUrl?: string
  }
}

const LOCAL_CONTROL_API = 'http://localhost:8000'

function normalizeControlApiUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined

  const candidate = value.trim().replace(/\/$/, '')
  const parsed = new URL(candidate)
  const localHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && localHost)) {
    throw new Error('Remote control API must use HTTPS')
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('Control API URL must not contain credentials, query parameters, or fragments')
  }
  return candidate
}

function resolveRuntimeConfig(
  environment: NodeJS.ProcessEnv,
  packageMetadata: RuntimePackageMetadata,
) {
  const controlApiBase = normalizeControlApiUrl(
    environment.TOOLBOX_CONTROL_API_URL || packageMetadata.toolbox?.controlApiUrl || LOCAL_CONTROL_API,
  ) as string
  const bundledOverride = environment.TOOLBOX_USE_BUNDLED_BACKEND

  return {
    controlApiBase,
    useBundledBackend: bundledOverride
      ? bundledOverride === 'true'
      : controlApiBase === LOCAL_CONTROL_API,
  }
}

export { LOCAL_CONTROL_API, normalizeControlApiUrl, resolveRuntimeConfig }
