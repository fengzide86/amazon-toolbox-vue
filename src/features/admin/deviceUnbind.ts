export type DeviceEntityId = string | number

export function normalizeDeviceUnbindReason(value: unknown): string {
  const reason = String(value || '').trim()
  if (reason.length < 2) throw new Error('解绑原因至少需要 2 个字')
  if (reason.length > 500) throw new Error('解绑原因不能超过 500 个字')
  return reason
}

export function buildDeviceUnbindPath(deviceId: DeviceEntityId, rawReason: unknown): string {
  const params = new URLSearchParams({
    device_id: String(deviceId),
    reason: normalizeDeviceUnbindReason(rawReason),
  })
  return `/api/devices/unbind?${params.toString()}`
}
