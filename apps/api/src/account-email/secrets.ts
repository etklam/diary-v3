import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const VERSION = 'v1'
const KEY_VERSION_PATTERN = /^[A-Za-z0-9_-]{1,40}$/u
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/u
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/u
const NONCE_BYTES = 12
const AUTH_TAG_BYTES = 16
const KEY_BYTES = 32
const AAD_NAMESPACE = 'diary-smtp'

export type SmtpSecretErrorCode = 'SMTP_ENCRYPTION_UNAVAILABLE' | 'SMTP_ENCRYPTED_DATA_UNAVAILABLE'

export class SmtpSecretError extends Error {
  readonly code: SmtpSecretErrorCode

  constructor(code: SmtpSecretErrorCode) {
    super(code === 'SMTP_ENCRYPTION_UNAVAILABLE' ? 'SMTP encryption is unavailable.' : 'Encrypted SMTP data is unavailable.')
    this.name = 'SmtpSecretError'
    this.code = code
  }
}
export type SmtpKeyValue = string | Uint8Array

export interface SmtpKeyring {
  activeVersion: string
  keys: Record<string, SmtpKeyValue>
}

/** Read deployment keys lazily so mail-disabled startup does not require them. */
export function environmentSmtpKeyring(environment: NodeJS.ProcessEnv = process.env): SmtpKeyring {
  const activeVersion = environment.SMTP_ENCRYPTION_ACTIVE_KEY ?? ''
  const rawKeys = environment.SMTP_ENCRYPTION_KEYS
  if (!rawKeys) return { activeVersion, keys: {} }

  try {
    const parsed: unknown = JSON.parse(rawKeys)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { activeVersion, keys: {} }
    const keys: Record<string, SmtpKeyValue> = {}
    for (const [version, value] of Object.entries(parsed)) {
      if (typeof value === 'string') keys[version] = value
    }
    return { activeVersion, keys }
  } catch {
    return { activeVersion, keys: {} }
  }
}

export const getSmtpKeyring = environmentSmtpKeyring

function unavailable(): never {
  throw new SmtpSecretError('SMTP_ENCRYPTION_UNAVAILABLE')
}

function keyFor(keyring: SmtpKeyring, version: string): Buffer {
  if (!KEY_VERSION_PATTERN.test(version)) return unavailable()
  const encoded = keyring.keys[version]
  if (!encoded) return unavailable()

  const key = typeof encoded === 'string'
    ? !BASE64_PATTERN.test(encoded) ? null : Buffer.from(encoded, 'base64')
    : Buffer.from(encoded)
  if (!key || key.length !== KEY_BYTES) return unavailable()
  return key
}

function aad(version: string, purpose: string): Buffer {
  return Buffer.from(`${AAD_NAMESPACE}:${VERSION}:${version}:${purpose}`, 'utf8')
}

function decodeBase64Url(value: string, expectedLength: number | null): Buffer {
  if (!BASE64URL_PATTERN.test(value)) throw new Error('invalid base64url')
  const decoded = Buffer.from(value, 'base64url')
  if (expectedLength !== null && decoded.length !== expectedLength) throw new Error('invalid length')
  if (decoded.toString('base64url') !== value) throw new Error('non-canonical base64url')
  return decoded
}

export function encryptSmtpSecret(plaintext: string, purpose: string, keyring = environmentSmtpKeyring()): string {
  if (typeof plaintext !== 'string' || typeof purpose !== 'string' || !KEY_VERSION_PATTERN.test(keyring.activeVersion)) return unavailable()

  const nonce = randomBytes(NONCE_BYTES)
  const cipher = createCipheriv('aes-256-gcm', keyFor(keyring, keyring.activeVersion), nonce)
  cipher.setAAD(aad(keyring.activeVersion, purpose))
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return [VERSION, keyring.activeVersion, nonce.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.')
}

export function decryptSmtpSecret(envelope: string, purpose: string, keyring = environmentSmtpKeyring()): string {
  try {
    if (typeof envelope !== 'string' || typeof purpose !== 'string') throw new Error('invalid input')
    const parts = envelope.split('.')
    const [format, version, encodedNonce, encodedTag, encodedCiphertext] = parts
    if (parts.length !== 5 || format !== VERSION || !version || encodedCiphertext === undefined) throw new Error('invalid envelope')

    const nonce = decodeBase64Url(encodedNonce ?? '', NONCE_BYTES)
    const authTag = decodeBase64Url(encodedTag ?? '', AUTH_TAG_BYTES)
    const ciphertext = decodeBase64Url(encodedCiphertext, null)
    const decipher = createDecipheriv('aes-256-gcm', keyFor(keyring, version), nonce)
    decipher.setAAD(aad(version, purpose))
    decipher.setAuthTag(authTag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  } catch (error) {
    if (error instanceof SmtpSecretError) throw error
    throw new SmtpSecretError('SMTP_ENCRYPTED_DATA_UNAVAILABLE')
  }
}
