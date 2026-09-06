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
 * Lightweight trade summary shown in the reflection template picker
 * (fetched from /api/stats/recent-trades and kept on templateData
 * for easy markdown generation)
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
  /** reflection template: user-selected related trades (rendered as the trade review in markdown) */
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
