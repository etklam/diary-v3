import { roundDecimalString } from './ledger';
import {
  getQuickNoteObservationTypeLabel,
  getQuickNoteReflectionMarketConditionLabel,
  resolveQuickNoteLocaleVariant,
} from './quick-localization'
import type { QuickNoteTemplateData, QuickNoteTemplateKind } from './quick-types'

export function formatQuickTradeDecimal(value:string,scale:number):string {
 const rounded=roundDecimalString(value,scale).replace(/^-/, '');const [integer,fraction='']=rounded.split('.');const sign=value.startsWith('-')&&/[1-9]/.test(value)?'-':'+';return sign+integer+(scale?'.'+fraction.padEnd(scale,'0'):'');
}

interface GenerateTemplateDraftInput {
  templateKind: QuickNoteTemplateKind
  date: string
  locale: string
  templateData: QuickNoteTemplateData
}

interface TemplateDraft {
  title: string
  content: string
}

function formatDate(date: string): string {
  return date.replace(/-/g, '/')
}

function normalizeSymbols(symbols: string | undefined): string {
  if (!symbols) return ''
  return symbols
    .split(',')
    .map(symbol => symbol.trim().toUpperCase())
    .filter(Boolean)
    .join(', ')
}

export function generateTemplateDraft(input: GenerateTemplateDraftInput): TemplateDraft {
  const localeVariant = resolveQuickNoteLocaleVariant(input.locale)
  const formattedDate = formatDate(input.date)
  const copy = localeVariant === 'zh-CN'
    ? {
        diaryLabel: '日记',
        reflectionLabel: '盘后反思',
        observationLabel: '市场观察',
        trading: {
          title: '今日操作',
          operation: '操作',
          symbols: '标的',
          marketFeeling: '今日市场感觉',
          quickNotes: '快速备注',
          buy: '买入',
          sell: '卖出',
          both: '买卖都做',
          none: '没有交易',
          bullish: '多头',
          bearish: '空头',
          neutral: '盘整',
        },
        reflection: {
          marketCondition: '今日市场状况',
          rating: '今日操作评价',
          goodPoints: '做得好的地方',
          noRashTrading: '- 没有胡乱操作',
          improvePoints: '需要改进的地方',
          relatedTrades: '相关交易回顾',
          tradePnL: '损益',
        },
        observation: {
          topic: '观察主题',
          type: '观察类型',
          content: '观察内容',
          action: '后续行动',
        },
      }
    : localeVariant === 'zh-TW'
      ? {
          diaryLabel: '日記',
          reflectionLabel: '盤後反思',
          observationLabel: '市場觀察',
          trading: {
            title: '今日操作',
            operation: '操作',
            symbols: '標的',
            marketFeeling: '今日市場感覺',
            quickNotes: '快速備註',
            buy: '買入',
            sell: '賣出',
            both: '買賣都做',
            none: '沒有交易',
            bullish: '多頭',
            bearish: '空頭',
            neutral: '盤整',
          },
          reflection: {
            marketCondition: '今日市場狀況',
            rating: '今日操作評價',
            goodPoints: '做得好的地方',
            noRashTrading: '- 沒有胡亂操作',
            improvePoints: '需要改進的地方',
            relatedTrades: '相關交易回顧',
            tradePnL: '損益',
          },
          observation: {
            topic: '觀察主題',
            type: '觀察類型',
            content: '觀察內容',
            action: '後續行動',
          },
        }
      : {
          diaryLabel: 'Diary',
          reflectionLabel: 'Post-market Reflection',
          observationLabel: 'Market Observation',
          trading: {
            title: "Today's Operation",
            operation: 'Operation',
            symbols: 'Symbols',
            marketFeeling: 'Market feeling',
            quickNotes: 'Quick notes',
            buy: 'Buy',
            sell: 'Sell',
            both: 'Both',
            none: 'No Trades',
            bullish: 'Bullish',
            bearish: 'Bearish',
            neutral: 'Neutral',
          },
          reflection: {
            marketCondition: 'Market condition',
            rating: "Today's rating",
            goodPoints: 'What went well',
            noRashTrading: '- No rash trading',
            improvePoints: 'Areas for improvement',
            relatedTrades: 'Related Trade Review',
            tradePnL: 'P&L',
          },
          observation: {
            topic: 'Topic',
            type: 'Observation type',
            content: 'Observation content',
            action: 'Follow-up action',
          },
        }

  if (input.templateKind === 'blank') {
    return {
      title: `${formattedDate} ${copy.diaryLabel}`,
      content: '',
    }
  }

  if (input.templateKind === 'trading') {
    const typeLabelMap = {
      buy: copy.trading.buy,
      sell: copy.trading.sell,
      both: copy.trading.both,
      none: copy.trading.none,
    }
    const type = input.templateData.tradingType as 'buy' | 'sell' | 'both' | 'none' | undefined
    const typeLabel = typeLabelMap[type || 'both']
    const symbols = normalizeSymbols(input.templateData.symbols)
    let content = `## ${copy.trading.title}\n\n`
    content += `- ${copy.trading.operation}: ${typeLabel}\n`
    if (symbols) {
      content += `- ${copy.trading.symbols}: ${symbols}\n`
    }
    const moodLabelMap = {
      bullish: copy.trading.bullish,
      bearish: copy.trading.bearish,
      neutral: copy.trading.neutral,
    }
    if (input.templateData.marketMood) {
      const mood = moodLabelMap[input.templateData.marketMood as 'bullish' | 'bearish' | 'neutral'] || input.templateData.marketMood
      content += `- ${copy.trading.marketFeeling}: ${mood}\n`
    }
    if (input.templateData.note) {
      content += `\n## ${copy.trading.quickNotes}\n\n${input.templateData.note}\n`
    }

    return {
      title: `${formattedDate} ${typeLabel} ${copy.diaryLabel}${symbols ? ` - ${symbols}` : ''}`,
      content,
    }
  }

  if (input.templateKind === 'reflection') {
    const stars = '⭐'.repeat(input.templateData.rating || 0)
    const goodPoints: string[] = []
    if (input.templateData.noRashTrading) {
      goodPoints.push(copy.reflection.noRashTrading)
    }
    if (input.templateData.goodPoints) {
      goodPoints.push(input.templateData.goodPoints)
    }
    const marketConditionLabel = getQuickNoteReflectionMarketConditionLabel(input.templateData.marketCondition, input.locale) || '-'

    let content = `## ${copy.reflection.marketCondition}\n\n${marketConditionLabel}\n\n`
    content += `## ${copy.reflection.rating}\n\n${stars}${stars ? ` (${input.templateData.rating}/5)` : ''}\n\n`
    if (goodPoints.length > 0) {
      content += `## ${copy.reflection.goodPoints}\n\n${goodPoints.join('\n')}\n\n`
    }
    if (input.templateData.improvePoints) {
      content += `## ${copy.reflection.improvePoints}\n\n${input.templateData.improvePoints}\n\n`
    }

    // Related trades review section
    const relatedTrades = input.templateData.relatedTrades ?? []
    if (relatedTrades.length > 0) {
      content += `## ${copy.reflection.relatedTrades}\n\n`
      for (const trade of relatedTrades) {
        const dateStr = trade.sellDate.slice(0, 10)
        const pnlStr = formatQuickTradeDecimal(trade.realizedPnL,0)
        const pctStr = `${formatQuickTradeDecimal(trade.realizedPnLPct,1)}%`
        content += `- **${trade.symbol}** × ${trade.sellQuantity} @ ${dateStr}  ${copy.reflection.tradePnL}: ${pnlStr} (${pctStr})\n`
      }
      content += '\n'
    }

    return {
      title: `${formattedDate} ${copy.reflectionLabel}`,
      content: content.trimEnd(),
    }
  }

  const topic = input.templateData.topic?.trim()
  const observationTypeLabel = getQuickNoteObservationTypeLabel(input.templateData.observationType, input.locale) || '-'
  let content = `## ${copy.observation.topic}: ${topic || '-'}\n\n`
  content += `**${copy.observation.type}:** ${observationTypeLabel}\n\n`
  if (input.templateData.observationContent) {
    content += `## ${copy.observation.content}\n\n${input.templateData.observationContent}\n\n`
  }
  if (input.templateData.action) {
    content += `## ${copy.observation.action}\n\n${input.templateData.action}\n`
  }

  return {
    title: topic || `${formattedDate} ${copy.observationLabel}`,
    content,
  }
}
