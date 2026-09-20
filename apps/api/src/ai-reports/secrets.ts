import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

export interface AiKeyring { activeVersion: string; keys: Record<string, string> }
function environmentKeyring(): AiKeyring {
  try {
    return { activeVersion: process.env.AI_ENCRYPTION_ACTIVE_KEY ?? '', keys: JSON.parse(process.env.AI_ENCRYPTION_KEYS ?? '{}') as Record<string, string> }
  } catch { throw new Error('AI encryption configuration unavailable') }
}
function keyFor(keyring: AiKeyring, version: string) {
  const encoded = keyring.keys[version]
  if (!encoded || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new Error('AI encryption configuration unavailable')
  const key = Buffer.from(encoded, 'base64')
  if (key.length !== 32) throw new Error('AI encryption configuration unavailable')
  return key
}
export function encryptAiSecret(plaintext: string, purpose: string, keyring = environmentKeyring()): string {
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(keyring.activeVersion)) throw new Error('AI encryption configuration unavailable')
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyFor(keyring, keyring.activeVersion), nonce)
  cipher.setAAD(Buffer.from(`diary-ai:v1:${keyring.activeVersion}:${purpose}`))
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return ['v1', keyring.activeVersion, nonce.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.')
}
export function decryptAiSecret(envelope: string, purpose: string, keyring = environmentKeyring()): string {
  try {
    const parts = envelope.split('.')
    const [format, version, nonce, tag, ciphertext] = parts
    if (parts.length !== 5 || format !== 'v1' || !version || !nonce || !tag || ciphertext === undefined) throw new Error()
    const iv = Buffer.from(nonce, 'base64url'), authTag = Buffer.from(tag, 'base64url')
    if (iv.length !== 12 || authTag.length !== 16) throw new Error()
    const decipher = createDecipheriv('aes-256-gcm', keyFor(keyring, version), iv)
    decipher.setAAD(Buffer.from(`diary-ai:v1:${version}:${purpose}`))
    decipher.setAuthTag(authTag)
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8')
  } catch { throw new Error('AI encrypted data unavailable') }
}
