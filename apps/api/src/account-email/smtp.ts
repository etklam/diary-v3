import nodemailer from 'nodemailer'
import type { SendMailOptions } from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport'

export type SmtpEncryption = 'tls' | 'starttls' | 'none' | 'implicit-tls' | 'plaintext'

export interface SmtpAuth {
  username: string
  password: string
}

export interface SmtpConfig {
  host: string
  port: number
  encryption: SmtpEncryption
  auth?: SmtpAuth | null
  senderName: string
  senderEmail: string
  replyTo?: string | null
  /** Original DNS name used for TLS SNI when host is a pinned address. */
  tlsServername?: string
  /** Apply one bounded value to connection, greeting, socket and operation timeouts. */
  timeoutMs?: number
  connectionTimeoutMs?: number
  greetingTimeoutMs?: number
  socketTimeoutMs?: number
}

export interface SmtpMessage {
  to: string
  subject: string
  text: string
  html: string
  /** Optional stable RFC 5322 identifier for retry-safe message correlation. */
  messageId?: string
}

export interface SmtpAcceptedMessage {
  accepted: true
  messageId: string | null
}

export interface SmtpTransportClient {
  sendMail(options: SendMailOptions): Promise<SmtpSentMessageInfo>
  close?(): void
}

export interface SmtpSentMessageInfo {
  accepted?: readonly (string | { address?: unknown })[]
  rejected?: readonly (string | { address?: unknown })[]
  rejectedErrors?: readonly unknown[]
  messageId?: unknown
}

export interface SmtpTransportOptions {
  host: string
  port: number
  secure: boolean
  requireTLS?: boolean
  ignoreTLS?: boolean
  auth?: { user: string; pass: string }
  connectionTimeout: number
  greetingTimeout: number
  socketTimeout: number
  dnsTimeout: number
  tls?: {
    rejectUnauthorized: true
    minVersion: 'TLSv1.2'
    servername?: string
  }
}

export type SmtpTransportFactory = (options: SmtpTransportOptions) => SmtpTransportClient

export const SMTP_TIMEOUT_DEFAULTS = Object.freeze({ connection: 10_000, greeting: 10_000, socket: 30_000, dns: 10_000, operation: 30_000 })
export const SMTP_TIMEOUT_MAX_MS = 60_000
const SMTP_MESSAGE_MAX_BYTES = 1_048_576
const SMTP_SUBJECT_MAX_LENGTH = 998
const SMTP_HEADER_MAX_LENGTH = 998
const SMTP_EMAIL_MAX_LENGTH = 320
const SMTP_ENCRYPTION_VALUES = new Set<SmtpEncryption>(['tls', 'starttls', 'none', 'implicit-tls', 'plaintext'])

export type SmtpTransportErrorCode =
  | 'SMTP_CONFIG_INVALID'
  | 'SMTP_PLAINTEXT_AUTH_FORBIDDEN'
  | 'SMTP_MESSAGE_INVALID'
  | 'SMTP_TRANSPORT_CLOSED'
  | 'SMTP_TLS_FAILED'
  | 'SMTP_AUTH_FAILED'
  | 'SMTP_TIMEOUT'
  | 'SMTP_TRANSIENT'
  | 'SMTP_PERMANENT'
  | 'SMTP_RECIPIENT_REJECTED'
  | 'SMTP_UNAVAILABLE'

export class SmtpTransportError extends Error {
  readonly code: SmtpTransportErrorCode
  readonly retryable: boolean
  readonly responseCode: number | null

  constructor(code: SmtpTransportErrorCode, options: { retryable?: boolean; responseCode?: number | null } = {}) {
    super(messageFor(code))
    this.name = 'SmtpTransportError'
    this.code = code
    this.retryable = options.retryable ?? retryableFor(code)
    this.responseCode = options.responseCode ?? null
  }
}

function messageFor(code: SmtpTransportErrorCode): string {
  switch (code) {
    case 'SMTP_CONFIG_INVALID': return 'SMTP configuration is invalid.'
    case 'SMTP_PLAINTEXT_AUTH_FORBIDDEN': return 'SMTP authentication requires encrypted transport.'
    case 'SMTP_MESSAGE_INVALID': return 'SMTP message is invalid.'
    case 'SMTP_TRANSPORT_CLOSED': return 'SMTP transport is closed.'
    case 'SMTP_TLS_FAILED': return 'SMTP TLS negotiation failed.'
    case 'SMTP_AUTH_FAILED': return 'SMTP authentication failed.'
    case 'SMTP_TIMEOUT': return 'SMTP operation timed out.'
    case 'SMTP_TRANSIENT': return 'SMTP service is temporarily unavailable.'
    case 'SMTP_PERMANENT': return 'SMTP service rejected the message.'
    case 'SMTP_RECIPIENT_REJECTED': return 'SMTP recipient was rejected.'
    case 'SMTP_UNAVAILABLE': return 'SMTP service is unavailable.'
  }
}

function retryableFor(code: SmtpTransportErrorCode): boolean {
  return code === 'SMTP_TIMEOUT' || code === 'SMTP_TRANSIENT' || code === 'SMTP_UNAVAILABLE'
}

function configError(code: 'SMTP_CONFIG_INVALID' | 'SMTP_PLAINTEXT_AUTH_FORBIDDEN' = 'SMTP_CONFIG_INVALID'): never {
  throw new SmtpTransportError(code, { retryable: false })
}

function hasHeaderControls(value: string): boolean {
  return /[\r\n]/u.test(value) || value.includes('\u0000')
}

function validMailbox(value: string): boolean {
  return value.length > 0
    && value.length <= SMTP_EMAIL_MAX_LENGTH
    && !hasHeaderControls(value)
    && !/[\s<>(),;:\\[\]]/u.test(value)
    && value.indexOf('@') > 0
    && value.indexOf('@') === value.lastIndexOf('@')
    && value.slice(value.indexOf('@') + 1).length > 0
}

function validHeader(value: string, maxLength = SMTP_HEADER_MAX_LENGTH): boolean {
  return value.length > 0 && value.length <= maxLength && !hasHeaderControls(value)
}

function timeoutValue(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > SMTP_TIMEOUT_MAX_MS) configError()
  return resolved
}

function normalizedEncryption(value: SmtpEncryption): Exclude<SmtpEncryption, 'implicit-tls' | 'plaintext'> {
  if (!SMTP_ENCRYPTION_VALUES.has(value)) configError()
  if (value === 'implicit-tls') return 'tls'
  if (value === 'plaintext') return 'none'
  return value
}

function validateConfig(config: SmtpConfig): Exclude<SmtpEncryption, 'implicit-tls' | 'plaintext'> {
  if (!config || typeof config !== 'object' || typeof config.host !== 'string' || !validHeader(config.host, 253) || /[\s/@]/u.test(config.host)) configError()
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65_535) configError()
  const encryption = normalizedEncryption(config.encryption)
  if (typeof config.senderName !== 'string' || config.senderName.length > SMTP_HEADER_MAX_LENGTH || hasHeaderControls(config.senderName)) configError()
  if (typeof config.senderEmail !== 'string' || !validMailbox(config.senderEmail)) configError()
  if (config.replyTo !== undefined && config.replyTo !== null && !validMailbox(config.replyTo)) configError()
  if (config.tlsServername !== undefined && (typeof config.tlsServername !== 'string' || !validHeader(config.tlsServername, 253) || /[\s/@]/u.test(config.tlsServername))) configError()
  if (config.auth !== undefined && config.auth !== null) {
    if (encryption === 'none') configError('SMTP_PLAINTEXT_AUTH_FORBIDDEN')
    if (typeof config.auth.username !== 'string' || !validHeader(config.auth.username, SMTP_EMAIL_MAX_LENGTH) || typeof config.auth.password !== 'string' || config.auth.password.length === 0) configError()
    if (hasHeaderControls(config.auth.password)) configError()
  }
  return encryption
}

export function buildSmtpTransportOptions(config: SmtpConfig): SmtpTransportOptions {
  const encryption = validateConfig(config)
  const connectionTimeout = timeoutValue(config.connectionTimeoutMs ?? config.timeoutMs, SMTP_TIMEOUT_DEFAULTS.connection)
  const greetingTimeout = timeoutValue(config.greetingTimeoutMs ?? config.timeoutMs, SMTP_TIMEOUT_DEFAULTS.greeting)
  const socketTimeout = timeoutValue(config.socketTimeoutMs ?? config.timeoutMs, SMTP_TIMEOUT_DEFAULTS.socket)
  const options: SmtpTransportOptions = {
    host: config.host,
    port: config.port,
    secure: encryption === 'tls',
    connectionTimeout,
    greetingTimeout,
    socketTimeout,
    dnsTimeout: Math.min(connectionTimeout, SMTP_TIMEOUT_MAX_MS),
  }
  if (encryption === 'starttls') {
    options.requireTLS = true
    options.tls = { rejectUnauthorized: true, minVersion: 'TLSv1.2', ...(config.tlsServername ? { servername: config.tlsServername } : {}) }
  } else if (encryption === 'tls') {
    options.tls = { rejectUnauthorized: true, minVersion: 'TLSv1.2', ...(config.tlsServername ? { servername: config.tlsServername } : {}) }
  } else {
    options.ignoreTLS = true
  }
  if (config.auth !== undefined && config.auth !== null) options.auth = { user: config.auth.username, pass: config.auth.password }
  return options
}

const createNodemailerClient: SmtpTransportFactory = options => nodemailer.createTransport(options as SMTPTransport.Options)
export { createNodemailerClient }

function stringCode(error: unknown): string {
  if (!error || typeof error !== 'object') return ''
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code.toUpperCase() : ''
}

function responseCode(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null
  const value = (error as { responseCode?: unknown }).responseCode
  return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599 ? value : null
}

function errorText(error: unknown): string {
  if (!error || typeof error !== 'object') return ''
  const value = (error as { message?: unknown }).message
  return typeof value === 'string' ? value.toLowerCase() : ''
}

export function classifySmtpError(error: unknown): SmtpTransportError {
  if (error instanceof SmtpTransportError) return error
  const code = stringCode(error)
  const status = responseCode(error)
  const text = errorText(error)
  if (code === 'EAUTH' || status === 530 || status === 534 || status === 535) return new SmtpTransportError('SMTP_AUTH_FAILED', { responseCode: status })
  if (['CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_TLS_CERT_ALTNAME_INVALID', 'ERR_TLS_CERT_SIGNATURE_ALGORITHM_UNSUPPORTED', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(code) || /\b(?:tls|certificate|cert)\b.*\b(?:error|fail|invalid|verify|reject)/u.test(text)) return new SmtpTransportError('SMTP_TLS_FAILED', { responseCode: status })
  if (['ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ERR_SOCKET_TIMEOUT', 'ETIME'].includes(code) || /timed? ?out|timeout/u.test(text)) return new SmtpTransportError('SMTP_TIMEOUT', { responseCode: status })
  if (status !== null && status >= 400 && status < 500) return new SmtpTransportError('SMTP_TRANSIENT', { responseCode: status })
  if (status !== null && status >= 500) return new SmtpTransportError('SMTP_PERMANENT', { responseCode: status })
  if (['ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH', 'ECONNABORTED'].includes(code)) return new SmtpTransportError('SMTP_TRANSIENT', { responseCode: status })
  return new SmtpTransportError('SMTP_UNAVAILABLE', { responseCode: status })
}

function messageIsAccepted(info: SmtpSentMessageInfo, recipient: string): boolean {
  if (!info || typeof info !== 'object') return false
  const accepted = (info as { accepted?: unknown }).accepted
  if (!Array.isArray(accepted)) return false
  return accepted.some(value => {
    const address = typeof value === 'string' ? value : value && typeof value === 'object' && typeof value.address === 'string' ? value.address : null
    return address?.toLowerCase() === recipient.toLowerCase()
  })
}

function operationTimeout(config: SmtpConfig): number {
  const configured = config.timeoutMs
  if (configured !== undefined) return timeoutValue(configured, SMTP_TIMEOUT_DEFAULTS.operation)
  return Math.max(
    timeoutValue(config.connectionTimeoutMs, SMTP_TIMEOUT_DEFAULTS.connection),
    timeoutValue(config.greetingTimeoutMs, SMTP_TIMEOUT_DEFAULTS.greeting),
    timeoutValue(config.socketTimeoutMs, SMTP_TIMEOUT_DEFAULTS.socket),
  )
}

function sendWithTimeout(client: SmtpTransportClient, options: SendMailOptions, timeoutMs: number): Promise<SmtpSentMessageInfo> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const send = Promise.resolve().then(() => client.sendMail(options))
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      client.close?.()
      reject(new SmtpTransportError('SMTP_TIMEOUT'))
    }, timeoutMs)
    timer.unref?.()
  })
  return Promise.race([send, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

export interface SmtpSender {
  send(message: SmtpMessage): Promise<SmtpAcceptedMessage>
  close(): void
}

export function createSmtpTransport(config: SmtpConfig, factory: SmtpTransportFactory = createNodemailerClient): SmtpSender {
  const transportOptions = buildSmtpTransportOptions(config)
  let client: SmtpTransportClient
  try {
    client = factory(transportOptions)
  } catch (error) {
    throw classifySmtpError(error)
  }
  let closed = false

  return {
    async send(message: SmtpMessage): Promise<SmtpAcceptedMessage> {
      if (closed) throw new SmtpTransportError('SMTP_TRANSPORT_CLOSED', { retryable: false })
      if (!message || typeof message !== 'object' || typeof message.to !== 'string' || !validMailbox(message.to) || typeof message.subject !== 'string' || !validHeader(message.subject, SMTP_SUBJECT_MAX_LENGTH) || typeof message.text !== 'string' || typeof message.html !== 'string' || message.text.length === 0 || message.html.length === 0 || Buffer.byteLength(message.text, 'utf8') > SMTP_MESSAGE_MAX_BYTES || Buffer.byteLength(message.html, 'utf8') > SMTP_MESSAGE_MAX_BYTES || (message.messageId !== undefined && (!validHeader(message.messageId, SMTP_HEADER_MAX_LENGTH) || !/^<[A-Za-z0-9_-]+@[A-Za-z0-9.-]+>$/u.test(message.messageId)))) throw new SmtpTransportError('SMTP_MESSAGE_INVALID', { retryable: false })
      const mail: SendMailOptions = {
        from: { name: config.senderName, address: config.senderEmail },
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      }
      if (config.replyTo) mail.replyTo = config.replyTo
      if (message.messageId) mail.messageId = message.messageId
      try {
        const info = await sendWithTimeout(client, mail, operationTimeout(config))
        if (!messageIsAccepted(info, message.to)) {
          const rejectedError = (info as { rejectedErrors?: unknown }).rejectedErrors
          throw classifySmtpError(Array.isArray(rejectedError) ? rejectedError[0] : new Error('SMTP recipient rejected'))
        }
        const messageId = typeof (info as { messageId?: unknown }).messageId === 'string' && (info as { messageId: string }).messageId.length <= SMTP_HEADER_MAX_LENGTH
          ? (info as { messageId: string }).messageId
          : null
        return { accepted: true, messageId }
      } catch (error) {
        throw classifySmtpError(error)
      }
    },
    close(): void {
      if (closed) return
      closed = true
      client.close?.()
    },
  }
}

export async function sendSmtpMessage(config: SmtpConfig, message: SmtpMessage, factory: SmtpTransportFactory = createNodemailerClient): Promise<SmtpAcceptedMessage> {
  const sender = createSmtpTransport(config, factory)
  try {
    return await sender.send(message)
  } finally {
    sender.close()
  }
}
