import { resolve4 } from 'node:dns/promises'
import { domainToASCII } from 'node:url'

function ipv4Parts(address: string): number[] | undefined {
  const parts = address.split('.').map(Number)
  return parts.length === 4 && parts.every(part => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : undefined
}

function inRange(parts: number[], first: number[], prefix: number) {
  const wholeBytes = Math.floor(prefix / 8)
  for (let index = 0; index < wholeBytes; index++) if (parts[index] !== first[index]) return false
  const remainingBits = prefix % 8
  return remainingBits === 0 || (parts[wholeBytes]! >> (8 - remainingBits)) === (first[wholeBytes]! >> (8 - remainingBits))
}

export function isPublicSmtpIpv4(address: string): boolean {
  const parts = ipv4Parts(address)
  if (!parts) return false
  return ![
    [[0, 0, 0, 0], 8], [[10, 0, 0, 0], 8], [[100, 64, 0, 0], 10], [[127, 0, 0, 0], 8],
    [[169, 254, 0, 0], 16], [[172, 16, 0, 0], 12], [[192, 0, 0, 0], 24], [[192, 0, 2, 0], 24],
    [[192, 88, 99, 0], 24], [[192, 168, 0, 0], 16], [[198, 18, 0, 0], 15], [[198, 51, 100, 0], 24],
    [[203, 0, 113, 0], 24], [[224, 0, 0, 0], 3],
  ].some(([network, prefix]) => inRange(parts, network as number[], prefix as number))
}

export function normalizeSmtpHostname(host: string): string {
  if (host !== host.trim() || host.length === 0 || /[:/@\\\s]/u.test(host) || host.includes('[') || host.includes(']')) throw new Error('ADMIN_EMAIL_SETTINGS_INVALID')
  const ascii = domainToASCII(host.replace(/\.$/, '')).toLowerCase()
  if (!ascii || ascii.length > 253 || ascii.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw new Error('ADMIN_EMAIL_SETTINGS_INVALID')
  }
  return ascii
}

/** Resolve and pin public IPv4 before SMTP connects; private relays require an exact host:port allow entry. */
export async function resolveSmtpHost(host: string, port: number, options: {
  lookup?: (hostname: string) => Promise<string[]>
  allowedPrivateHosts?: string
} = {}): Promise<{ host: string; tlsServername: string }> {
  const hostname = normalizeSmtpHostname(host)
  const allowed = new Set((options.allowedPrivateHosts ?? process.env.SMTP_ALLOWED_HOSTS ?? '')
    .split(',').map(value => value.trim().toLowerCase()).filter(Boolean))
  const privateAllowed = allowed.has(`${hostname}:${port}`)
  const addresses = await (options.lookup ?? (name => resolve4(name)))(hostname)
  if (addresses.length === 0 || addresses.some(address => !ipv4Parts(address) || (!isPublicSmtpIpv4(address) && !privateAllowed))) {
    throw new Error('ADMIN_EMAIL_SETTINGS_INVALID')
  }
  return { host: addresses[0]!, tlsServername: hostname }
}
