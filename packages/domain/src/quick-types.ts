export type QuickNoteTemplateKind = 'blank' | 'trading' | 'reflection' | 'observation'
export type QuickNoteSaveMode = 'create' | 'append'
export type QuickNoteReminderKey = 'reminder1'
export type QuickNoteQuickReminderPreset = 'tomorrow' | 'nextWeek' | 'nextMonth'

/** Optional open context for QuickDiaryModal capture entry points */
export type QuickDiaryCaptureSource = 'floating' | 'calendar' | 'timeline' | 'diaries' | 'research'

export interface QuickDiaryContext {
  date?: string
  templateKind?: QuickNoteTemplateKind
  source?: QuickDiaryCaptureSource
  /** Prefilled editable starting content (research capture pipeline) */
  content?: string
  /** Prefilled stock symbols (composer rules apply: ≤10, uppercased) */
  stockSymbols?: string[]
}

export interface QuickNoteReminders {
  reminder1: string | null
}

/**
 * 用於 reflection 模板選擇器顯示的輕量交易摘要
 * （從 /api/stats/recent-trades 取得，存在 templateData 側方便生成 markdown）
 */
export interface RecentClosedTrade {
  id: string
  symbol: string
  sellDate: string  // ISO string
  sellQuantity: string
  realizedPnL: string
  realizedPnLPct: string
}

export interface RecentClosedTradesResponse {
  trades: RecentClosedTrade[]
}

export interface QuickNoteTemplateData {
  tradingType?: string
  symbols?: string
  marketMood?: string
  note?: string
  marketCondition?: string
  rating?: number
  noRashTrading?: boolean
  goodPoints?: string
  improvePoints?: string
  topic?: string
  observationType?: string
  observationContent?: string
  action?: string
  /** reflection 模板：用戶選擇的相關交易（用於在 markdown 中顯示交易回顧） */
  relatedTrades?: RecentClosedTrade[]
}

export interface QuickNoteComposerState {
  date: string
  saveMode: QuickNoteSaveMode
  templateKind: QuickNoteTemplateKind
  title: string
  content: string
  tags: string[]
  stockSymbols: string[]
  reminders: QuickNoteReminders
  templateData: QuickNoteTemplateData
  titleTouched: boolean
  contentTouched: boolean
}

export function createEmptyQuickNoteTemplateData(): QuickNoteTemplateData {
  return {
    tradingType: '',
    symbols: '',
    marketMood: '',
    note: '',
    marketCondition: '',
    rating: 0,
    noRashTrading: false,
    goodPoints: '',
    improvePoints: '',
    topic: '',
    observationType: '',
    observationContent: '',
    action: '',
    relatedTrades: [],
  }
}
