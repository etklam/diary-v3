import { describe, expect, it } from 'vitest'
import { resolveEffectivePortfolio, type AmendmentSource } from '../../apps/api/src/institutional/effective-snapshots.js'

function source(accession: string, holdings: string[], number: number | null = null, type: string | null = null): AmendmentSource<string> {
  return { accession, holdings, form: number === null ? '13F-HR' : '13F-HR/A', isAmendment: number !== null,
    amendmentNumber: number, amendmentType: type, status: 'READY', filedAt: '2026-08-14T00:00:00Z' }
}

describe('effective 13F amendment resolution', () => {
  it('applies numbered amendments independently of discovery or filed-date order and preserves repeated source disclosures', () => {
    const original = source('original', ['original-row'])
    const firstAdd = source('add-1', ['same-security'], 1, 'NEW HOLDINGS')
    const restatement = source('restate-2', ['replaced-row', 'same-security'], 2, 'RESTATEMENT')
    const lastAdd = source('add-3', ['same-security'], 3, 'ADD_NEW_HOLDINGS')
    lastAdd.filedAt = '2026-08-01T00:00:00Z'
    const result = resolveEffectivePortfolio([lastAdd, firstAdd, original, restatement])
    expect(result.status).toBe('READY')
    if (result.status !== 'READY') throw new Error('Expected complete amendments')
    expect(result.holdings).toEqual(['replaced-row', 'same-security', 'same-security'])
    expect(result.lineage.map(row => [row.source.accession, row.operation])).toEqual([
      ['original', 'ORIGINAL'], ['add-1', 'ADD_NEW_HOLDINGS'], ['restate-2', 'RESTATEMENT'], ['add-3', 'ADD_NEW_HOLDINGS'],
    ])
    expect(resolveEffectivePortfolio([original, restatement, lastAdd, firstAdd])).toEqual(result)
    expect(original.holdings).toEqual(['original-row'])
  })

  it('appends additional holdings without overwriting prior rows and permits an empty full restatement', () => {
    const original = source('original', ['same-security'])
    expect(resolveEffectivePortfolio([original, source('add', ['same-security'], 1, 'NEW HOLDINGS')]))
      .toMatchObject({ status: 'READY', holdings: ['same-security', 'same-security'] })
    expect(resolveEffectivePortfolio([original, source('restate', [], 1, 'RESTATEMENT')]))
      .toMatchObject({ status: 'READY', holdings: [] })
  })

  it.each([null, 0, -1, 1.5, Number.NaN, 2147483648])('rejects missing or invalid amendment number %s', number => {
    const amendment = { ...source('amendment', [], 1, 'RESTATEMENT'), amendmentNumber: number }
    expect(resolveEffectivePortfolio([source('original', ['keep']), amendment])).toMatchObject({ status: 'PARTIAL', reason: 'AMENDMENT_METADATA_INVALID' })
  })

  it.each([null, '', 'UNKNOWN', 'REPLACE', 'restatement', 'NEW HOLDINGS EXTRA'])('rejects unknown amendment type %s without heuristics', type => {
    expect(resolveEffectivePortfolio([source('original', ['keep']), source('amendment', [], 1, type)]))
      .toMatchObject({ status: 'PARTIAL', reason: 'AMENDMENT_METADATA_INVALID' })
  })

  it('rejects duplicate numbers, missing sequence entries, missing/ambiguous originals and inconsistent forms', () => {
    const original = source('original', ['keep'])
    expect(resolveEffectivePortfolio([original, source('a', [], 1, 'RESTATEMENT'), source('b', [], 1, 'NEW HOLDINGS')]))
      .toMatchObject({ status: 'PARTIAL', reason: 'AMENDMENT_NUMBER_DUPLICATE' })
    expect(resolveEffectivePortfolio([original, source('second', [], 2, 'RESTATEMENT')]))
      .toMatchObject({ status: 'PARTIAL', reason: 'AMENDMENT_SEQUENCE_INCOMPLETE' })
    expect(resolveEffectivePortfolio([source('second', [], 1, 'RESTATEMENT')])).toMatchObject({ status: 'PARTIAL', reason: 'ORIGINAL_MISSING' })
    expect(resolveEffectivePortfolio([original, source('other-original', [])])).toMatchObject({ status: 'PARTIAL', reason: 'ORIGINAL_AMBIGUOUS' })
    expect(resolveEffectivePortfolio([{ ...original, form: '13F-HR/A' }])).toMatchObject({ status: 'PARTIAL', reason: 'FILING_FORM_MISMATCH' })
  })

  it.each(['PENDING', 'DOWNLOADED', 'PARSED', 'PARTIAL', 'SUPERSEDED', 'ERROR'])('blocks incomplete source state %s before inferring removals', status => {
    const result = resolveEffectivePortfolio([source('original', ['keep']), { ...source('amendment', [], 1, 'RESTATEMENT'), status }])
    expect(result).toEqual({ status: status === 'ERROR' ? 'ERROR' : 'PARTIAL', reason: 'FILING_NOT_READY' })
    expect(result).not.toHaveProperty('holdings')
  })
})
