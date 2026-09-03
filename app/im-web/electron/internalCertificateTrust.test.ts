import { X509Certificate } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { rootCertificates } from 'node:tls'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getAppPath: () => '',
    isPackaged: false,
  },
  session: {
    defaultSession: {
      setCertificateVerifyProc: vi.fn(),
    },
  },
}))

import {
  CERTIFICATE_VERIFY_RESULT,
  INTERNAL_SERVER_IP,
  getCertificateVerifyResult,
  isTrustedInternalServerCertificate,
  parseAndValidateInternalCa,
} from './internalCertificateTrust'

const validTestTime = Date.parse('2026-09-04T00:00:00Z')
const rootCaPem = readFileSync(
  fileURLToPath(new URL('../build/huiyu-root-ca.crt', import.meta.url)),
  'utf8',
)
const serverCertificatePem = readFileSync(
  fileURLToPath(new URL('./test-fixtures/huiyu-server.crt', import.meta.url)),
  'utf8',
)

describe('Electron internal CA certificate trust', () => {
  const ca = parseAndValidateInternalCa(rootCaPem, validTestTime)

  it('accepts the valid server certificate for the fixed intranet IP', () => {
    expect(getCertificateVerifyResult(
      INTERNAL_SERVER_IP,
      serverCertificatePem,
      ca,
      validTestTime,
    )).toBe(CERTIFICATE_VERIFY_RESULT.allow)
  })

  it('delegates unrelated HTTPS hosts to Chromium default verification', () => {
    expect(getCertificateVerifyResult(
      'example.com',
      'not a certificate',
      ca,
      validTestTime,
    )).toBe(CERTIFICATE_VERIFY_RESULT.useChromiumDefault)
  })

  it('rejects malformed certificates for the intranet IP', () => {
    expect(getCertificateVerifyResult(
      INTERNAL_SERVER_IP,
      'not a certificate',
      ca,
      validTestTime,
    )).toBe(CERTIFICATE_VERIFY_RESULT.deny)
  })

  it('rejects a certificate whose SAN does not contain the expected IP', () => {
    expect(isTrustedInternalServerCertificate(
      serverCertificatePem,
      ca,
      '172.16.59.254',
      validTestTime,
    )).toBe(false)
  })

  it('rejects certificates signed by another CA', () => {
    const unrelatedCa = parseAndValidateInternalCa(rootCertificates[0], validTestTime)

    expect(getCertificateVerifyResult(
      INTERNAL_SERVER_IP,
      serverCertificatePem,
      unrelatedCa,
      validTestTime,
    )).toBe(CERTIFICATE_VERIFY_RESULT.deny)
  })

  it('rejects certificates outside their validity period', () => {
    expect(getCertificateVerifyResult(
      INTERNAL_SERVER_IP,
      serverCertificatePem,
      ca,
      Date.parse('2026-09-01T00:00:00Z'),
    )).toBe(CERTIFICATE_VERIFY_RESULT.deny)

    expect(getCertificateVerifyResult(
      INTERNAL_SERVER_IP,
      serverCertificatePem,
      ca,
      Date.parse('2027-10-06T00:00:00Z'),
    )).toBe(CERTIFICATE_VERIFY_RESULT.deny)
  })

  it('rejects a non-CA trust anchor and an expired CA', () => {
    expect(() => parseAndValidateInternalCa(serverCertificatePem, validTestTime)).toThrow('不是 CA')
    expect(() => parseAndValidateInternalCa(rootCaPem, Date.parse('2036-09-01T00:00:00Z')))
      .toThrow('已经过期')
  })
})
