/**
 * 在线状态（Presence）模块
 *
 * 定义用户在线状态类型及 UI 展示配置。
 * 支持 5 种在线状态 + 离线：
 * - online（在线）、busy（忙碌）、away（离开）、dnd（请勿打扰）、invisible（隐身）
 * 提供状态规范化、标签获取、在线判断等工具函数。
 */
export type PresenceStatus = 'online' | 'busy' | 'away' | 'dnd' | 'invisible' | 'offline'

/** 在线状态选项（供 UI 下拉选择器使用） */
export interface PresenceOption {
  value: PresenceStatus
  label: string
  description: string
}

/** 在线状态选项列表 */
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

/**
 * 规范化在线状态值
 * 对非法值统一回退为 'offline'，防止 UI 展示异常
 * @param value - 任意状态值
 * @returns 合法的 PresenceStatus
 */
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

/**
 * 获取在线状态的中文标签
 * @param status - 在线状态
 */
export function getPresenceLabel(status: PresenceStatus): string {
  return PRESENCE_LABELS[status] || PRESENCE_LABELS.offline
}

/**
 * 判断是否在线（非离线状态）
 * @param status - 在线状态
 */
export function isPresenceOnline(status: PresenceStatus): boolean {
  return status !== 'offline'
}
