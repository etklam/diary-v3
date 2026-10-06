export const INSTITUTIONAL_13F_PARSER_VERSION = '13f-xml-v1'
export const FORM_13F_DOLLAR_VALUE_CUTOFF = '2023-01-03'

export type ReportedValueUnit = 'THOUSANDS_USD' | 'USD'

export interface Parsed13fHolding {
  rowNumber: number
  issuer: string
  titleOfClass: string
  cusip: string | null
  figi: string | null
  reportedValue: string
  reportedValueUnit: ReportedValueUnit
  valueUnitSource: string
  quantity: string
  quantityType: 'SH' | 'PRN'
  putCall: 'PUT' | 'CALL' | null
  investmentDiscretion: string | null
  otherManagers: string[]
  votingAuthority: Record<string, string | null>
  rawRow: string
  warnings: string[]
}

export interface Parsed13fDocument {
  holdings: Parsed13fHolding[]
  rejectedRows: number
  isInformationTable: boolean
}

function decodeXml(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (match, code: string) => decodeCodePoint(match, Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (match, code: string) => decodeCodePoint(match, Number.parseInt(code, 10)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&amp;/g, '&')
}

function decodeCodePoint(original: string, codePoint: number): string {
  return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff && !(codePoint >= 0xd800 && codePoint <= 0xdfff)
    ? String.fromCodePoint(codePoint)
    : original
}

function values(xml: string, name: string): string[] {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`<(?:(?:[\\w.-]+):)?${escaped}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[\\w.-]+):)?${escaped}\\s*>`, 'gi')
  return [...xml.matchAll(pattern)].map(match => decodeXml(match[1] ?? '').replace(/<[^>]*>/g, '').trim())
}

function field(xml: string, name: string): string | null {
  return values(xml, name)[0] || null
}

function validDecimal(value: string | null): value is string {
  return value !== null && /^\d+(?:\.\d+)?$/.test(value)
}

export function reportedValueUnitForFiledDate(filedDate: string): ReportedValueUnit {
  // SEC's updated Form 13F value convention took effect on January 3, 2023.
  return filedDate < FORM_13F_DOLLAR_VALUE_CUTOFF ? 'THOUSANDS_USD' : 'USD'
}

export function parse13fInformationTable(
  xml: string,
  options: { filedDate: string },
): Parsed13fDocument {
  const rows = xml.split(/(?=<(?:[\w.-]+:)?infoTable\b)/i).slice(1)
  const holdings: Parsed13fHolding[] = []
  let rejectedRows = 0
  const unit = reportedValueUnitForFiledDate(options.filedDate)
  const valueUnitSource = `SEC Form 13F reporting rule by filing date; cutoff ${FORM_13F_DOLLAR_VALUE_CUTOFF}`

  for (const [index, segment] of rows.entries()) {
    const opening = segment.match(/^<(?:[\w.-]+:)?infoTable\b[^>]*>/i)?.[0]
    const closing = opening ? segment.match(/<\/(?:[\w.-]+:)?infoTable\s*>/i) : null
    if (!opening || !closing || closing.index === undefined) {
      rejectedRows++
      continue
    }
    const rawRow = segment.slice(opening.length, closing.index)
    const issuer = field(rawRow, 'nameOfIssuer')
    const titleOfClass = field(rawRow, 'titleOfClass')
    const reportedValue = field(rawRow, 'value')
    const quantity = field(rawRow, 'sshPrnamt')
    const quantityType = field(rawRow, 'sshPrnamtType')?.toUpperCase()
    if (!issuer || !titleOfClass || !validDecimal(reportedValue) || !validDecimal(quantity) || (quantityType !== 'SH' && quantityType !== 'PRN')) {
      rejectedRows++
      continue
    }

    const cusip = field(rawRow, 'cusip')
    const rawPutCall = field(rawRow, 'putCall')?.toUpperCase() ?? null
    const warnings: string[] = []
    if (!cusip) warnings.push('CUSIP_MISSING')
    if (rawPutCall && rawPutCall !== 'PUT' && rawPutCall !== 'CALL') warnings.push('PUT_CALL_UNKNOWN')

    holdings.push({
      rowNumber: index + 1,
      issuer,
      titleOfClass,
      cusip: cusip?.replace(/\s+/g, '').toUpperCase() || null,
      figi: field(rawRow, 'figi')?.toUpperCase() ?? null,
      reportedValue,
      reportedValueUnit: unit,
      valueUnitSource,
      quantity,
      quantityType,
      putCall: rawPutCall === 'PUT' || rawPutCall === 'CALL' ? rawPutCall : null,
      investmentDiscretion: field(rawRow, 'investmentDiscretion')?.toUpperCase() ?? null,
      otherManagers: values(rawRow, 'otherManager'),
      votingAuthority: {
        sole: field(rawRow, 'Sole'),
        shared: field(rawRow, 'Shared'),
        none: field(rawRow, 'None'),
      },
      rawRow,
      warnings,
    })
  }

  return { holdings, rejectedRows, isInformationTable: /<(?:[\w.-]+:)?informationTable\b/i.test(xml) || rows.length > 0 }
}

export function parse13fAmendmentMetadata(xml: string): { amendmentNumber: number | null; amendmentType: string | null } {
  const number = field(xml, 'amendmentNo')
  const type = field(xml, 'amendmentType')?.toUpperCase() ?? null
  return {
    amendmentNumber: number && /^\d+$/.test(number) ? Number(number) : null,
    amendmentType: type,
  }
}
