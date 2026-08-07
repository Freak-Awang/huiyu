import { describe, expect, it } from 'vitest'
import { installationGate, releaseMatchesPolicy, validateServerOrigin, validateUpdateSource } from './update-policy'

describe('desktop update trust policy', () => {
  it('accepts only the configured HTTPS origin and immutable version path', () => {
    expect(validateUpdateSource(
      'https://im.example.test',
      'https://im.example.test/downloads/arttalk/stable/0.0.9/win-x64/',
      'stable',
      '0.0.9',
    )).toBe('https://im.example.test/downloads/arttalk/stable/0.0.9/win-x64/')
    expect(() => validateUpdateSource(
      'https://im.example.test',
      'https://cdn.example.test/downloads/arttalk/stable/0.0.9/win-x64/',
      'stable',
      '0.0.9',
    )).toThrow(/不同源/)
    expect(() => validateUpdateSource(
      'https://im.example.test',
      'https://im.example.test/downloads/arttalk/stable/win-x64/',
      'stable',
      '0.0.9',
    )).toThrow(/不可变版本路径/)
  })

  it('allows HTTP only for loopback development origins', () => {
    expect(validateServerOrigin('http://127.0.0.1:8080')).toBe('http://127.0.0.1:8080')
    expect(() => validateServerOrigin('http://172.16.59.253:88')).toThrow(/HTTPS/)
  })

  it('rejects credentials, query strings and fragments in update sources', () => {
    expect(() => validateUpdateSource('https://im.example.test',
      'https://user:secret@im.example.test/downloads/arttalk/stable/0.0.9/win-x64/',
      'stable', '0.0.9')).toThrow()
    expect(() => validateUpdateSource('https://im.example.test',
      'https://im.example.test/downloads/arttalk/stable/0.0.9/win-x64/?cache=off',
      'stable', '0.0.9')).toThrow(/参数/)
  })

  it('requires the same release identity before installing a downloaded package', () => {
    const expected = {
      releaseId: 9,
      latestVersion: '0.0.9',
      updateBaseUrl: 'https://im.example.test/downloads/arttalk/stable/0.0.9/win-x64/',
      channel: 'stable' as const,
    }
    expect(releaseMatchesPolicy(expected, { hasUpdate: true, ...expected })).toBe(true)
    expect(releaseMatchesPolicy(expected, { hasUpdate: false, ...expected })).toBe(false)
    expect(releaseMatchesPolicy(expected, { hasUpdate: true, ...expected, releaseId: 10 })).toBe(false)
    expect(releaseMatchesPolicy(expected, { hasUpdate: true, ...expected, latestVersion: '0.0.10' })).toBe(false)
    expect(installationGate(2, expected, { hasUpdate: true, ...expected })).toBe('WAIT_FOR_TRANSFERS')
    expect(installationGate(0, expected, { hasUpdate: false, ...expected })).toBe('BLOCK_POLICY_CHANGED')
    expect(installationGate(0, expected, { hasUpdate: true, ...expected })).toBe('ALLOW_INSTALL')
  })

  it('keeps stable and beta manifests in separate immutable paths', () => {
    expect(validateUpdateSource('https://im.example.test',
      'https://im.example.test/downloads/arttalk/beta/0.0.10-beta.1/win-x64/',
      'beta', '0.0.10-beta.1')).toContain('/beta/0.0.10-beta.1/')
    expect(() => validateUpdateSource('https://im.example.test',
      'https://im.example.test/downloads/arttalk/stable/0.0.10-beta.1/win-x64/',
      'beta', '0.0.10-beta.1')).toThrow(/不可变版本路径/)
  })
})
