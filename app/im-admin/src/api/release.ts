/**
 * 客户端版本发布管理 API
 * 提供版本分页查询、新版本发布（安装包上传）、状态切换、
 * 灰度策略配置、更新包查询及更新统计等接口封装。
 */
import client from './index'

/** 版本数据模型 */
export interface ReleaseVersion {
    id: number
    version: string
    buildNumber: number
    channel: string
    updateType: string
    changelog?: string
    minVersion?: string
    forceDeadline?: string
    status: number
    createTime?: string
    updateTime?: string
}

/** 更新包数据模型 */
export interface ReleasePackage {
    id: number
    versionId: number
    packageType: string
    fromVersion?: string
    fileName: string
    fileSize: number
    checksumSha256: string
    downloadCount: number
    createTime?: string
}

/** 灰度策略配置 */
export interface GrayStrategyPayload {
    strategyType: 'all' | 'gray' | 'whitelist'
    grayPercent?: number
    whitelist?: string[]
    startTime?: string
    endTime?: string
}

/** 新版本发布表单 */
export interface PublishVersionPayload {
    file: File
    version: string
    buildNumber: number
    channel: string
    updateType: string
    changelog?: string
    minVersion?: string
    forceDeadline?: string
    publish: boolean
}

/**
 * 分页查询版本列表
 * GET /api/admin/update/versions/page
 */
export function getVersionsPage(params: { channel?: string; page?: number; pageSize?: number }) {
    return client.get('/api/admin/update/versions/page', { params })
}

/**
 * 发布新版本（上传安装包，异步生成增量补丁）
 * POST /api/admin/update/versions
 */
export function publishVersion(payload: PublishVersionPayload) {
    const formData = new FormData()
    formData.append('file', payload.file)
    formData.append('version', payload.version)
    formData.append('buildNumber', String(payload.buildNumber))
    formData.append('channel', payload.channel)
    formData.append('updateType', payload.updateType)
    if (payload.changelog) formData.append('changelog', payload.changelog)
    if (payload.minVersion) formData.append('minVersion', payload.minVersion)
    if (payload.forceDeadline) formData.append('forceDeadline', payload.forceDeadline)
    formData.append('publish', String(payload.publish))
    return client.post('/api/admin/update/versions', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 600000,
    })
}

/**
 * 更新版本状态（0-草稿 1-发布 2-下架）
 * PUT /api/admin/update/versions/{id}/status
 */
export function updateVersionStatus(id: number, status: number) {
    return client.put(`/api/admin/update/versions/${id}/status`, null, { params: { status } })
}

/**
 * 查询版本关联的更新包
 * GET /api/admin/update/versions/{id}/packages
 */
export function getVersionPackages(id: number) {
    return client.get(`/api/admin/update/versions/${id}/packages`)
}

/**
 * 配置灰度发布策略
 * POST /api/admin/update/versions/{id}/gray
 */
export function saveGrayStrategy(id: number, payload: GrayStrategyPayload) {
    return client.post(`/api/admin/update/versions/${id}/gray`, payload)
}

/**
 * 更新统计（版本分布、事件统计、安装成功率）
 * GET /api/admin/update/statistics
 */
export function getUpdateStatistics() {
    return client.get('/api/admin/update/statistics')
}
