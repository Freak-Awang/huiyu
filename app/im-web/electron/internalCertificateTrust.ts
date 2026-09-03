import { app, session } from 'electron'
import { X509Certificate } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const INTERNAL_SERVER_IP = '172.16.59.253'

export const CERTIFICATE_VERIFY_RESULT = {
  allow: 0,
  deny: -2,
  useChromiumDefault: -3,
} as const

type CertificateVerifyResult = (typeof CERTIFICATE_VERIFY_RESULT)[keyof typeof CERTIFICATE_VERIFY_RESULT]

function isCertificateValidAt(certificate: X509Certificate, nowMs: number): boolean {
  const validFromMs = Date.parse(certificate.validFrom)
  const validToMs = Date.parse(certificate.validTo)

  return Number.isFinite(validFromMs)
    && Number.isFinite(validToMs)
    && nowMs >= validFromMs
    && nowMs <= validToMs
}

/**
 * Parse and validate the bundled trust anchor before any network request is made.
 * Throwing here deliberately prevents the app from starting with weakened TLS rules.
 */
export function parseAndValidateInternalCa(certificatePem: string, nowMs = Date.now()): X509Certificate {
  const ca = new X509Certificate(certificatePem)

  if (!ca.ca) {
    throw new Error('内置证书不是 CA 证书')
  }
  if (ca.subject !== ca.issuer || !ca.verify(ca.publicKey)) {
    throw new Error('内置 CA 不是有效的自签名根证书')
  }
  if (!isCertificateValidAt(ca, nowMs)) {
    throw new Error('内置 CA 尚未生效或已经过期')
  }

  return ca
}

/**
 * Validate a leaf certificate for the fixed intranet server. The current deployment
 * intentionally supports a root-CA-to-leaf chain only; intermediate CAs are rejected.
 */
export function isTrustedInternalServerCertificate(
  certificatePem: string,
  ca: X509Certificate,
  expectedIp = INTERNAL_SERVER_IP,
  nowMs = Date.now(),
): boolean {
  try {
    const leaf = new X509Certificate(certificatePem)

    return !leaf.ca
      && isCertificateValidAt(leaf, nowMs)
      && leaf.checkIP(expectedIp) === expectedIp
      && leaf.issuer === ca.subject
      && leaf.verify(ca.publicKey)
  } catch {
    return false
  }
}

export function getCertificateVerifyResult(
  hostname: string,
  certificatePem: string,
  ca: X509Certificate,
  nowMs = Date.now(),
): CertificateVerifyResult {
  if (hostname !== INTERNAL_SERVER_IP) {
    return CERTIFICATE_VERIFY_RESULT.useChromiumDefault
  }

  return isTrustedInternalServerCertificate(certificatePem, ca, INTERNAL_SERVER_IP, nowMs)
    ? CERTIFICATE_VERIFY_RESULT.allow
    : CERTIFICATE_VERIFY_RESULT.deny
}

function getInternalCaPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'certs', 'huiyu-root-ca.crt')
    : join(app.getAppPath(), 'build', 'huiyu-root-ca.crt')
}

/** Register strict, app-local trust for the Huiyu intranet server. */
export function configureInternalCertificateTrust(): void {
  const caPath = getInternalCaPath()
  let caPem: string

  try {
    caPem = readFileSync(caPath, 'utf8')
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`无法读取内置 CA 证书（${caPath}）：${reason}`)
  }

  let ca: X509Certificate
  try {
    ca = parseAndValidateInternalCa(caPem)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`内置 CA 证书无效：${reason}`)
  }

  session.defaultSession.setCertificateVerifyProc((request, callback) => {
    callback(getCertificateVerifyResult(request.hostname, request.certificate.data, ca))
  })
}
