import { describe, it, expect } from 'vitest'
import { generateTemplateDraft } from '@diary/domain'

describe('generateTemplateDraft', () => {
  it('returns a neutral diary title for blank quicknotes', () => {
    const result = generateTemplateDraft({
      templateKind: 'blank',
      date: '2026-03-22',
      locale: 'en',
      templateData: {},
    })

    expect(result).toEqual({
      title: '2026/03/22 Diary',
      content: '',
    })
  })

  it('builds trading titles and content from structured fields', () => {
    const result = generateTemplateDraft({
      templateKind: 'trading',
      date: '2026-03-22',
      locale: 'en',
      templateData: {
        tradingType: 'buy',
        symbols: 'TSLA, NVDA',
        marketMood: 'bullish',
        note: 'Waited for confirmation before entry.',
      },
    })

    expect(result.title).toBe('2026/03/22 Buy Diary - TSLA, NVDA')
    expect(result.content).toContain('## Today\'s Operation')
    expect(result.content).toContain('TSLA, NVDA')
    expect(result.content).toContain('Waited for confirmation before entry.')
  })

  it('supports "No Trades" option in trading template', () => {
    const result = generateTemplateDraft({
      templateKind: 'trading',
      date: '2026-03-22',
      locale: 'en',
      templateData: {
        tradingType: 'none',
        marketMood: 'neutral',
        note: 'Market watching day, no entry signals.',
      },
    })

    expect(result.title).toBe('2026/03/22 No Trades Diary')
    expect(result.content).toContain('## Today\'s Operation')
    expect(result.content).toContain('- Operation: No Trades')
    expect(result.content).toContain('Market watching day, no entry signals.')
  })

  it('uses the observation topic as the title when available', () => {
    const result = generateTemplateDraft({
      templateKind: 'observation',
      date: '2026-03-22',
      locale: 'zh-TW',
      templateData: {
        topic: '半導體資金輪動',
        observationType: '板塊熱點',
        observationContent: '尾盤資金明顯回流。',
      },
    })

    expect(result.title).toBe('半導體資金輪動')
    expect(result.content).toContain('板塊熱點')
    expect(result.content).toContain('尾盤資金明顯回流。')
  })

  it('localizes structured reflection and observation values from semantic keys', () => {
    const reflection = generateTemplateDraft({
      templateKind: 'reflection',
      date: '2026-03-22',
      locale: 'en',
      templateData: {
        marketCondition: 'gapUpAndGo',
        rating: 4,
      },
    })

    const observation = generateTemplateDraft({
      templateKind: 'observation',
      date: '2026-03-22',
      locale: 'en',
      templateData: {
        observationType: 'sectorMomentum',
        observationContent: 'Breadth improved into the close.',
      },
    })

    expect(reflection.content).toContain('Gap up and go')
    expect(observation.content).toContain('Sector momentum')
  })

  it('translates legacy localized template values when the locale changes', () => {
    const reflection = generateTemplateDraft({
      templateKind: 'reflection',
      date: '2026-03-22',
      locale: 'en',
      templateData: {
        marketCondition: '大漲',
      },
    })

    const observation = generateTemplateDraft({
      templateKind: 'observation',
      date: '2026-03-22',
      locale: 'en',
      templateData: {
        observationType: '板塊熱點',
      },
    })

    expect(reflection.content).toContain('Strong rally')
    expect(observation.content).toContain('Sector momentum')
  })

  it('reflection with relatedTrades → appends the related-trade review block to content', () => {
    const result = generateTemplateDraft({
      templateKind: 'reflection',
      date: '2026-04-12',
      locale: 'zh-TW',
      templateData: {
        rating: 4,
        relatedTrades: [
          {
            id: '1',
            symbol: 'AAPL',
            sellDate: '2026-04-11T10:00:00.000Z',
            sellQuantity: '10',
            realizedPnL: '200',
            realizedPnLPct: '20',
          },
          {
            id: '2',
            symbol: 'TSLA',
            sellDate: '2026-04-10T10:00:00.000Z',
            sellQuantity: '5',
            realizedPnL: '-100',
            realizedPnLPct: '-10',
          },
        ],
      },
    })

    // Title stays unchanged
    expect(result.title).toBe('2026/04/12 盤後反思')
    // Includes the trade review section
    expect(result.content).toContain('相關交易回顧')
    // AAPL positive P&L
    expect(result.content).toContain('AAPL')
    expect(result.content).toContain('+200')
    expect(result.content).toContain('+20.0%')
    // TSLA negative P&L
    expect(result.content).toContain('TSLA')
    expect(result.content).toContain('-100')
    expect(result.content).toContain('-10.0%')
    // Date display (ISO string truncated to the date part)
    expect(result.content).toContain('2026-04-11')
  })

  it('reflection with relatedTrades (en locale) → Related Trade Review heading', () => {
    const result = generateTemplateDraft({
      templateKind: 'reflection',
      date: '2026-04-12',
      locale: 'en',
      templateData: {
        relatedTrades: [
          {
            id: '1',
            symbol: 'NVDA',
            sellDate: '2026-04-11T15:00:00.000Z',
            sellQuantity: '2',
            realizedPnL: '50',
            realizedPnLPct: '5',
          },
        ],
      },
    })

    expect(result.content).toContain('Related Trade Review')
    expect(result.content).toContain('NVDA')
    expect(result.content).toContain('P&L')
    expect(result.content).toContain('+50')
  })

  it('reflection with empty relatedTrades → no trade block generated', () => {
    const result = generateTemplateDraft({
      templateKind: 'reflection',
      date: '2026-04-12',
      locale: 'en',
      templateData: {
        rating: 3,
        relatedTrades: [],
      },
    })

    expect(result.content).not.toContain('Related Trade Review')
    // The original section should still be present
    expect(result.content).toContain("Today's rating")
    expect(result.content).toContain('⭐⭐⭐')
  })

  it('reflection without relatedTrades field → no trade block generated', () => {
    const result = generateTemplateDraft({
      templateKind: 'reflection',
      date: '2026-04-12',
      locale: 'en',
      templateData: {
        rating: 3,
      },
    })

    expect(result.content).not.toContain('Related Trade Review')
  })
})

it('keeps decimal-string trade quantities and rounds large signed results without Number conversion',()=>{
 const result=generateTemplateDraft({templateKind:'reflection',date:'2026-09-05',locale:'en',templateData:{relatedTrades:[{id:'99',symbol:'AAPL',sellDate:'2026-09-04T15:00:00.000Z',sellQuantity:'0.0001',realizedPnL:'9007199254740993.5',realizedPnLPct:'-2.35'}]}});
 expect(result.content).toContain('× 0.0001');expect(result.content).toContain('+9007199254740994 (-2.4%)');
});
