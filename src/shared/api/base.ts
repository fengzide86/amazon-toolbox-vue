export function getApiBase(): string {
  try {
    const runtimeApiBase = window.electronAPI?.runtime?.controlApiBase
    if (runtimeApiBase) return runtimeApiBase.replace(/\/+$/, '')
  } catch {
    // Non-Electron environments continue with stored or build-time configuration.
  }
  try {
    const controlApiBase = localStorage.getItem('toolbox_control_api_base')
    if (controlApiBase) return controlApiBase.replace(/\/+$/, '')
    const electronApiBase = localStorage.getItem('toolbox_api_base')
    if (electronApiBase) return electronApiBase.replace(/\/+$/, '')
  } catch {
    // Storage may be unavailable in isolated tests.
  }
  return (import.meta.env.VITE_CONTROL_API_BASE
    || import.meta.env.VITE_API_BASE
    || 'http://localhost:8000').replace(/\/+$/, '')
}
