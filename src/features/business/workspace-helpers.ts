import type { BusinessTool } from './model'

const STATUS_MESSAGE: Record<string, string> = {
  pending: '等待处理',
  running: '正在处理',
  waiting_user: '需要操作',
  completed: '已完成',
  failed: '未完成',
  cancelled: '已结束',
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function unwrapData(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || !('data' in value)) return value
  return (value as { data: unknown }).data
}

export function requireBatchApi() {
  const api = window.electronAPI?.batch
  if (!api) throw new Error('批量工作台仅支持桌面客户端')
  return api
}

export function toolCapabilityKey(tool: BusinessTool): string {
  const direct = typeof tool.capability_key === 'string' ? tool.capability_key : ''
  if (direct) return direct
  const scriptKey = typeof tool.script_key === 'string' ? tool.script_key : ''
  return scriptKey
    .replace(/^demo\./, '')
    .replace(/^amazon\./, '')
    .replace(/_walkthrough_v\d+$/, '')
    .replace(/\.v\d+$/, '')
}

export function importOptions(tool: BusinessTool, maxRows: number) {
  return {
    capabilityKey: toolCapabilityKey(tool),
    schema: tool.batch_input_schema || [],
    maxRows,
  }
}

export function statusText(status: string): string {
  return STATUS_MESSAGE[status] || status
}

export function createClientBatchId(now = Date.now()): string {
  const bytes = new Uint32Array(2)
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes)
  else {
    bytes[0] = Math.floor(Math.random() * 0xffff_ffff)
    bytes[1] = Math.floor(Math.random() * 0xffff_ffff)
  }
  return `batch_${now}_${Array.from(bytes, value => value.toString(16)).join('')}`
}
