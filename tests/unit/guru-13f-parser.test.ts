import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  parse13fAmendmentMetadata,
  parse13fInformationTable,
  reportedValueUnitForFiledDate,
} from '../../apps/api/src/institutional/13f-parser.js'

const historicalXml = await readFile(new URL('../fixtures/guru-13f/historical-information-table.xml', import.meta.url), 'utf8')
const currentXml = await readFile(new URL('../fixtures/guru-13f/current-information-table.xml', import.meta.url), 'utf8')

describe('13F information-table parser', () => {
  it('keeps valid rows when one row is malformed and preserves identity and voting fields', () => {
    const parsed = parse13fInformationTable(historicalXml, { filedDate: '2022-11-14' })

    expect(parsed).toMatchObject({ isInformationTable: true, rejectedRows: 1 })
    expect(parsed.holdings).toHaveLength(2)
    expect(parsed.holdings[0]).toMatchObject({
      rowNumber: 1,
      issuer: 'Synthetic & Example Holdings',
      titleOfClass: 'COM',
      cusip: '123456789',
      figi: 'BBG000000001',
      reportedValue: '102030',
      reportedValueUnit: 'THOUSANDS_USD',
      quantity: '1000',
      quantityType: 'SH',
      investmentDiscretion: 'SOLE',
      otherManagers: ['01'],
      votingAuthority: { sole: '1000', shared: '0', none: '0' },
    })
    expect(parsed.holdings[1]).toMatchObject({
      rowNumber: 3,
      quantityType: 'PRN',
      putCall: 'PUT',
      cusip: null,
      warnings: ['CUSIP_MISSING'],
      votingAuthority: { sole: '0', shared: '0', none: '500' },
    })
  })

  it('uses the current Form 13F value unit while preserving the reported amount verbatim', () => {
    const parsed = parse13fInformationTable(currentXml, { filedDate: '2023-01-03' })

    expect(reportedValueUnitForFiledDate('2023-01-02')).toBe('THOUSANDS_USD')
    expect(reportedValueUnitForFiledDate('2023-01-03')).toBe('USD')
    expect(parsed.holdings[0]).toMatchObject({ reportedValue: '85000000', reportedValueUnit: 'USD', quantityType: 'SH', putCall: 'CALL' })
    expect(parsed.rejectedRows).toBe(0)
  })

  it('preserves SEC amendment metadata from the cover document', () => {
    expect(parse13fAmendmentMetadata('<coverPage><amendmentNo>2</amendmentNo><amendmentType>RESTATEMENT</amendmentType></coverPage>'))
      .toEqual({ amendmentNumber: 2, amendmentType: 'RESTATEMENT' })
  })
})
