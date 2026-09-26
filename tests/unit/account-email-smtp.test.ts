import { describe, expect, it, vi } from 'vitest'
import { buildSmtpTransportOptions, classifySmtpError, createSmtpTransport, SmtpTransportError, type SmtpConfig, type SmtpTransportClient } from '../../apps/api/src/account-email/smtp.js'

const config: SmtpConfig = {
  host: 'smtp.example.test',
  port: 587,
  encryption: 'starttls',
  auth: { username: 'mailer@example.test', password: 'synthetic-password' },
  senderName: 'Diary',
  senderEmail: 'no-reply@example.test',
  replyTo: 'support@example.test',
  tlsServername: 'smtp.example.test',
  timeoutMs: 2_000,
}

function fakeClient(sendMail: SmtpTransportClient['sendMail']): SmtpTransportClient {
  return { sendMail, close: vi.fn() }
}

describe('SMTP transport boundary', () => {
  it('configures required STARTTLS certificate validation and sends a fixed sender with both bodies', async () => {
    let options: unknown
    let sent: unknown
    const client = fakeClient(async mail => {
      sent = mail
      return { accepted: ['recipient@example.test'], rejected: [], messageId: '<synthetic-message@example.test>' }
    })
    const sender = createSmtpTransport(config, nextOptions => {
      options = nextOptions
      return client
    })

    await expect(sender.send({ to: 'recipient@example.test', subject: 'Verify your account', text: 'Plain text body', html: '<p>HTML body</p>' })).resolves.toEqual({ accepted: true, messageId: '<synthetic-message@example.test>' })
    expect(options).toMatchObject({
      host: 'smtp.example.test', port: 587, secure: false, requireTLS: true,
      connectionTimeout: 2_000, greetingTimeout: 2_000, socketTimeout: 2_000,
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2', servername: 'smtp.example.test' },
      auth: { user: 'mailer@example.test', pass: 'synthetic-password' },
    })
    expect(sent).toEqual({
      from: { name: 'Diary', address: 'no-reply@example.test' },
      to: 'recipient@example.test',
      replyTo: 'support@example.test',
      subject: 'Verify your account',
      text: 'Plain text body',
      html: '<p>HTML body</p>',
    })
    sender.close()
  })

  it('uses implicit TLS and never puts authentication on plaintext', () => {
    expect(buildSmtpTransportOptions({ ...config, encryption: 'tls' })).toMatchObject({ secure: true, tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' } })
    expect(() => buildSmtpTransportOptions({ ...config, encryption: 'none' })).toThrowError(SmtpTransportError)
    expect(() => buildSmtpTransportOptions({ ...config, encryption: 'none', auth: null })).not.toThrow()
    expect(buildSmtpTransportOptions({ ...config, encryption: 'none', auth: null })).toMatchObject({ secure: false, ignoreTLS: true })
  })

  it('rejects header injection and reports sanitized classifications', async () => {
    expect(() => buildSmtpTransportOptions({ ...config, senderEmail: 'sender@example.test\r\nBcc: attacker@example.test' })).toThrowError('SMTP configuration is invalid.')
    const client = fakeClient(async () => { throw Object.assign(new Error('provider secret must never escape'), { code: 'EAUTH', response: '535 secret details', responseCode: 535 }) })
    const sender = createSmtpTransport(config, () => client)
    await expect(sender.send({ to: 'recipient@example.test', subject: 'Subject', text: 'text', html: '<p>html</p>' })).rejects.toMatchObject({ code: 'SMTP_AUTH_FAILED', retryable: false, responseCode: 535, message: 'SMTP authentication failed.' })
    await expect(sender.send({ to: 'recipient@example.test\nBcc: attacker@example.test', subject: 'Subject', text: 'text', html: '<p>html</p>' })).rejects.toMatchObject({ code: 'SMTP_MESSAGE_INVALID' })
    expect(classifySmtpError(Object.assign(new Error('certificate details'), { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' }))).toMatchObject({ code: 'SMTP_TLS_FAILED', retryable: false })
  })

  it('maps transient, permanent, and timeout failures without exposing provider text', async () => {
    for (const [error, expected] of [
      [Object.assign(new Error('temporary provider secret'), { responseCode: 451 }), 'SMTP_TRANSIENT'],
      [Object.assign(new Error('permanent provider secret'), { responseCode: 550 }), 'SMTP_PERMANENT'],
      [Object.assign(new Error('timeout provider secret'), { code: 'ETIMEDOUT' }), 'SMTP_TIMEOUT'],
    ] as const) {
      const sender = createSmtpTransport(config, () => fakeClient(async () => { throw error }))
      await expect(sender.send({ to: 'recipient@example.test', subject: 'Subject', text: 'text', html: '<p>html</p>' })).rejects.toMatchObject({ code: expected })
      await expect(sender.send({ to: 'recipient@example.test', subject: 'Subject', text: 'text', html: '<p>html</p>' })).rejects.not.toThrow(error.message)
    }
  })

  it('enforces the overall timeout and closes a timed-out client', async () => {
    const close = vi.fn()
    const client = { sendMail: vi.fn(() => new Promise<never>(() => undefined)), close }
    const sender = createSmtpTransport({ ...config, timeoutMs: 10 }, () => client)
    await expect(sender.send({ to: 'recipient@example.test', subject: 'Subject', text: 'text', html: '<p>html</p>' })).rejects.toMatchObject({ code: 'SMTP_TIMEOUT', retryable: true })
    expect(close).toHaveBeenCalledTimes(1)
  })
})
