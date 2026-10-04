import { describe, expect, it } from 'vitest';
import {
  CAPTURE_QUERY_MAX_LENGTH,
  CAPTURE_SHARE_LIMITS,
  CAPTURE_SHARE_QUERY_MAX_LENGTH,
  buildCapturePath,
  buildCompanyPath,
  composeSharedContent,
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

describe('web share target handoff', () => {
  it('accepts a shared title, text and url and composes one plain-text seed', () => {
    const parsed = parseCaptureContext('?title=Filing+summary&text=Revenue+grew&url=https%3A%2F%2Fexample.test%2Ffiling');
    expect(parsed).toEqual({
      context: null,
      share: { title: 'Filing summary', text: 'Revenue grew', url: 'https://example.test/filing' },
      issue: null,
    });
    expect(composeSharedContent(parsed.share)).toBe('Filing summary\nhttps://example.test/filing\n\nRevenue grew');
  });

  it('keeps a share beside the company handoff and a date', () => {
    const parsed = parseCaptureContext('?symbol=nvda&source=company&date=2026-09-12&url=https%3A%2F%2Fexample.test%2Fa');
    expect(parsed.context).toEqual({ source: 'company', symbol: 'NVDA' });
    expect(parsed.date).toBe('2026-09-12');
    expect(parsed.share).toEqual({ url: 'https://example.test/a' });
    expect(parsed.issue).toBeNull();
  });

  it('degrades hostile, empty and oversized shares to an ordinary capture', () => {
    // A share sheet that puts the link in `text` still yields the source line.
    expect(parseCaptureContext('?text=https%3A%2F%2Fexample.test%2Fb').share).toEqual({ text: 'https://example.test/b', url: 'https://example.test/b' });
    expect(composeSharedContent(parseCaptureContext('?text=https%3A%2F%2Fexample.test%2Fb').share)).toBe('https://example.test/b');
    expect(parseCaptureContext('?url=javascript%3Aalert(1)').share).toBeUndefined();
    expect(parseCaptureContext('?title=%20%20&text=').share).toBeUndefined();
    expect(parseCaptureContext('?title=a%00b').share).toEqual({ title: 'ab' });
    expect(parseCaptureContext(`?text=${'x'.repeat(CAPTURE_SHARE_LIMITS.text + 50)}`).share?.text).toHaveLength(CAPTURE_SHARE_LIMITS.text);
    expect(parseCaptureContext(`?text=${'x'.repeat(CAPTURE_SHARE_QUERY_MAX_LENGTH + 10)}`).issue).toBe('query-too-long');
    // Markdown and HTML arrive as literal text; the writing area and the
    // Markdown renderer decide what they mean, not the parser.
    expect(parseCaptureContext('?text=%3Cscript%3Ealert(1)%3C%2Fscript%3E').share).toEqual({ text: '<script>alert(1)</script>' });
    expect(parseCaptureContext('?title=NVDA&title=AAPL').issue).toBe('duplicate-query');
    expect(parseCaptureContext('?url=https%3A%2F%2Fexample.test&accountId=1').issue).toBe('unknown-query');
  });

  it('round-trips a share through the sign-in return path', () => {
    const share = { title: 'Filing summary', text: 'Revenue grew', url: 'https://example.test/filing' };
    const path = buildCapturePath('quick', null, '2026-09-12', share);
    expect(path).toContain('title=Filing+summary');
    expect(parseCaptureContext(path.slice(path.indexOf('?'))).share).toEqual(share);
    expect(safeCaptureReturnPath(path)).toBe(path);
    expect(safeCaptureReturnPath(`/diaries/new?url=${encodeURIComponent('javascript:alert(1)')}`)).toBe('/diaries/new');
  });
});
