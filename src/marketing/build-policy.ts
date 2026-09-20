const allowedSources = [
  /^src\/marketing\//,
  /^src\/components\/(?:brand|landing)\//,
  /^src\/assets\/(?:brand|css\/base)\//,
  /^src\/views\/LandingView\.vue$/,
  /^src\/composables\/useLandingMotion\.ts$/,
  /^src\/runtime\/desktop-download\.ts$/,
]

export function isMarketingSource(relativePath: string): boolean {
  return allowedSources.some(pattern => pattern.test(relativePath.replaceAll('\\', '/').split('?')[0] || ''))
}

export function publicHttpsUrl(value: string | undefined, name: string, required = true): string {
  const candidate = value?.trim() || ''
  if (!candidate && !required) return ''
  if (!candidate) throw new Error(`${name} must explicitly identify the public production URL`)
  const url = new URL(candidate)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || /^(?:localhost|127\.|0\.|\[?::1\]?$)/i.test(url.hostname)
    || /(?:candidate-|win-unpacked|installer-smoke|\.example$)/i.test(candidate)) {
    throw new Error(`${name} must be a stable public HTTPS URL without credentials or test artifacts`)
  }
  return url.toString()
}

export const marketingHeaders = `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
/
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
/terms
  Cache-Control: no-cache
/404.html
  Cache-Control: no-store
/marketing-version.json
  Cache-Control: no-store
/assets/*
  Cache-Control: public, max-age=31536000, immutable
`

// Only the real static route is rewritten. The generated 404.html preserves
// actual HTTP 404s for unknown paths instead of turning API mistakes into 200s.
export const marketingRedirects = '/terms /index.html 200\n/user/terms /terms 301\n'
