export const TOOLBOX_VERSION = import.meta.env.VITE_APP_VERSION || 'unknown'

export function toolboxVersionHeaders(headers: Record<string, string> = {}): Record<string, string> {
  return { 'X-Toolbox-Version': TOOLBOX_VERSION, ...headers }
}
