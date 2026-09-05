import { expect, it } from 'vitest'
import { createDisciplineShare, parseDisciplineShare, encodeDisciplineShare, decodeDisciplineShare, disciplineShareUrl } from '@diary/contracts/discipline-share'
it('preserves duplicate content and array order while filtering malformed or blank entries', () => {
 const json = JSON.stringify({ version: '1.0', type: 'trading-disciplines', disciplines: [null, {}, { content: 123 }, { content: ' ' }, { content: '  A  ', order: 100 }, { content: 'A', order: -1 }, { content: '繁體 & <文字> 😀' }] })
 expect(parseDisciplineShare(json).disciplines).toEqual([{ content: 'A', order: 0 }, { content: 'A', order: 1 }, { content: '繁體 & <文字> 😀', order: 2 }])
 for (const invalid of ['null', '{', JSON.stringify({ version: '2.0', type: 'trading-disciplines', disciplines: [] }), JSON.stringify({ version: '1.0', type: 'trading-disciplines', disciplines: [{ content: 'x'.repeat(256) }] })]) expect(() => parseDisciplineShare(invalid)).toThrow()
})
it('exports only allowed fields without mutating inputs and reparses Unicode', () => {
 const rows = [{ content: 'B 😀', order: 1, id: '42', userId: '7' }, { content: 'A & <tag>', order: 0, id: '43', userId: '7' }]
 const share = createDisciplineShare(rows, {}, '2026-01-01T00:00:00Z')
 expect(rows[0]!.content).toBe('B 😀'); expect(share.author).toBe('Anonymous')
 expect(share.disciplines).toEqual([{ content: 'A & <tag>', order: 0 }, { content: 'B 😀', order: 1 }])
 expect(parseDisciplineShare(JSON.stringify(share)).count).toBe(2)
 expect(JSON.stringify(share)).not.toContain('userId')
})

it('roundtrips the frozen URI/Base64 URL format and rejects malformed payloads', () => {
 const share = createDisciplineShare([{ content: '中文 😀 & <script> " + / %', order: 0 }], { title: '特殊字元 & 分享' }, '2026-01-01T00:00:00Z')
 const encoded = encodeDisciplineShare(share)
 expect(encoded).toBe(btoa(encodeURIComponent(JSON.stringify(share, null, 2))))
 expect(JSON.parse(decodeDisciplineShare(encoded))).toEqual(share)
 const url = new URL(disciplineShareUrl(share, 'https://example.test/old?query=1#hash'))
 expect(url.pathname).toBe('/discipline/share'); expect(url.hash).toBe('')
 expect(JSON.parse(decodeDisciplineShare(url.searchParams.get('import')!))).toEqual(share)
 for (const invalid of ['!', btoa('%XX'), btoa('null'), btoa(encodeURIComponent('{"version":"2.0"}'))]) expect(() => decodeDisciplineShare(invalid)).toThrow()
})
