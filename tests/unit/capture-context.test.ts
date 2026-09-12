import { describe, expect, it } from 'vitest';
import {
  CAPTURE_QUERY_MAX_LENGTH,
  buildCapturePath,
  buildCompanyPath,
  parseCaptureContext,
  safeCaptureReturnPath,
} from '../../apps/web/app/capture-context';

describe('research diary capture context', () => {
  it('normalizes a supported company symbol and keeps a valid date', () => {
    expect(parseCaptureContext('?symbol= nvda &source=company&date=2026-09-12')).toEqual({
      context: { source: 'company', symbol: 'NVDA' },
      date: '2026-09-12',
      issue: null,
    });
  });

  it('rejects ambiguous, incomplete, unsupported and unknown context', () => {
    expect(parseCaptureContext('?symbol=NVDA&symbol=AAPL&source=company').issue).toBe('duplicate-query');
    expect(parseCaptureContext('?symbol=NVDA').issue).toBe('incomplete-context');
    expect(parseCaptureContext('?symbol=^GSPC&source=company').issue).toBe('invalid-symbol');
    expect(parseCaptureContext('?symbol=SPX&source=company').issue).toBe('invalid-symbol');
    expect(parseCaptureContext('?symbol=ABC%20DEF&source=company').issue).toBe('invalid-symbol');
    expect(parseCaptureContext('?symbol=BTC-USD&source=company').context).toEqual({ source: 'company', symbol: 'BTC-USD' });
    expect(parseCaptureContext('?symbol=BRK.B&source=company').context).toEqual({ source: 'company', symbol: 'BRK.B' });
    expect(parseCaptureContext('?symbol=NVDA&source=holdings').issue).toBe('invalid-source');
    expect(parseCaptureContext('?symbol=NVDA&source=company&accountId=1').issue).toBe('unknown-query');
  });

  it('rejects invalid dates, malformed encoding and oversized query input', () => {
    expect(parseCaptureContext('?symbol=NVDA&source=company&date=2026-02-30')).toMatchObject({
      context: { source: 'company', symbol: 'NVDA' },
      issue: 'invalid-date',
    });
    expect(parseCaptureContext('?symbol=%E0%A4%A&source=company').issue).toBe('invalid-encoding');
    expect(parseCaptureContext(`?symbol=${'A'.repeat(CAPTURE_QUERY_MAX_LENGTH)}&source=company`).issue).toBe('query-too-long');
  });

  it('builds only canonical, validated destinations', () => {
    const context = { source: 'company' as const, symbol: ' nvda ' };
    expect(buildCapturePath('quick', context, '2026-09-12')).toBe('/diaries/quick?symbol=NVDA&source=company&date=2026-09-12');
    expect(buildCapturePath('new', context, 'not-a-date')).toBe('/diaries/new?symbol=NVDA&source=company');
    expect(buildCapturePath('quick', { source: 'company', symbol: '^GSPC' })).toBe('/diaries/quick');
    expect(buildCompanyPath(context)).toBe('/stocks/NVDA');
    expect(buildCompanyPath({ source: 'company', symbol: '^GSPC' })).toBeNull();
  });

  it('canonicalizes safe editor returns and rejects unsafe destinations', () => {
    expect(safeCaptureReturnPath('/diaries/quick?source=company&symbol=nvda&date=2026-09-12')).toBe('/diaries/quick?symbol=NVDA&source=company&date=2026-09-12');
    expect(safeCaptureReturnPath('/diaries/new?symbol=NVDA&source=company&date=2026-02-30')).toBe('/diaries/new?symbol=NVDA&source=company');
    expect(safeCaptureReturnPath('https://outside.example/diaries/quick?symbol=NVDA&source=company')).toBeNull();
    expect(safeCaptureReturnPath('//outside.example/diaries/quick?symbol=NVDA&source=company')).toBeNull();
    expect(safeCaptureReturnPath('/diaries/quick?symbol=NVDA&source=company&symbol=AAPL')).toBeNull();
    expect(safeCaptureReturnPath('/diaries/%6Eew?symbol=NVDA&source=company')).toBeNull();
    expect(safeCaptureReturnPath('/diaries/quick/../new?symbol=NVDA&source=company')).toBeNull();
    expect(safeCaptureReturnPath('/diaries/%2e%2e/quick?symbol=NVDA&source=company')).toBeNull();
    expect(safeCaptureReturnPath('/diaries/quick?symbol=NVDA&source=company#unsafe')).toBeNull();
    expect(safeCaptureReturnPath('/diaries/quick?symbol=NVDA&source=company\n')).toBeNull();
    expect(safeCaptureReturnPath('/diaries/quick?symbol=%E0%A4%A&source=company')).toBeNull();
  });
});
