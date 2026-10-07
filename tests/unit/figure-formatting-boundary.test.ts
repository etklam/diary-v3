import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// Ticket 101: every judged figure goes through apps/web/app/market-display.ts.
// This is the regression guard for that, because the property that broke was not
// any single page's output — it was that each page grew its own formatter. A unit
// test of the formatters cannot catch a new page reaching for Intl directly.

const appRoot = join(import.meta.dirname, '../../apps/web/app')
const boundary = 'market-display.ts'

/**
 * Surfaces allowed to format numbers themselves, each for a reason that is not
 * "a figure in the interface". Adding to this list is a design decision: it means
 * asserting the value is not a money, quantity or percentage figure a reader judges.
 */
const allowed = new Map([
  // Chart axis labels are deliberately compact ("1.2M") so an axis stays legible.
  ['performance-chart.tsx', 'compact chart axis labels'],
  // Bytes are not money; KB/MB is their own unit with its own convention.
  ['routes/sec-filing-detail.tsx', 'file sizes in KB/MB'],
  // SVG geometry, not a displayed figure.
  ['routes/market-rotation.tsx', 'SVG path coordinates'],
  // Builds a request payload for the API, not display text.
  ['routes/position-sizing.tsx', 'form value sent to the API'],
  // Years to financial independence is neither money nor a percentage.
  ['routes/fire.tsx', 'years to freedom at one decimal'],
  // Result counts inside translated sentences.
  ['guru-intelligence-copy.ts', 'counts inside translated copy'],
])

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/u.test(entry) ? [path] : []
  })
}

describe('figure formatting boundary', () => {
  it('keeps every judged figure inside the display module', () => {
    const offenders: string[] = []
    for (const path of sourceFiles(appRoot)) {
      const name = relative(appRoot, path)
      if (name === boundary || allowed.has(name)) continue
      const source = readFileSync(path, 'utf8')
      if (/Intl\.NumberFormat/u.test(source)) offenders.push(`${name}: Intl.NumberFormat`)
      if (/\.toFixed\(/u.test(source)) offenders.push(`${name}: toFixed`)
      if (/\.toLocaleString\(/u.test(source)) offenders.push(`${name}: toLocaleString`)
    }
    expect(offenders).toEqual([])
  })

  it('names a reason for every surface exempted from the boundary', () => {
    for (const [name, reason] of allowed) {
      expect(reason.length, name).toBeGreaterThan(0)
      // An exemption that no longer formats anything should be deleted, not kept.
      const source = readFileSync(join(appRoot, name), 'utf8')
      expect(/Intl\.NumberFormat|\.toFixed\(|\.toLocaleString\(/u.test(source), name).toBe(true)
    }
  })
})
