export function resolveAccountRecoverySupportUrl(value: string | undefined): string | null {
  const candidate = value?.trim()
  if (!candidate || candidate.length > 2048 || [...candidate].some(character => {
    const code = character.charCodeAt(0)
    return code < 0x20 || code === 0x7f
  })) return null

  if (/^mailto:/iu.test(candidate)) {
    return /^mailto:[a-z0-9._+-]+@[a-z0-9.-]+$/iu.test(candidate) ? candidate : null
  }

  try {
    const url = new URL(candidate)
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null
    return url.toString()
  } catch {
    return null
  }
}
