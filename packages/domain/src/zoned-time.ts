function getZonedParts(date: Date, timeZone: string) {
  const values = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const part = (type: string) => Number(values.find((item) => item.type === type)?.value)

  const hour = part('hour')
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    // Intl 在 hour12: false 下可能回傳 "24"，需歸零
    hour: hour === 24 ? 0 : hour,
    minute: part('minute'),
    second: part('second'),
  }
}

/**
 * 計算 date 在指定 timezone 的 offset（毫秒）。
 * offset = zoned wall-clock 對應的 UTC instant - date 的 UTC instant。
 */
function getZonedOffsetMs(date: Date, timeZone: string): number {
  const parts = getZonedParts(date, timeZone)
  const utcAtSecond = date.getTime() - date.getUTCMilliseconds()
  return (
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) -
    utcAtSecond
  )
}

/**
 * 把 user-local 的 wall-clock parts（年月日時分秒毫秒）轉成 UTC Date。
 * 用兩段式 offset 驗證處理 DST 跳躍。
 */
export function zonedPartsToUtc(
  parts: {
    year: number
    month: number
    day: number
    hour: number
    minute: number
    second: number
    millisecond: number
  },
  timeZone: string,
): Date {
  const utcGuess = new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond,
    ),
  )
  const offset = getZonedOffsetMs(utcGuess, timeZone)
  const resolved = new Date(utcGuess.getTime() - offset)
  const resolvedOffset = getZonedOffsetMs(resolved, timeZone)
  return new Date(utcGuess.getTime() - resolvedOffset)
}

