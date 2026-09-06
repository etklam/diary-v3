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
    // Intl may return "24" with hour12: false; normalize to 0
    hour: hour === 24 ? 0 : hour,
    minute: part('minute'),
    second: part('second'),
  }
}

/**
 * Compute the offset (ms) of date in the given timezone.
 * offset = UTC instant of the zoned wall-clock - UTC instant of date.
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
 * Convert user-local wall-clock parts (Y/M/D h:m:s.ms) into a UTC Date.
 * Uses a two-pass offset check to handle DST jumps.
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

