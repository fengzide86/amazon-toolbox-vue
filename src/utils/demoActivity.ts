interface DemoActivityBridge {
  setActive(token: string, active: boolean): Promise<void>
}

function bridge(): DemoActivityBridge | undefined {
  if (typeof window === 'undefined') return undefined
  return (window.electronAPI as (typeof window.electronAPI & { demoActivity?: DemoActivityBridge }) | undefined)?.demoActivity
}

export function demoActivityToken(scope: 'single' | 'batch', id: string | number): string {
  const normalized = String(id).replace(/[^A-Za-z0-9._:-]/g, '_').slice(0, 110) || 'unknown'
  return `${scope}:${normalized}`
}

export async function setDemoActivity(token: string, active: boolean): Promise<void> {
  const api = bridge()
  if (!api) return
  try {
    await api.setActive(token, active)
  } catch (error) {
    console.warn(`[DemoActivity] 无法同步演示状态（${active ? 'active' : 'inactive'}）:`, error)
  }
}
