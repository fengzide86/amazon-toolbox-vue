import type { BatchItem, BusinessBatchSnapshot } from './model'

export function activeInterventionCount(snapshot: BusinessBatchSnapshot): number {
  if (snapshot.status !== 'running') return 0
  return snapshot.items.filter(item => item.status === 'waiting_user'
    && !(snapshot.recordKind === 'demo' && item.simulatedOutcome === 'attention_example')).length
}

/** Presentation never infers task success from elapsed time or a progress value. */
export function demoProgress(item: BatchItem): number | null {
  if (item.status === 'completed') return 100
  if (item.status !== 'running' && item.status !== 'pending') return null
  if (typeof item.progressPercent !== 'number' || !Number.isFinite(item.progressPercent)) return null
  // The controller can reach 100 before the completion update has been persisted.
  return Math.max(0, Math.min(99, Math.round(item.progressPercent)))
}

export function endedAccountCount(items: BatchItem[], isDemo: boolean): number {
  return items.filter(item =>
    ['completed', 'failed', 'cancelled'].includes(item.status)
    || (isDemo && item.status === 'waiting_user' && item.simulatedOutcome === 'attention_example'),
  ).length
}

export function executionStage(item: BatchItem, isDemo: boolean): string {
  if (item.status === 'waiting_user') return isDemo ? '需关注案例' : '等待你操作'
  if (item.status === 'failed') return isDemo ? '异常案例' : '执行未完成'
  if (item.status === 'cancelled') return '已结束'
  if (item.status === 'completed') return isDemo ? '完成案例' : '已完成'
  if (item.status === 'pending') return '等待开始'
  if (!isDemo) return item.status === 'running' ? '自动处理中' : '等待状态更新'
  if (item.status !== 'running') return '等待状态更新'
  const index = item.stageIndex
  return typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < 4
    ? ['准备演示', '演示操作', '演示核验', '等待演示结果'][index]!
    : '正在演示'
}

export function stagePresentation(item: BatchItem, index: number): { done: boolean; active: boolean } {
  if (item.status === 'completed') return { done: true, active: false }
  if (item.status !== 'running' || typeof item.stageIndex !== 'number') return { done: false, active: false }
  // All four segments turn complete only after the completion event, not at 100%.
  const current = Math.max(0, Math.min(3, item.stageIndex))
  return { done: current > index, active: current === index }
}
