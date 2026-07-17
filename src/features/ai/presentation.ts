const sessionStatusLabels: Record<string, string> = {
  active: '进行中',
  resolved: '已解决',
  transferred: '已转人工',
}

export function formatChatTime(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function supportSessionStatusLabel(status?: string | null): string {
  return status ? sessionStatusLabels[status] || status : '-'
}
