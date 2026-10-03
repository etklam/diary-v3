import { mailSettings } from '@diary/db'
import { decryptSmtpSecret, encryptSmtpSecret, environmentSmtpKeyring, type SmtpKeyring } from './secrets.js'
import { resolveSmtpHost } from './smtp-host.js'
import { sendSmtpMessage, type SmtpConfig, type SmtpMessage, type SmtpTransportFactory } from './smtp.js'

export type SmtpSettingsRow = typeof mailSettings.$inferSelect

export type EncryptedMailPayload = SmtpMessage

export interface SmtpRuntimeOptions {
  keyring?: SmtpKeyring
  lookup?: (hostname: string) => Promise<string[]>
  allowedPrivateHosts?: string
}

export function sealMailPayload(payload: EncryptedMailPayload, keyring = environmentSmtpKeyring()): string {
  return encryptSmtpSecret(JSON.stringify(payload), 'outbox-payload', keyring)
}

export function openMailPayload(envelope: string, keyring = environmentSmtpKeyring()): EncryptedMailPayload {
  let decoded: unknown
  try {
    decoded = JSON.parse(decryptSmtpSecret(envelope, 'outbox-payload', keyring))
  } catch {
    throw new Error('SMTP_OUTBOX_PAYLOAD_UNAVAILABLE')
  }
  if (!decoded || typeof decoded !== 'object') throw new Error('SMTP_OUTBOX_PAYLOAD_UNAVAILABLE')
  const value = decoded as Record<string, unknown>
  if (typeof value.to !== 'string' || typeof value.subject !== 'string' || typeof value.text !== 'string' || typeof value.html !== 'string') {
    throw new Error('SMTP_OUTBOX_PAYLOAD_UNAVAILABLE')
  }
  return { to: value.to, subject: value.subject, text: value.text, html: value.html }
}

export async function smtpConfigForSettings(row: SmtpSettingsRow, options: SmtpRuntimeOptions = {}): Promise<SmtpConfig> {
  if (!row.host || !row.port || !row.security || !row.senderName || !row.senderEmail) throw new Error('ADMIN_EMAIL_SETTINGS_INVALID')
  if (row.security === 'none') throw new Error('ADMIN_EMAIL_SETTINGS_INVALID')
  const resolved = await resolveSmtpHost(row.host, row.port, {
    ...(options.lookup ? { lookup: options.lookup } : {}),
    ...(options.allowedPrivateHosts !== undefined ? { allowedPrivateHosts: options.allowedPrivateHosts } : {}),
  })
  let auth: SmtpConfig['auth']
  if (row.auth === 'password') {
    if (!row.username || !row.encryptedPassword) throw new Error('ADMIN_EMAIL_SETTINGS_INVALID')
    auth = {
      username: row.username,
      password: decryptSmtpSecret(row.encryptedPassword, 'smtp-password', options.keyring ?? environmentSmtpKeyring()),
    }
  }
  return {
    host: resolved.host,
    tlsServername: resolved.tlsServername,
    port: row.port,
    encryption: row.security,
    ...(auth ? { auth } : {}),
    senderName: row.senderName,
    senderEmail: row.senderEmail,
    ...(row.replyToEmail ? { replyTo: row.replyToEmail } : {}),
  }
}

export async function sendConfiguredMail(
  row: SmtpSettingsRow,
  message: SmtpMessage,
  options: SmtpRuntimeOptions & { transportFactory?: SmtpTransportFactory } = {},
) {
  return sendSmtpMessage(await smtpConfigForSettings(row, options), message, options.transportFactory)
}
