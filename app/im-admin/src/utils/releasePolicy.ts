export function validateReleaseApproval(
  version: string,
  reason: string,
  forceUpdate: boolean,
  minimumVersion?: string,
  confirmationVersion?: string,
) {
  if (!reason.trim()) return '必须填写变更原因'
  if (reason.trim().length > 500) return '变更原因不能超过 500 个字符'
  if ((forceUpdate || !!minimumVersion) && confirmationVersion !== version) return `强制更新策略必须输入版本号 ${version} 进行确认`
  return null
}

export function immutableArtifactFields() {
  return [
    'version', 'channel', 'platform', 'arch', 'updateBaseUrl', 'manifestName', 'manifestDigest',
    'installerName', 'installerSize', 'installerSha512', 'sourceCommit', 'signerThumbprint',
  ] as const
}
