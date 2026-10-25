import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { defineCopy } from '../../apps/web/app/locale-copy'

// Locale copy is the largest hand-maintained set in the codebase. TypeScript
// already rejects reading a key one locale lacks; these pin the other
// direction — unread keys, extra keys, and locales that silently fall back.

function runCheck(): { code: number; output: string } {
  try {
    const output = execFileSync('node', ['scripts/check-locale-parity.mjs'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, output }
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string }
    return { code: failure.status ?? 1, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` }
  }
}

describe('locale copy parity', () => {
  it('passes on the committed tree, over a non-trivial number of objects', () => {
    const { code, output } = runCheck()
    expect(output).toMatch(/locale copy objects checked across \d+ files/)
    // A check that silently stopped finding objects would also "pass".
    const checked = Number(/^(\d+) locale copy objects/m.exec(output)?.[1] ?? 0)
    expect(checked).toBeGreaterThan(100)
    expect(code).toBe(0)
  })

  it('runs inside design:check, not only by hand', () => {
    const scripts = (JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> }).scripts
    expect(scripts['design:check']).toContain('check-locale-parity.mjs')
  })

  it('keeps zh-TW authoritative, matching the default locale', () => {
    const script = readFileSync('scripts/check-locale-parity.mjs', 'utf8')
    expect(script).toContain("const BASE_LOCALE = 'zh-TW'")
    const helper = readFileSync('apps/web/app/locale-copy.ts', 'utf8')
    expect(helper).toContain("'zh-TW': base")
  })

  it('does not treat a shared value as a translation defect', () => {
    // zh-TW and zh-CN legitimately share phrases, and tickers, units and brand
    // names can legitimately match English. Key-set parity cannot establish
    // translation quality and must not pretend to.
    const copy = defineCopy(
      { unit: 'USD', label: '標籤' },
      {
        'zh-CN': { unit: 'USD', label: '标签' },
        en: { unit: 'USD', label: 'Label' },
      },
    )
    expect(copy['zh-TW'].unit).toBe('USD')
    expect(copy.en.unit).toBe('USD')
    expect(runCheck().code).toBe(0)
  })

  it('preserves non-string value shapes through the helper', () => {
    const copy = defineCopy(
      { items: ['一', '二'], nested: { deep: '深' }, format: (value: number) => `${value} 次` },
      {
        'zh-CN': { items: ['一', '二'], nested: { deep: '深' }, format: (value: number) => `${value} 次` },
        en: { items: ['one', 'two'], nested: { deep: 'deep' }, format: (value: number) => `${value} times` },
      },
    )
    expect(copy.en.items).toEqual(['one', 'two'])
    expect(copy['zh-TW'].nested.deep).toBe('深')
    expect(copy.en.format(3)).toBe('3 times')
  })

  it('carries the migrated surfaces and leaves the rest to the script', () => {
    for (const file of ['apps/web/app/diary-copy.ts', 'apps/web/app/quick-copy.ts']) {
      expect(readFileSync(file, 'utf8')).toContain('defineCopy(')
    }
  })
})
