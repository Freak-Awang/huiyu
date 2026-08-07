import { describe, expect, it } from 'vitest'
import { immutableArtifactFields, validateReleaseApproval } from './releasePolicy'

describe('release approval safeguards', () => {
  it('requires a reason for every policy or lifecycle change', () => {
    expect(validateReleaseApproval('0.0.9', ' ', false)).toMatch(/原因/)
    expect(validateReleaseApproval('0.0.9', '首批白名单验证', false)).toBeNull()
  })

  it('requires the exact version for force update confirmation', () => {
    expect(validateReleaseApproval('0.0.9', '安全修复', true, undefined, '0.0.8')).toMatch(/0.0.9/)
    expect(validateReleaseApproval('0.0.9', '安全修复', true, undefined, '0.0.9')).toBeNull()
    expect(validateReleaseApproval('0.0.9', '淘汰旧更新器', false, '0.0.7', '0.0.9')).toBeNull()
  })

  it('keeps every artifact identity field read-only', () => {
    expect(immutableArtifactFields()).toContain('manifestDigest')
    expect(immutableArtifactFields()).toContain('signerThumbprint')
    expect(immutableArtifactFields()).toContain('updateBaseUrl')
  })
})
