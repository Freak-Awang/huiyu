// ?????presence isolates reusable client-side behavior from Vue components.
export type PresenceStatus = 'online' | 'busy' | 'away' | 'dnd' | 'invisible' | 'offline'

export interface PresenceOption {
  value: PresenceStatus
  label: string
  description: string
}

export const PRESENCE_OPTIONS: PresenceOption[] = [
  { value: 'online', label: '在线', description: '正常接收消息提醒' },
  { value: 'busy', label: '忙碌', description: '显示忙碌状态' },
  { value: 'away', label: '离开', description: '显示暂时离开' },
  { value: 'dnd', label: '请勿打扰', description: '不弹出桌面通知' },
  { value: 'invisible', label: '隐身', description: '对他人显示离线' },
]

const PRESENCE_LABELS: Record<PresenceStatus, string> = {
  online: '在线',
  busy: '忙碌',
  away: '离开',
  dnd: '请勿打扰',
  invisible: '隐身',
  offline: '离线',
}

export function normalizePresenceStatus(value: unknown): PresenceStatus {
  if (
    value === 'online' ||
    value === 'busy' ||
    value === 'away' ||
    value === 'dnd' ||
    value === 'invisible' ||
    value === 'offline'
  ) {
    return value
  }
  return 'offline'
}

export function getPresenceLabel(status: PresenceStatus): string {
  return PRESENCE_LABELS[status] || PRESENCE_LABELS.offline
}

export function isPresenceOnline(status: PresenceStatus): boolean {
  return status !== 'offline'
}
