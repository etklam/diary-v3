import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { marketRotationMonitorResponseSchema, type MarketRotationMonitorResponse, type MarketRotationMonitorRow } from '@diary/contracts/rotation-monitor';
import { marketStateHistoryResponseSchema, marketStateSnapshotSchema, type MarketStateHistoryItem, type MarketStateSnapshot } from '@diary/contracts/market-state';
import { filterAndSortRotationRows, rotationFilterKeys, type RotationFilterKey, type RotationSortField, type RotationSortOrder } from '@diary/domain/market-rotation/view';
import { api, useUi } from '../ui';
import { apiFailure, FailureNotice, type Failure } from '../api-error';
import { localizeAllocationMode, localizePolicyExplanation, localizePolicyWarning } from '../market-policy-copy';
import { formatMarketValue, marketClass, marketDirection } from '../market-display';
import './market-rotation.css';

const copy = {
  en: {
    title: 'Market rotation',
    intro: 'Read the latest available relative-strength snapshot by scope. The monitor shows the observation date and keeps unavailable values explicit.',
    scope: 'Rank scope',
    sectors: 'Sectors',
    indexes: 'Indexes',
    core: 'Core assets',
    asOf: 'Snapshot date',
    marketStateAsOf: 'Market state date',
    summaryAsOf: 'Breadth date',
    comparison: 'Comparison date',
    noComparison: 'No qualified comparison yet',
    marketState: 'Market state',
    above20d: 'Above 20-day SMA',
    above50d: 'Above 50-day SMA',
    averageRsi: 'Average RSI',
    currentSummary: 'Current read',
    breadthCondition: 'Sector breadth',
    breadthConfirmation: 'Breadth confirmation',
    suggestedPosture: 'Suggested posture',
    warnings: 'Warnings',
    na: 'N/A',
    leaders: 'Leaders',
    weakening: 'Weakening groups',
    noLeaders: 'No improving groups with a qualified comparison.',
    noWeakening: 'No weakening groups with a qualified comparison.',
    ranking: 'Current ranking',
    symbol: 'Symbol',
    name: 'Name',
    rank: 'Rank',
    score: 'Score',
    change: '2-week change',
    rsi: 'RSI',
    signal: 'Signal',
    price: 'Last price',
    unavailable: 'Unavailable',
    complete: 'Complete',
    insufficient: 'Insufficient data',
    qualified: 'Qualified snapshot',
    partial: 'Partial snapshot',
    empty: 'No latest market snapshot is available for this scope yet.',
    stateObservation: 'Market state observation',
    coverage: 'Coverage',
    stateCoverageAsOf: 'State coverage as of',
    stateFresh: 'Coverage supports a current reading.',
    stateUnknown: 'Data is insufficient for a market-state reading.',
    stateStale: 'Coverage is below the threshold for a current reading.',
    history: 'Market state history',
    historyDays: 'History window',
    days30: '30 days',
    days90: '90 days',
    days120: '120 days',
    up4: 'Up 4%+',
    down4: 'Down 4%+',
    ratio10d: '10-day ratio',
    above40d: 'Above 40-day SMA',
    noHistory: 'No market-state history is available yet.',
    filter: 'Signal filter',
    all: 'All rows',
    turningStrong: 'Turning strong',
    losingMomentum: 'Losing momentum',
    rankUp: 'Rank up',
    rankDown: 'Rank down',
    above50dFilter: 'Above 50-day SMA',
    below50dFilter: 'Below 50-day SMA',
    nearHigh: 'Near high',
    extended: 'Extended',
    sortBy: 'Sort by',
    sortAscending: 'Ascending',
    sortDescending: 'Descending',
    filterClear: 'Clear filter',
    results: 'rows',
    trend: '2-week trend',
    trendAria: 'Two-week trend for {symbol}',
    comparisonWindow: 'Comparison window',
    comparisonUnavailable: 'No qualified comparison window yet',
    comparisonFrom: 'from',
    comparisonTo: 'to',
    maStatus: 'Moving average status',
    rsiDelta: 'RSI change',
    rankDelta: 'Rank change',
    performance: '2-week performance',
    fromHigh: 'From high',
    exportCsv: 'Download CSV',
    copyTable: 'Copy table',
    exportPng: 'Download PNG',
    copyEmpty: 'No rows to copy. The current table is empty.',
    copySuccess: 'Table copied.',
    copyFailed: 'Copy failed. Select the table text and try again.',
    exportSuccess: 'Export ready.',
    exportFailed: 'Export failed. Try again.',
    noRows: 'No rows match this filter.',
  },
  'zh-TW': {
    title: '市場輪動',
    intro: '按範圍閱讀最新的市場相對強弱快照。頁面清楚顯示觀察日期，缺少的數值會保留為無資料。',
    scope: '排名範圍',
    sectors: '板塊',
    indexes: '指數',
    core: '核心資產',
    asOf: '快照日期',
    marketStateAsOf: '市場狀態日期',
    summaryAsOf: '廣度日期',
    comparison: '比較日期',
    noComparison: '尚未有合資格比較',
    marketState: '市場狀態',
    above20d: '高於 20 日均線',
    above50d: '高於 50 日均線',
    averageRsi: '平均 RSI',
    currentSummary: '目前讀法',
    breadthCondition: '板塊廣度',
    breadthConfirmation: '廣度確認',
    suggestedPosture: '建議姿態',
    warnings: '提示',
    na: '無資料',
    leaders: '領先群組',
    weakening: '轉弱群組',
    noLeaders: '沒有具備合資格比較的改善群組。',
    noWeakening: '沒有具備合資格比較的轉弱群組。',
    ranking: '目前排名',
    symbol: '代號',
    name: '名稱',
    rank: '排名',
    score: '分數',
    change: '兩週變化',
    rsi: 'RSI',
    signal: '訊號',
    price: '最新價格',
    unavailable: '無資料',
    complete: '完整',
    insufficient: '資料不足',
    qualified: '合資格快照',
    partial: '部分快照',
    empty: '此範圍尚未有最新市場快照。',
    stateObservation: '市場狀態觀察',
    coverage: '資料覆蓋率',
    stateCoverageAsOf: '狀態覆蓋率日期',
    stateFresh: '覆蓋率足以支援目前讀法。',
    stateUnknown: '資料不足，暫時無法判定市場狀態。',
    stateStale: '覆蓋率低於目前讀法所需門檻。',
    history: '市場狀態歷史',
    historyDays: '歷史範圍',
    days30: '30 日',
    days90: '90 日',
    days120: '120 日',
    up4: '上升 4% 以上',
    down4: '下跌 4% 以上',
    ratio10d: '10 日比率',
    above40d: '高於 40 日均線',
    noHistory: '尚未有市場狀態歷史資料。',
    filter: '訊號篩選',
    all: '全部列',
    turningStrong: '轉強',
    losingMomentum: '動能減弱',
    rankUp: '排名上升',
    rankDown: '排名下降',
    above50dFilter: '高於 50 日均線',
    below50dFilter: '低於 50 日均線',
    nearHigh: '接近高點',
    extended: '偏離延伸',
    sortBy: '排序欄位',
    sortAscending: '升冪',
    sortDescending: '降冪',
    filterClear: '清除篩選',
    results: '列',
    trend: '兩週走勢',
    trendAria: '{symbol} 兩週走勢',
    comparisonWindow: '比較區間',
    comparisonUnavailable: '尚未有合資格比較區間',
    comparisonFrom: '從',
    comparisonTo: '至',
    maStatus: '均線狀態',
    rsiDelta: 'RSI 變化',
    rankDelta: '排名變化',
    performance: '兩週表現',
    fromHigh: '距離高點',
    exportCsv: '下載 CSV',
    copyTable: '複製表格',
    exportPng: '下載 PNG',
    copyEmpty: '目前表格沒有資料可複製。',
    copySuccess: '表格已複製。',
    copyFailed: '複製失敗，請選取表格文字後重試。',
    exportSuccess: '匯出已準備完成。',
    exportFailed: '匯出失敗，請重試。',
    noRows: '沒有符合此篩選的列。',
  },
  'zh-CN': {
    title: '市场轮动',
    intro: '按范围阅读最新的市场相对强弱快照。页面清楚显示观察日期，缺少的数值会保留为无数据。',
    scope: '排名范围',
    sectors: '板块',
    indexes: '指数',
    core: '核心资产',
    asOf: '快照日期',
    marketStateAsOf: '市场状态日期',
    summaryAsOf: '广度日期',
    comparison: '比较日期',
    noComparison: '尚无合资格比较',
    marketState: '市场状态',
    above20d: '高于 20 日均线',
    above50d: '高于 50 日均线',
    averageRsi: '平均 RSI',
    currentSummary: '目前读法',
    breadthCondition: '板块广度',
    breadthConfirmation: '广度确认',
    suggestedPosture: '建议姿态',
    warnings: '提示',
    na: '无数据',
    leaders: '领先群组',
    weakening: '转弱群组',
    noLeaders: '没有具备合资格比较的改善群组。',
    noWeakening: '没有具备合资格比较的转弱群组。',
    ranking: '目前排名',
    symbol: '代码',
    name: '名称',
    rank: '排名',
    score: '分数',
    change: '两周变化',
    rsi: 'RSI',
    signal: '信号',
    price: '最新价格',
    unavailable: '无数据',
    complete: '完整',
    insufficient: '数据不足',
    qualified: '合资格快照',
    partial: '部分快照',
    empty: '此范围尚无最新市场快照。',
    stateObservation: '市场状态观察',
    coverage: '数据覆盖率',
    stateCoverageAsOf: '状态覆盖率日期',
    stateFresh: '覆盖率足以支持当前读法。',
    stateUnknown: '数据不足，暂时无法判定市场状态。',
    stateStale: '覆盖率低于当前读法所需门槛。',
    history: '市场状态历史',
    historyDays: '历史范围',
    days30: '30 天',
    days90: '90 天',
    days120: '120 天',
    up4: '上涨 4% 以上',
    down4: '下跌 4% 以上',
    ratio10d: '10 日比率',
    above40d: '高于 40 日均线',
    noHistory: '尚无市场状态历史数据。',
    filter: '信号筛选',
    all: '全部行',
    turningStrong: '转强',
    losingMomentum: '动能减弱',
    rankUp: '排名上升',
    rankDown: '排名下降',
    above50dFilter: '高于 50 日均线',
    below50dFilter: '低于 50 日均线',
    nearHigh: '接近高点',
    extended: '偏离延伸',
    sortBy: '排序字段',
    sortAscending: '升序',
    sortDescending: '降序',
    filterClear: '清除筛选',
    results: '行',
    trend: '两周走势',
    trendAria: '{symbol} 两周走势',
    comparisonWindow: '比较区间',
    comparisonUnavailable: '尚无合资格比较区间',
    comparisonFrom: '从',
    comparisonTo: '至',
    maStatus: '均线状态',
    rsiDelta: 'RSI 变化',
    rankDelta: '排名变化',
    performance: '两周表现',
    fromHigh: '距高点',
    exportCsv: '下载 CSV',
    copyTable: '复制表格',
    exportPng: '下载 PNG',
    copyEmpty: '当前表格没有可复制的行。',
    copySuccess: '表格已复制。',
    copyFailed: '复制失败，请选取表格文字后重试。',
    exportSuccess: '导出已准备完成。',
    exportFailed: '导出失败，请重试。',
    noRows: '没有符合此筛选的行。',
  },
} as const;

type Scope = 'sectors' | 'indexes' | 'core';
type RotationCopy = Record<keyof typeof copy.en, string>;
const scopes: Scope[] = ['sectors', 'indexes', 'core'];
type Locale = keyof typeof copy;
const filterLabels: Record<RotationFilterKey, keyof typeof copy.en> = {
  all: 'all',
  turning_strong: 'turningStrong',
  losing_momentum: 'losingMomentum',
  rank_up: 'rankUp',
  rank_down: 'rankDown',
  above_50d: 'above50dFilter',
  below_50d: 'below50dFilter',
  near_high: 'nearHigh',
  extended: 'extended',
};
const sortFieldLabels: Record<RotationSortField, keyof typeof copy.en> = {
  symbol: 'symbol',
  sectorName: 'name',
  lastPrice: 'price',
  rsi14: 'rsi',
  rsiDelta2W: 'rsiDelta',
  rotationRank: 'rank',
  rankDelta2W: 'rankDelta',
  twoWeekPerformancePct: 'performance',
  percentFromHigh: 'fromHigh',
};
const stateLabels: Record<Locale, Record<MarketRotationMonitorResponse['marketState'], string>> = {
  en: { risk_on: 'Risk on', neutral: 'Neutral', defensive: 'Defensive', risk_off: 'Risk off', unknown: 'Unknown' },
  'zh-TW': { risk_on: '風險偏好', neutral: '中性', defensive: '防守', risk_off: '風險規避', unknown: '未知' },
  'zh-CN': { risk_on: '风险偏好', neutral: '中性', defensive: '防守', risk_off: '风险规避', unknown: '未知' },
};
const signalLabels: Record<Locale, Record<NonNullable<MarketRotationMonitorRow['signal']>, string>> = {
  en: { turning_strong: 'Turning strong', strong_but_extended: 'Strong but extended', losing_momentum: 'Losing momentum', breaking_down: 'Breaking down', early_recovery: 'Early recovery', neutral: 'Neutral' },
  'zh-TW': { turning_strong: '轉強', strong_but_extended: '強勢但偏離', losing_momentum: '動能減弱', breaking_down: '跌破轉弱', early_recovery: '初步復甦', neutral: '中性' },
  'zh-CN': { turning_strong: '转强', strong_but_extended: '强势但偏离', losing_momentum: '动能减弱', breaking_down: '跌破转弱', early_recovery: '初步复苏', neutral: '中性' },
};
const maStatusLabels: Record<Locale, Record<MarketRotationMonitorRow['maStatus'], string>> = {
  en: { bullish_stack: 'Bullish stack', healthy_pullback: 'Healthy pullback', short_term_weakness: 'Short-term weakness', recovering: 'Recovering', breakdown: 'Breakdown', unknown: 'Unknown' },
  'zh-TW': { bullish_stack: '多頭排列', healthy_pullback: '健康回調', short_term_weakness: '短線偏弱', recovering: '復甦中', breakdown: '跌破轉弱', unknown: '未知' },
  'zh-CN': { bullish_stack: '多头排列', healthy_pullback: '健康回调', short_term_weakness: '短线偏弱', recovering: '复苏中', breakdown: '跌破转弱', unknown: '未知' },
};
type MarketStateValue = MarketRotationMonitorResponse['marketState'];
type BreadthConditionValue = MarketRotationMonitorResponse['breadthCondition'];
type BreadthConfirmationValue = MarketRotationMonitorResponse['breadthConfirmation'];

const breadthConditionLabels: Record<Locale, Record<BreadthConditionValue, string>> = {
  en: { broad_participation: 'Broad participation', constructive: 'Constructive', narrowing: 'Narrowing', weak_breadth: 'Weak breadth', unknown: 'Unknown' },
  'zh-TW': { broad_participation: '廣泛參與', constructive: '具建設性', narrowing: '收窄', weak_breadth: '廣度偏弱', unknown: '未知' },
  'zh-CN': { broad_participation: '广泛参与', constructive: '具有建设性', narrowing: '收窄', weak_breadth: '广度偏弱', unknown: '未知' },
};
const breadthConfirmationLabels: Record<Locale, Record<BreadthConfirmationValue, string>> = {
  en: { confirming: 'Confirming', mixed: 'Mixed', warning: 'Warning', unknown: 'Unknown' },
  'zh-TW': { confirming: '確認', mixed: '混合', warning: '警示', unknown: '未知' },
  'zh-CN': { confirming: '确认', mixed: '混合', warning: '警示', unknown: '未知' },
};
const marketStateDescriptions: Record<Locale, Record<MarketStateValue, string>> = {
  en: {
    risk_on: 'Risk-on environment with constructive price action.',
    neutral: 'Market is in a neutral state with mixed signals.',
    defensive: 'Defensive posture — risk appetite has cooled.',
    risk_off: 'Risk-off conditions — capital is rotating to safety.',
    unknown: 'Market state is unclear due to insufficient data.',
  },
  'zh-TW': {
    risk_on: '市場處於風險偏好環境，價格走勢具建設性。',
    neutral: '市場處於中性狀態，訊號互有分歧。',
    defensive: '市場偏防守，風險偏好已降溫。',
    risk_off: '市場處於風險規避狀態，資金轉向安全資產。',
    unknown: '市場狀態不明，資料不足。',
  },
  'zh-CN': {
    risk_on: '市场处于风险偏好环境，价格走势具有建设性。',
    neutral: '市场处于中性状态，信号存在分歧。',
    defensive: '市场偏防御，风险偏好已经降温。',
    risk_off: '市场处于风险规避状态，资金转向安全资产。',
    unknown: '市场状态不明，数据不足。',
  },
};
const breadthConfirmationDescriptions: Record<Locale, Record<BreadthConfirmationValue, string>> = {
  en: {
    confirming: 'Sector breadth confirms the current market state.',
    mixed: 'Sector breadth sends mixed signals relative to market state.',
    warning: 'Sector breadth warns against the current market state.',
    unknown: '',
  },
  'zh-TW': {
    confirming: '板塊廣度確認目前市場狀態。',
    mixed: '相對市場狀態，板塊廣度訊號混合。',
    warning: '板塊廣度對目前市場狀態發出警示。',
    unknown: '',
  },
  'zh-CN': {
    confirming: '板块广度确认当前市场状态。',
    mixed: '相对市场状态，板块广度信号混合。',
    warning: '板块广度对当前市场状态发出警示。',
    unknown: '',
  },
};

function number(locale: string, value: number | null, digits = 2) {
  return value === null ? '—' : new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
}

function percent(locale: string, value: number | null) {
  return value === null ? '—' : new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(value);
}

function date(locale: string, value: string | null) {
  return value === null ? '—' : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
}

function stateLabel(value: MarketRotationMonitorResponse['marketState'], locale: Locale) {
  return stateLabels[locale][value];
}

function rowLabel(row: MarketRotationMonitorRow, c: RotationCopy, locale: Locale) {
  return row.signalStatus === 'complete' ? (row.signal ? signalLabels[locale][row.signal] : c.complete) : c.insufficient;
}

function coverage(locale: Locale, value: number | null) {
  return value === null ? '—' : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)}%`;
}

function historyStateLabel(row: MarketStateHistoryItem, locale: Locale) {
  return stateLabels[locale][row.marketState];
}

function wholePercent(locale: Locale, value: number | null) {
  return value === null ? null : new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(value);
}

function breadthSummary(value: BreadthConditionValue, ratio: number | null, locale: Locale, c: RotationCopy) {
  const pct = wholePercent(locale, ratio) ?? c.na;
  if (locale === 'en') {
    switch (value) {
      case 'broad_participation': return `Broad participation with ${pct} of sectors above their 50-day SMA.`;
      case 'constructive': return `Breadth is constructive at ${pct} above 50-day SMA.`;
      case 'narrowing': return `Breadth is narrowing (${pct} above 50-day SMA).`;
      case 'weak_breadth': return `Breadth is weak (${pct} above 50-day SMA).`;
      case 'unknown': return 'Breadth data is insufficient.';
    }
  }
  if (locale === 'zh-TW') {
    switch (value) {
      case 'broad_participation': return `市場參與廣泛，${pct} 的板塊高於 50 日均線。`;
      case 'constructive': return `板塊廣度具建設性，${pct} 高於 50 日均線。`;
      case 'narrowing': return `板塊廣度收窄（${pct} 高於 50 日均線）。`;
      case 'weak_breadth': return `板塊廣度偏弱（${pct} 高於 50 日均線）。`;
      case 'unknown': return '板塊廣度資料不足。';
    }
  }
  switch (value) {
    case 'broad_participation': return `市场参与广泛，${pct} 的板块高于 50 日均线。`;
    case 'constructive': return `板块广度具有建设性，${pct} 高于 50 日均线。`;
    case 'narrowing': return `板块广度收窄（${pct} 高于 50 日均线）。`;
    case 'weak_breadth': return `板块广度偏弱（${pct} 高于 50 日均线）。`;
    case 'unknown': return '板块广度数据不足。';
  }
}

function localizedSummary(data: MarketRotationMonitorResponse, c: RotationCopy, locale: Locale) {
  if (locale === 'en') return data.currentMarketSummary;
  const parts = [
    marketStateDescriptions[locale][data.marketState],
    breadthSummary(data.breadthCondition, data.summary.above50d.ratio, locale, c),
  ];
  const confirmation = breadthConfirmationDescriptions[locale][data.breadthConfirmation];
  if (confirmation) parts.push(confirmation);
  if (data.topImproving.length) parts.push(`${c.leaders}：${data.topImproving.map(row => row.sectorName ?? row.symbol).join('、')}。`);
  if (data.bottomWeakening.length) parts.push(`${c.weakening}：${data.bottomWeakening.map(row => row.sectorName ?? row.symbol).join('、')}。`);
  if (data.summary.averageRsi !== null) parts.push(`${c.averageRsi}：${number(locale, data.summary.averageRsi)}。`);
  const beta = data.betaAllocation;
  parts.push(`${c.suggestedPosture}：${localizeAllocationMode(beta.suggestedMode, locale)}。${localizePolicyExplanation(beta.explanation, locale)}`);
  if (beta.warnings.length) parts.push(`${c.warnings}：${beta.warnings.map(warning => localizePolicyWarning(warning, locale)).join(' ')}`);
  return parts.join(' ');
}

function signed(locale: string, value: number | null, digits = 2) {
  return formatMarketValue(locale, value, digits);
}

function integer(locale: string, value: number | null) {
  return value === null ? '—' : new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

function trendSegments(row: MarketRotationMonitorRow) {
  const segments: Array<Array<{ date: string; value: number }>> = [];
  let current: Array<{ date: string; value: number }> = [];
  for (const point of row.twoWeekTrend) {
    if (point.value === null || !Number.isFinite(point.value)) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push({ date: point.date, value: point.value });
    }
  }
  if (current.length) segments.push(current);
  return segments;
}

function trendPlot(row: MarketRotationMonitorRow) {
  const segments = trendSegments(row);
  const values = row.twoWeekTrend.flatMap(point => point.value === null || !Number.isFinite(point.value) ? [] : [point.value]);
  if (values.length < 2) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 96;
  const height = 28;
  const lastIndex = Math.max(row.twoWeekTrend.length - 1, 1);
  return segments.filter(segment => segment.length >= 2).map(segment => segment.map(point => {
    const index = row.twoWeekTrend.findIndex(item => item.date === point.date);
    const x = (index / lastIndex) * width;
    const y = height - ((point.value - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' '));
}

function trendText(locale: string, row: MarketRotationMonitorRow, unavailable: string) {
  if (row.twoWeekTrend.length < 2) return unavailable;
  const values = row.twoWeekTrend.map(point => point.value === null ? '—' : number(locale, point.value, 2));
  return values.join(' → ');
}

function csvCell(value: string | number | null | undefined) {
  return `"${String(value ?? '—').replaceAll('"', '""')}"`;
}

function escapeXml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function textUnits(value: string) {
  return Array.from(value).reduce((total, character) => total + (/[⺀-鿿豈-﫿＀-￯]/u.test(character) ? 2 : 1), 0);
}

function wrapText(value: string, maxWidth: number, measure: (text: string) => number = text => textUnits(text) * 7) {
  const lines: string[] = [];
  let line = '';
  let pendingSpace = false;
  for (const token of value.split(/(\s+)/u).filter(Boolean)) {
    if (/^\s+$/u.test(token)) {
      pendingSpace = true;
      continue;
    }
    let chunk = '';
    for (const character of Array.from(token)) {
      if (chunk && measure(`${chunk}${character}`) > maxWidth) {
        if (!line) line = chunk;
        else if (!pendingSpace && measure(`${line}${chunk}`) <= maxWidth) line += chunk;
        else if (pendingSpace && measure(`${line} ${chunk}`) <= maxWidth) line += ` ${chunk}`;
        else {
          lines.push(line);
          line = chunk;
        }
        chunk = '';
        pendingSpace = false;
      }
      chunk += character;
    }
    if (!chunk) continue;
    if (!line) line = chunk;
    else if (!pendingSpace && measure(`${line}${chunk}`) <= maxWidth) line += chunk;
    else if (pendingSpace && measure(`${line} ${chunk}`) <= maxWidth) line += ` ${chunk}`;
    else {
      lines.push(line);
      line = chunk;
    }
    pendingSpace = false;
  }
  if (line) lines.push(line);
  return lines.length ? lines : ['—'];
}

function copyCell(value: string) {
  return value.replace(/[\t\r\n]+/g, ' ').trim();
}

export default function MarketRotation() {
  const { locale, t } = useUi();
  const c = copy[locale];
  const [params, setParams] = useSearchParams();
  const scopeParam = params.get('scope');
  const scope: Scope = scopes.includes(scopeParam as Scope) ? scopeParam as Scope : 'sectors';
  const [data, setData] = useState<MarketRotationMonitorResponse | null>(null);
  const [state, setState] = useState<MarketStateSnapshot | null>(null);
  const [stateLoading, setStateLoading] = useState(true);
  const [history, setHistory] = useState<MarketStateHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyDays, setHistoryDays] = useState(30);
  const [stateError, setStateError] = useState<Failure | null>(null);
  const [historyError, setHistoryError] = useState<Failure | null>(null);
  const [error, setError] = useState<Failure | null>(null);
  const [filter, setFilter] = useState<RotationFilterKey>('all');
  const [sortField, setSortField] = useState<RotationSortField>('rotationRank');
  const [sortOrder, setSortOrder] = useState<RotationSortOrder>('asc');
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [copyText, setCopyText] = useState('');
  const [attempt, retry] = useState(0);
  const messages = useRef({ c, t });
  messages.current = { c, t };

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setState(null);
    setError(null);
    setStateError(null);
    setStateLoading(true);
    api.GET('/api/market/rotation-monitor', { params: { query: { scope } }, signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      const parsed = marketRotationMonitorResponseSchema.safeParse(result.data);
      if (result.response.ok && parsed.success) setData(parsed.data);
      else setError(apiFailure(result.error, messages.current.t('failed')));
    }).catch(() => {
      if (!controller.signal.aborted) setError(apiFailure(null, messages.current.t('connection')));
    });
    api.GET('/api/market/state/snapshot', { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      const parsed = marketStateSnapshotSchema.safeParse(result.data);
      if (result.response.ok && parsed.success) setState(parsed.data);
      else if (result.response.status !== 404) setStateError(apiFailure(result.error, messages.current.t('failed')));
    }).catch(() => {
      if (!controller.signal.aborted) setStateError(apiFailure(null, messages.current.t('connection')));
    }).finally(() => {
      if (!controller.signal.aborted) setStateLoading(false);
    });
    return () => controller.abort();
  }, [scope, attempt]);

  useEffect(() => {
    const controller = new AbortController();
    setHistory([]);
    setHistoryError(null);
    setHistoryLoading(true);
    api.GET('/api/market/state/history', { params: { query: { days: historyDays } }, signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      const parsed = marketStateHistoryResponseSchema.safeParse(result.data);
      if (result.response.ok && parsed.success) setHistory(parsed.data);
      else setHistoryError(apiFailure(result.error, messages.current.t('failed')));
    }).catch(() => {
      if (!controller.signal.aborted) setHistoryError(apiFailure(null, messages.current.t('connection')));
    }).finally(() => {
      if (!controller.signal.aborted) setHistoryLoading(false);
    });
    return () => controller.abort();
  }, [attempt, historyDays]);

  function changeScope(value: Scope) {
    setFilter('all');
    setParams(value === 'sectors' ? {} : { scope: value });
  }

  function changeSort(field: RotationSortField) {
    if (sortField === field) {
      setSortOrder(value => value === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortField(field);
    setSortOrder(field === 'symbol' || field === 'sectorName' || field === 'rotationRank' ? 'asc' : 'desc');
  }

  const ratio = (metric: { count: number; total: number; ratio: number | null }) => `${metric.count}/${metric.total} · ${percent(locale, metric.ratio)}`;
  const summaryText = data ? localizedSummary(data, c, locale) : '';
  const filteredRows = data ? filterAndSortRotationRows(data.rows, filter, sortField, sortOrder) : [];
  const historyAsOfDate = history[0]?.date ?? null;
  const historyStatus = historyLoading ? t('loading') : historyAsOfDate ? date(locale, historyAsOfDate) : historyError ? c.unavailable : c.noHistory;

  function exportRows() {
    return filteredRows.map(row => [
      row.symbol,
      row.sectorName ?? row.name,
      number(locale, row.lastPrice),
      number(locale, row.rsi14, 1),
      signed(locale, row.rsiDelta2W, 1),
      integer(locale, row.rotationRank),
      signed(locale, row.rankDelta2W, 0),
      signed(locale, row.twoWeekPerformancePct, 2),
      trendText(locale, row, c.insufficient),
      signed(locale, row.percentFromHigh, 2),
      maStatusLabels[locale][row.maStatus],
      rowLabel(row, c, locale),
    ] as const);
  }

  function exportHeaders() {
    return [c.symbol, c.name, c.price, c.rsi, c.rsiDelta, c.rank, c.rankDelta, c.performance, c.trend, c.fromHigh, c.maStatus, c.signal];
  }

  function exportMetadata() {
    return data ? [
      [c.currentSummary, summaryText],
      [c.marketState, stateLabel(data.marketState, locale)],
      [c.breadthCondition, breadthConditionLabels[locale][data.breadthCondition]],
      [c.breadthConfirmation, breadthConfirmationLabels[locale][data.breadthConfirmation]],
      [c.asOf, date(locale, data.asOfDate)],
      [c.comparison, date(locale, data.comparisonDate)],
      [c.scope, c[data.rankScope]],
      [c.filter, c[filterLabels[filter]]],
      [c.sortBy, `${c[sortFieldLabels[sortField]]} · ${sortOrder === 'asc' ? c.sortAscending : c.sortDescending}`],
      [c.marketStateAsOf, date(locale, data.marketStateAsOfDate)],
      [c.summaryAsOf, date(locale, data.summaryAsOfDate)],
    ] : [[c.currentSummary, c.unavailable]];
  }

  function downloadText(filename: string, content: string, mime: string) {
    const link = document.createElement('a');
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportCsv() {
    if (!data) return;
    const body = exportRows();
    const csvRows: Array<ReadonlyArray<string | number | null | undefined>> = [...exportMetadata().map(([label, value]) => [label, value]), [], exportHeaders(), ...body];
    const csv = csvRows
      .map(row => row.map(value => csvCell(value)).join(','))
      .join('\n');
    downloadText(`market-rotation-${data.asOfDate}.csv`, `\uFEFF${csv}`, 'text/csv;charset=utf-8');
    setCopyStatus(c.exportSuccess);
  }

  function copyTable() {
    const rows = exportRows();
    const text = rows.length
      ? rows.map(row => [row[0], row[1], `${c.rsi} ${row[3]}`, `${c.rank} ${row[5]}`, row[11]].map(copyCell).join('\t')).join('\n')
      : c.copyEmpty;
    setCopyText(text);
    if (!rows.length) {
      setCopyStatus(c.copyEmpty);
      return;
    }
    if (!navigator.clipboard?.writeText) {
      setCopyStatus(c.copyFailed);
      return;
    }
    navigator.clipboard.writeText(text).then(() => setCopyStatus(c.copySuccess)).catch(() => setCopyStatus(c.copyFailed));
  }

  async function exportPng() {
    if (!data) return;
    const snapshotAsOfDate = data.asOfDate;
    const snapshotTitle = c.title;
    const snapshotNoRows = c.noRows;
    const snapshotSuccess = c.exportSuccess;
    const snapshotFailure = c.exportFailed;
    const body = exportRows();
    const headers = exportHeaders();
    const metadata = exportMetadata();
    let objectUrl: string | null = null;
    try {
      const css = getComputedStyle(document.documentElement);
      const paletteValue = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
      const palette = {
        canvas: paletteValue('--canvas', '#f5f6f8'),
        surface: paletteValue('--surface', '#ffffff'),
        mutedSurface: paletteValue('--muted-surface', '#eef0f3'),
        text: paletteValue('--text', '#20242a'),
        muted: paletteValue('--muted', '#59616c'),
        border: paletteValue('--border', '#cbd0d7'),
        series1: paletteValue('--series-1', '#3569c8'),
        marketUp: paletteValue('--market-up', '#167044'),
        marketDown: paletteValue('--market-down', '#b62e3c'),
        marketFlat: paletteValue('--market-flat', '#59616c'),
      };
      const directionColor = (value: number | null | undefined) => {
        const direction = marketDirection(value);
        return direction === 'up' ? palette.marketUp : direction === 'down' ? palette.marketDown : direction === 'flat' ? palette.marketFlat : palette.text;
      };
      if (document.fonts?.ready) await document.fonts.ready;
      const columnWidths = [96, 240, 100, 90, 100, 80, 100, 180, 280, 100, 205, 170];
      const width = columnWidths.reduce((sum, value) => sum + value, 0) + 48;
      const lineHeight = 22;
      const fontFamily = "system-ui,-apple-system,'Noto Sans TC',sans-serif";
      const measureCanvas = document.createElement('canvas');
      const measureContext = measureCanvas.getContext('2d');
      if (!measureContext) throw new Error('Canvas is unavailable');
      const measureText = (value: string, size: number, weight: number) => {
        measureContext.font = `${weight} ${size}px ${fontFamily}`;
        return measureContext.measureText(value).width;
      };
      const textLine = (x: number, y: number, value: string, size: number, weight: number, color: string) => `<text x="${x}" y="${y}" font-family="${fontFamily}" font-size="${size}px" font-weight="${weight}" fill="${color}">${escapeXml(value)}</text>`;
      let cursorY = 24;
      const parts: string[] = [`<rect width="${width}" height="100%" fill="${palette.canvas}"/>`];
      parts.push(textLine(24, cursorY + 20, snapshotTitle, 18, 700, palette.text));
      cursorY += 44;
      for (const [label, value] of metadata) {
        const lines = wrapText(`${label}: ${value}`, width - 60, text => measureText(text, 14, 400));
        lines.forEach((line, index) => parts.push(textLine(24, cursorY + 18 + index * lineHeight, line, 14, 400, palette.muted)));
        cursorY += Math.max(22, lines.length * lineHeight + 4);
      }
      cursorY += 12;
      const tableX = 24;
      const headerLines = headers.map((header, index) => wrapText(header, columnWidths[index]! - 12, text => measureText(text, 14, 700)));
      const headerHeight = Math.max(40, Math.max(...headerLines.map(lines => lines.length)) * lineHeight + 14);
      parts.push(`<rect x="${tableX}" y="${cursorY}" width="${width - 48}" height="${headerHeight}" fill="${palette.mutedSurface}" stroke="${palette.border}"/>`);
      let x = tableX;
      headerLines.forEach((lines, index) => {
        lines.forEach((line, lineIndex) => parts.push(textLine(x + 6, cursorY + 18 + lineIndex * lineHeight, line, 14, 700, palette.text)));
        x += columnWidths[index]!;
      });
      cursorY += headerHeight;
      body.forEach((row, rowIndex) => {
        const linesByCell = row.map((value, index) => wrapText(String(value), Math.max(20, columnWidths[index]! - 12), text => measureText(text, 14, index === 0 ? 650 : 400)));
        const rowLines = Math.max(...linesByCell.map(lines => lines.length));
        const rowHeight = Math.max(38, rowLines * lineHeight + 12);
        parts.push(`<rect x="${tableX}" y="${cursorY}" width="${width - 48}" height="${rowHeight}" fill="${palette.surface}" stroke="${palette.border}"/>`);
        x = tableX;
        const source = filteredRows[rowIndex];
        row.forEach((value, index) => {
          const color = source && index === 4 ? directionColor(source.rsiDelta2W) : source && index === 6 ? directionColor(source.rankDelta2W) : source && index === 7 ? directionColor(source.twoWeekPerformancePct) : source && index === 8 ? palette.series1 : palette.text;
          linesByCell[index]!.forEach((line, lineIndex) => parts.push(textLine(x + 6, cursorY + 20 + lineIndex * lineHeight, line, 14, index === 0 ? 650 : 400, color)));
          x += columnWidths[index]!;
        });
        cursorY += rowHeight;
      });
      if (!body.length) {
        parts.push(textLine(tableX + 6, cursorY + 24, snapshotNoRows, 14, 400, palette.muted));
        cursorY += 38;
      }
      const height = cursorY + 24;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${parts.join('')}</svg>`;
      const image = new Image();
      const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
      objectUrl = svgUrl;
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('PNG image could not be rendered'));
        image.src = svgUrl;
      });
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas is unavailable');
      context.drawImage(image, 0, 0);
      const link = document.createElement('a');
      link.download = `market-rotation-${snapshotAsOfDate}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      setCopyStatus(snapshotSuccess);
    } catch {
      setCopyStatus(snapshotFailure);
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }

  return <section className="rotation-page">
    <header className="rotation-header">
      <div><h1>{c.title}</h1><p className="lede">{c.intro}</p></div>
      <label>{c.scope}<select aria-label={c.scope} value={scope} onChange={event => changeScope(event.target.value as Scope)}>{scopes.map(value => <option key={value} value={value}>{c[value]}</option>)}</select></label>
    </header>
    {error ? error.code === 'SYS_NOT_FOUND' ? <><p role="status">{c.empty}</p><button onClick={() => retry(value => value + 1)}>{t('retry')}</button></> : <><FailureNotice failure={error}/><button onClick={() => retry(value => value + 1)}>{t('retry')}</button></> : !data ? <p role="status">{t('loading')}</p> : <>
      <section className="rotation-meta" aria-label={c.asOf}>
        <p><span>{c.asOf}</span> <time dateTime={data.asOfDate}>{date(locale, data.asOfDate)}</time></p>
        <p><span>{c.marketStateAsOf}</span> <time dateTime={data.marketStateAsOfDate ?? undefined}>{date(locale, data.marketStateAsOfDate)}</time></p>
        <p><span>{c.summaryAsOf}</span> <time dateTime={data.summaryAsOfDate ?? undefined}>{date(locale, data.summaryAsOfDate)}</time></p>
        <p><span>{c.comparison}</span> {data.comparisonDate ? <time dateTime={data.comparisonDate}>{date(locale, data.comparisonDate)}</time> : c.noComparison}</p>
        <p className={data.dataQuality.isQualified ? 'rotation-quality rotation-quality-good' : 'rotation-quality'}>{data.dataQuality.isQualified ? c.qualified : c.partial}</p>
      </section>
      <section className="rotation-summary" aria-labelledby="rotation-summary-title">
        <div className="rotation-section-heading"><div><h2 id="rotation-summary-title">{c.currentSummary}</h2><p className="rotation-summary-meta">{c.breadthCondition}: {breadthConditionLabels[locale][data.breadthCondition]} · {c.breadthConfirmation}: {breadthConfirmationLabels[locale][data.breadthConfirmation]}</p><p className="rotation-summary-text">{summaryText}</p></div></div>
        <div className="rotation-state-note" aria-label={c.stateObservation}>
          {stateError ? <><FailureNotice failure={stateError}/><button onClick={() => retry(value => value + 1)}>{t('retry')}</button></> : stateLoading ? <span role="status">{t('loading')}</span> : <>
            <span>{state?.isStale || state?.marketState === 'unknown' || data.marketState === 'unknown' ? c.stateUnknown : c.stateFresh}</span>
            {state && <span>{c.stateCoverageAsOf}: {date(locale, state.date)} · {c.coverage}: {coverage(locale, state.coveragePct)}</span>}
            {!state && <span>{c.coverage}: —</span>}
            {state?.isStale && <span>{c.stateStale}</span>}
          </>}
        </div>
        <dl className="rotation-cards">
          <div><dt>{c.marketState}</dt><dd>{stateLabel(data.marketState, locale)}</dd></div>
          <div><dt>{c.above20d}</dt><dd>{ratio(data.summary.above20d)}</dd></div>
          <div><dt>{c.above50d}</dt><dd>{ratio(data.summary.above50d)}</dd></div>
          <div><dt>{c.averageRsi}</dt><dd>{number(locale, data.summary.averageRsi)}</dd></div>
        </dl>
      </section>
      <section className="rotation-leadership" aria-label={`${c.leaders} and ${c.weakening}`}>
        <article><h2>{c.leaders}</h2>{data.topImproving.length ? <ol>{data.topImproving.map(row => <li key={row.symbol}><strong>{row.sectorName ?? row.name}</strong><span className={marketClass(row.rotationScoreDelta2W)}>{row.symbol} · {signed(locale, row.rotationScoreDelta2W)} {c.change}</span></li>)}</ol> : <p className="muted">{c.noLeaders}</p>}</article>
        <article><h2>{c.weakening}</h2>{data.bottomWeakening.length ? <ol>{data.bottomWeakening.map(row => <li key={row.symbol}><strong>{row.sectorName ?? row.name}</strong><span className={marketClass(row.rotationScoreDelta2W)}>{row.symbol} · {signed(locale, row.rotationScoreDelta2W)} {c.change}</span></li>)}</ol> : <p className="muted">{c.noWeakening}</p>}</article>
      </section>
      <section className="rotation-history" aria-labelledby="rotation-history-title">
        <div className="rotation-section-heading">
          <div><h2 id="rotation-history-title">{c.history}</h2><p className="muted" role={historyLoading ? 'status' : undefined}>{historyStatus}</p></div>
          <label>{c.historyDays}<select value={historyDays} onChange={event => setHistoryDays(Number(event.target.value))}><option value={30}>{c.days30}</option><option value={90}>{c.days90}</option><option value={120}>{c.days120}</option></select></label>
        </div>
        {historyError ? <><FailureNotice failure={historyError}/><button onClick={() => retry(value => value + 1)}>{t('retry')}</button></> : historyLoading ? null : history.length ? <div className="rotation-history-scroll"><table data-testid="market-state-history"><caption className="sr-only">{c.history}</caption><thead><tr><th scope="col">{c.asOf}</th><th scope="col">{c.marketState}</th><th scope="col">{c.up4}</th><th scope="col">{c.down4}</th><th scope="col">{c.ratio10d}</th><th scope="col">{c.above40d}</th></tr></thead><tbody>{history.map(row => <tr key={row.date}><th scope="row"><time dateTime={row.date}>{date(locale, row.date)}</time></th><td>{historyStateLabel(row, locale)}</td><td>{coverage(locale, row.up4Pct)}</td><td>{coverage(locale, row.down4Pct)}</td><td>{number(locale, row.ratio10d)}</td><td>{coverage(locale, row.above40dPct)}</td></tr>)}</tbody></table></div> : null}
      </section>
      <section className="rotation-table-section" aria-labelledby="rotation-ranking-title">
        <div className="rotation-table-toolbar">
          <label>{c.filter}<select aria-label={c.filter} value={filter} onChange={event => setFilter(event.target.value as RotationFilterKey)}>{rotationFilterKeys.map(value => <option key={value} value={value}>{c[filterLabels[value]]}</option>)}</select></label>
          <span className="rotation-result-count">{filteredRows.length} {c.results}</span>
          {filter !== 'all' && <button type="button" className="rotation-inline-action" onClick={() => setFilter('all')}>{c.filterClear}</button>}
          <div className="rotation-export-actions">
            <button type="button" onClick={exportCsv}>{c.exportCsv}</button>
            <button type="button" onClick={copyTable}>{c.copyTable}</button>
            <button type="button" onClick={() => void exportPng()}>{c.exportPng}</button>
          </div>
        </div>
        {copyStatus && <p className="rotation-export-status" role="status">{copyStatus}</p>}
        {copyStatus === c.copyFailed && <textarea className="rotation-copy-fallback" readOnly value={copyText} aria-label={c.copyTable} rows={Math.min(8, Math.max(2, filteredRows.length))} />}
        <div className="rotation-comparison-note">
          <span>{c.comparisonWindow}: {data.comparisonDate ? `${date(locale, data.comparisonDate)} ${c.comparisonTo} ${date(locale, data.asOfDate)}` : c.comparisonUnavailable}</span>
        </div>
        <div className="rotation-table-scroll"><table data-testid="rotation-table"><caption className="sr-only">{c.ranking}</caption><thead><tr>
          {([
            ['symbol', c.symbol],
            ['sectorName', c.name],
            ['lastPrice', c.price],
            ['rsi14', c.rsi],
            ['rsiDelta2W', c.rsiDelta],
            ['rotationRank', c.rank],
            ['rankDelta2W', c.rankDelta],
            ['twoWeekPerformancePct', c.performance],
            ['percentFromHigh', c.fromHigh],
          ] as Array<[RotationSortField, string]>).map(([field, label]) => <th key={field} scope="col" aria-sort={sortField === field ? sortOrder === 'asc' ? 'ascending' : 'descending' : 'none'}><button type="button" className="rotation-sort-button" onClick={() => changeSort(field)}>{label}{sortField === field && <span aria-hidden="true"> {sortOrder === 'asc' ? '↑' : '↓'}</span>}</button></th>)}
          <th scope="col">{c.trend}</th><th scope="col">{c.maStatus}</th><th scope="col">{c.signal}</th>
        </tr></thead><tbody>{filteredRows.map(row => {
          const lines = trendPlot(row);
          return <tr key={row.symbol} data-testid="rotation-row">
            <th scope="row"><strong>{row.symbol}</strong></th>
            <td>{row.sectorName ?? row.name}</td>
            <td>{number(locale, row.lastPrice)}</td>
            <td>{number(locale, row.rsi14, 1)}</td>
            <td className={marketClass(row.rsiDelta2W)}>{signed(locale, row.rsiDelta2W, 1)}</td>
            <td>{integer(locale, row.rotationRank)}</td>
            <td className={marketClass(row.rankDelta2W)}>{signed(locale, row.rankDelta2W, 0)}</td>
            <td className={marketClass(row.twoWeekPerformancePct)}>{signed(locale, row.twoWeekPerformancePct, 2)}</td>
            <td><div className="rotation-trend-cell"><span className="sr-only">{trendText(locale, row, c.insufficient)}</span>{lines.length ? <svg viewBox="0 0 96 28" role="img" aria-label={c.trendAria.replace('{symbol}', row.symbol)}><title>{trendText(locale, row, c.insufficient)}</title>{lines.map((points, index) => <polyline key={index} points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />)}</svg> : <span className="muted">{c.insufficient}</span>}</div></td>
            <td>{maStatusLabels[locale][row.maStatus]}</td>
            <td><span className={`rotation-signal rotation-signal-${row.signalStatus}`}>{rowLabel(row, c, locale)}</span></td>
          </tr>;
        })}</tbody></table></div>
        {filteredRows.length === 0 && <p className="muted">{filter === 'all' ? c.empty : c.noRows}</p>}
      </section>
    </>}
  </section>;
}
