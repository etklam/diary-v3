export type DiarySearchMatchSource = 'title' | 'content' | 'thesis' | 'risk' | 'execution' | 'tag' | 'symbol'

export type DiarySearchSnippet = {
  source: DiarySearchMatchSource
  text: string
  matchStart: number
  matchEnd: number
}

function lowerWithOffsets(value: string) {
  let text = ''
  const starts: number[] = []
  const ends: number[] = []
  let originalOffset = 0
  for (const character of value) {
    const start = originalOffset
    originalOffset += character.length
    const lowered = character.toLocaleLowerCase()
    text += lowered
    for (let index = 0; index < lowered.length; index++) {
      starts.push(start)
      ends.push(originalOffset)
    }
  }
  return { text, starts, ends }
}

function safeStart(value: string, offset: number) {
  return offset > 0 && offset < value.length && (value.charCodeAt(offset) & 0xfc00) === 0xdc00 ? offset - 1 : offset
}

function safeEnd(value: string, offset: number) {
  return offset > 0 && offset < value.length && (value.charCodeAt(offset - 1) & 0xfc00) === 0xd800 && (value.charCodeAt(offset) & 0xfc00) === 0xdc00 ? offset + 1 : offset
}

/**
 * Return the first bounded substring match in field priority order. Offsets
 * are relative to the returned snippet so the Web client can render text
 * safely without HTML interpolation.
 */
export function diarySearchSnippet(fields: Array<{ source: DiarySearchMatchSource; value: string | null | undefined }>, query: string, maxLength = 240): DiarySearchSnippet | null {
  const needle = lowerWithOffsets(query.trim()).text
  if (!needle || maxLength < 1) return null
  for (const field of fields) {
    const value = field.value
    if (!value) continue
    const lowered = lowerWithOffsets(value)
    const normalizedStart = lowered.text.indexOf(needle)
    if (normalizedStart < 0) continue
    const normalizedEnd = normalizedStart + needle.length
    const matchStart = lowered.starts[normalizedStart] ?? 0
    const matchEnd = lowered.ends[normalizedEnd - 1] ?? matchStart
    const matchLength = matchEnd - matchStart
    const boundedLength = Math.max(maxLength, matchLength)
    if (value.length <= boundedLength) return { source: field.source, text: value, matchStart, matchEnd }
    const contextBudget = boundedLength - matchLength
    let before = Math.min(Math.floor(contextBudget / 2), matchStart)
    let after = Math.min(contextBudget - before, value.length - matchEnd)
    const remaining = contextBudget - before - after
    if (remaining > 0) before += Math.min(remaining, matchStart - before)
    if (before + after < contextBudget) after += Math.min(contextBudget - before - after, value.length - matchEnd - after)
    const start = safeStart(value, matchStart - before)
    const end = safeEnd(value, matchEnd + after)
    const prefix = start > 0 ? '…' : ''
    const suffix = end < value.length ? '…' : ''
    return { source: field.source, text: `${prefix}${value.slice(start, end)}${suffix}`, matchStart: prefix.length + matchStart - start, matchEnd: prefix.length + matchEnd - start }
  }
  return null
}
