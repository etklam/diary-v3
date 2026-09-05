type QuickNoteLocaleVariant = 'en' | 'zh-TW' | 'zh-CN'

type LocalizedLabel = {
  en: string
  'zh-TW': string
  'zh-CN': string
}

export type ReflectionMarketConditionKey =
  | 'strongUp'
  | 'slightUp'
  | 'rangeBound'
  | 'slightDown'
  | 'strongDown'
  | 'gapUpAndGo'
  | 'gapUpFade'
  | 'gapDownRecovery'
  | 'gapDownAndGo'
  | 'choppySession'
  | 'stockDispersion'
  | 'broadRally'
  | 'broadSelloff'
  | 'stableIndexWeakStocks'
  | 'weakIndexStrongStocks'

type ObservationTypeKey =
  | 'sectorMomentum'
  | 'individualStockTrend'
  | 'marketNews'
  | 'technicalAnalysis'
  | 'other'

const reflectionMarketConditionGroups: Array<{
  label: LocalizedLabel
  options: Array<{
    value: ReflectionMarketConditionKey
    label: LocalizedLabel
    legacy: string[]
  }>
}> = [
  {
    label: {
      en: 'Price Change',
      'zh-TW': '漲跌',
      'zh-CN': '涨跌',
    },
    options: [
      {
        value: 'strongUp',
        label: { en: 'Strong rally', 'zh-TW': '大漲', 'zh-CN': '大涨' },
        legacy: ['大漲', '大涨', 'Strong rally'],
      },
      {
        value: 'slightUp',
        label: { en: 'Modest rise', 'zh-TW': '小漲', 'zh-CN': '小涨' },
        legacy: ['小漲', '小涨', 'Modest rise'],
      },
      {
        value: 'rangeBound',
        label: { en: 'Range-bound', 'zh-TW': '盤整', 'zh-CN': '盘整' },
        legacy: ['盤整', '盘整', 'Range-bound'],
      },
      {
        value: 'slightDown',
        label: { en: 'Modest pullback', 'zh-TW': '小跌', 'zh-CN': '小跌' },
        legacy: ['小跌', 'Modest pullback'],
      },
      {
        value: 'strongDown',
        label: { en: 'Sharp selloff', 'zh-TW': '大跌', 'zh-CN': '大跌' },
        legacy: ['大跌', 'Sharp selloff'],
      },
    ],
  },
  {
    label: {
      en: 'Trend Pattern',
      'zh-TW': '走勢型態',
      'zh-CN': '走势形态',
    },
    options: [
      {
        value: 'gapUpAndGo',
        label: { en: 'Gap up and go', 'zh-TW': '高開高走', 'zh-CN': '高开高走' },
        legacy: ['高開高走', '高开高走', 'Gap up and go'],
      },
      {
        value: 'gapUpFade',
        label: { en: 'Rally, then fade', 'zh-TW': '先升後跌', 'zh-CN': '先升后跌' },
        legacy: ['高開低走', '高开低走', '先升後跌', '先升后跌', 'Gap up and fade', 'Rally, then fade'],
      },
      {
        value: 'gapDownRecovery',
        label: { en: 'Dip, then recover', 'zh-TW': '先跌後升', 'zh-CN': '先跌后升' },
        legacy: ['低開高走', '低开高走', '先跌後升', '先跌后升', 'Gap down, then recover', 'Dip, then recover'],
      },
      {
        value: 'gapDownAndGo',
        label: { en: 'Gap down and go', 'zh-TW': '低開低走', 'zh-CN': '低开低走' },
        legacy: ['低開低走', '低开低走', 'Gap down and go'],
      },
      {
        value: 'choppySession',
        label: { en: 'Choppy session', 'zh-TW': '震盪', 'zh-CN': '震荡' },
        legacy: ['震盪', '震荡', 'Choppy session'],
      },
    ],
  },
  {
    label: {
      en: 'Market Structure',
      'zh-TW': '市場結構',
      'zh-CN': '市场结构',
    },
    options: [
      {
        value: 'stockDispersion',
        label: { en: 'Stock dispersion', 'zh-TW': '個股分化', 'zh-CN': '个股分化' },
        legacy: ['個股分化', '个股分化', 'Stock dispersion'],
      },
      {
        value: 'broadRally',
        label: { en: 'Broad rally', 'zh-TW': '齊漲', 'zh-CN': '齐涨' },
        legacy: ['齊漲', '齐涨', 'Broad rally'],
      },
      {
        value: 'broadSelloff',
        label: { en: 'Broad selloff', 'zh-TW': '齊跌', 'zh-CN': '齐跌' },
        legacy: ['齊跌', '齐跌', 'Broad selloff'],
      },
      {
        value: 'stableIndexWeakStocks',
        label: { en: 'Stable index, weak stocks', 'zh-TW': '指數穩、個股弱', 'zh-CN': '指数稳、个股弱' },
        legacy: ['指數穩、個股弱', '指數穩個股弱', '指数稳、个股弱', '指数稳个股弱', 'Stable index, weak stocks'],
      },
      {
        value: 'weakIndexStrongStocks',
        label: { en: 'Weak index, strong stocks', 'zh-TW': '指數弱、個股強', 'zh-CN': '指数弱、个股强' },
        legacy: ['指數弱、個股強', '指數弱個股強', '指数弱、个股强', '指数弱个股强', 'Weak index, strong stocks'],
      },
    ],
  },
]

const observationTypes: Array<{
  value: ObservationTypeKey
  label: LocalizedLabel
  legacy: string[]
}> = [
  {
    value: 'sectorMomentum',
    label: { en: 'Sector momentum', 'zh-TW': '板塊熱點', 'zh-CN': '板块热点' },
    legacy: ['Sector momentum', '板塊熱點', '板块热点'],
  },
  {
    value: 'individualStockTrend',
    label: { en: 'Individual stock trend', 'zh-TW': '個股走勢', 'zh-CN': '个股走势' },
    legacy: ['Individual stock trend', '個股走勢', '个股走势'],
  },
  {
    value: 'marketNews',
    label: { en: 'Market news', 'zh-TW': '市場消息', 'zh-CN': '市场消息' },
    legacy: ['Market news', '市場消息', '市场消息'],
  },
  {
    value: 'technicalAnalysis',
    label: { en: 'Technical analysis', 'zh-TW': '技術分析', 'zh-CN': '技术分析' },
    legacy: ['Technical analysis', '技術分析', '技术分析'],
  },
  {
    value: 'other',
    label: { en: 'Other', 'zh-TW': '其他', 'zh-CN': '其他' },
    legacy: ['Other', '其他'],
  },
]

const reflectionMarketConditionValueMap = new Map<string, ReflectionMarketConditionKey>()
const observationTypeValueMap = new Map<string, ObservationTypeKey>()

for (const group of reflectionMarketConditionGroups) {
  for (const option of group.options) {
    reflectionMarketConditionValueMap.set(option.value, option.value)
    for (const legacy of option.legacy) {
      reflectionMarketConditionValueMap.set(legacy, option.value)
    }
  }
}

for (const option of observationTypes) {
  observationTypeValueMap.set(option.value, option.value)
  for (const legacy of option.legacy) {
    observationTypeValueMap.set(legacy, option.value)
  }
}

export function resolveQuickNoteLocaleVariant(locale: string): QuickNoteLocaleVariant {
  const normalized = locale.toLowerCase()

  if (normalized.startsWith('zh-cn') || normalized.startsWith('zh-hans')) {
    return 'zh-CN'
  }

  if (normalized.startsWith('zh')) {
    return 'zh-TW'
  }

  return 'en'
}

export function isQuickNoteZhLocale(locale: string): boolean {
  return resolveQuickNoteLocaleVariant(locale) !== 'en'
}

function getLocalizedLabel(label: LocalizedLabel, locale: string): string {
  return label[resolveQuickNoteLocaleVariant(locale)]
}

export function normalizeQuickNoteReflectionMarketCondition(value?: string): ReflectionMarketConditionKey | '' {
  if (!value) return ''
  return reflectionMarketConditionValueMap.get(value) || ''
}

export function normalizeQuickNoteObservationType(value?: string): ObservationTypeKey | '' {
  if (!value) return ''
  return observationTypeValueMap.get(value) || ''
}

export function getQuickNoteReflectionMarketConditionGroups(locale: string) {
  return reflectionMarketConditionGroups.map(group => ({
    label: getLocalizedLabel(group.label, locale),
    options: group.options.map(option => ({
      value: option.value,
      label: getLocalizedLabel(option.label, locale),
    })),
  }))
}

export function getQuickNoteReflectionMarketConditionLabel(value: string | undefined, locale: string): string {
  const normalized = normalizeQuickNoteReflectionMarketCondition(value)
  if (!normalized) return value || ''

  for (const group of reflectionMarketConditionGroups) {
    const option = group.options.find(item => item.value === normalized)
    if (option) {
      return getLocalizedLabel(option.label, locale)
    }
  }

  return value || ''
}

export function getQuickNoteObservationTypeOptions(locale: string) {
  return observationTypes.map(option => ({
    value: option.value,
    label: getLocalizedLabel(option.label, locale),
  }))
}

export function getQuickNoteObservationTypeLabel(value: string | undefined, locale: string): string {
  const normalized = normalizeQuickNoteObservationType(value)
  if (!normalized) return value || ''

  const option = observationTypes.find(item => item.value === normalized)
  return option ? getLocalizedLabel(option.label, locale) : (value || '')
}
