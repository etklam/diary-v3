import { describe, expect, it } from 'vitest'
import { decryptSmtpSecret, encryptSmtpSecret, environmentSmtpKeyring, SmtpSecretError } from '../../apps/api/src/account-email/secrets.js'

const keyring = {
  activeVersion: 'smtp-k1',
  keys: {
    'smtp-k1': Buffer.alloc(32, 11).toString('base64'),
    'smtp-k2': Buffer.alloc(32, 17).toString('base64'),
  },
}

describe('SMTP authenticated encryption', () => {
  it('does not require deployment keys at module import or keyring read time', () => {
    expect(environmentSmtpKeyring({})).toEqual({ activeVersion: '', keys: {} })
    expect(() => encryptSmtpSecret('secret', 'smtp-password', environmentSmtpKeyring({}))).toThrowError(SmtpSecretError)
  })

  it('uses unique nonces, supports rotated keys, and binds the purpose', () => {
    const first = encryptSmtpSecret('synthetic smtp password', 'smtp-password', keyring)
    const second = encryptSmtpSecret('synthetic smtp password', 'smtp-password', keyring)
    expect(first).not.toBe(second)
    expect(first).toMatch(/^v1\.smtp-k1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u)
    expect(decryptSmtpSecret(first, 'smtp-password', { ...keyring, activeVersion: 'smtp-k2' })).toBe('synthetic smtp password')
    expect(() => decryptSmtpSecret(first, 'other-purpose', keyring)).toThrowError('Encrypted SMTP data is unavailable.')
    expect(() => decryptSmtpSecret(first.replace('.smtp-k1.', '.smtp-k2.'), 'smtp-password', keyring)).toThrowError(SmtpSecretError)
  })

  it('classifies missing decryption keys separately from damaged ciphertext', () => {
    const envelope = encryptSmtpSecret('secret', 'smtp-password', keyring)
    expect(() => decryptSmtpSecret(envelope, 'smtp-password', { activeVersion: 'smtp-k1', keys: {} })).toThrowError('SMTP encryption is unavailable.')
    expect(() => decryptSmtpSecret(`${envelope}x`, 'smtp-password', keyring)).toThrowError('Encrypted SMTP data is unavailable.')
  })

  it('keeps malformed environment values lazy and operation-scoped', () => {
    const keyringFromEnvironment = environmentSmtpKeyring({ SMTP_ENCRYPTION_ACTIVE_KEY: 'smtp-k1', SMTP_ENCRYPTION_KEYS: '{not-json' })
    expect(keyringFromEnvironment).toEqual({ activeVersion: 'smtp-k1', keys: {} })
    expect(() => encryptSmtpSecret('secret', 'smtp-password', keyringFromEnvironment)).toThrowError('SMTP encryption is unavailable.')
  })
})
