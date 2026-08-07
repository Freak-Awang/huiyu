export type UpdateChannel = 'stable' | 'beta'

function isLoopback(url: URL) {
  return url.protocol === 'http:'
    && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
}

export function validateServerOrigin(value: string) {
  const server = new URL(value)
  if (server.username || server.password || server.pathname !== '/' || server.search || server.hash) {
    throw new Error('更新服务器必须配置为不含路径和凭据的 origin')
  }
  if (server.protocol !== 'https:' && !isLoopback(server)) {
    throw new Error('更新服务器必须使用 HTTPS')
  }
  return server.origin
}

export function validateUpdateSource(
  serverOrigin: string,
  updateBaseUrl: string,
  channel: UpdateChannel,
  version: string,
) {
  const trustedOrigin = validateServerOrigin(serverOrigin)
  const source = new URL(updateBaseUrl)
  if (source.origin !== trustedOrigin) throw new Error('更新源与配置的内网服务器不同源')
  if (source.protocol !== 'https:' && !isLoopback(source)) throw new Error('更新源必须使用 HTTPS')
  if (source.username || source.password || source.search || source.hash) throw new Error('更新源包含不允许的凭据或参数')
  const expectedPath = `/downloads/arttalk/${channel}/${version}/win-x64/`
  if (source.pathname !== expectedPath) throw new Error(`更新源必须使用不可变版本路径 ${expectedPath}`)
  return source.toString()
}

export interface ReleaseIdentity {
  hasUpdate: boolean
  releaseId?: number
  latestVersion?: string
  updateBaseUrl?: string
  channel?: UpdateChannel
}

export function releaseMatchesPolicy(
  expected: Required<Pick<ReleaseIdentity, 'releaseId' | 'latestVersion' | 'updateBaseUrl' | 'channel'>>,
  policy: ReleaseIdentity,
) {
  return policy.hasUpdate
    && policy.releaseId === expected.releaseId
    && policy.latestVersion === expected.latestVersion
    && policy.updateBaseUrl === expected.updateBaseUrl
    && policy.channel === expected.channel
}

export function installationGate(
  transferBlockers: number,
  expected: Required<Pick<ReleaseIdentity, 'releaseId' | 'latestVersion' | 'updateBaseUrl' | 'channel'>>,
  policy?: ReleaseIdentity,
) {
  if (transferBlockers > 0) return 'WAIT_FOR_TRANSFERS' as const
  if (!policy || !releaseMatchesPolicy(expected, policy)) return 'BLOCK_POLICY_CHANGED' as const
  return 'ALLOW_INSTALL' as const
}
