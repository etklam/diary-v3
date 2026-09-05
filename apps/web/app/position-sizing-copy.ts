import type { PositionSizingStrategyId, PositionSizingRounding } from '@diary/domain/position-sizing'

export type PositionSizingLocale = 'en' | 'zh-TW' | 'zh-CN'
type PositionSizingCopy = {
  title: string
  intro: string
  inputs: string
  capital: string
  price: string
  reserve: string
  symbol: string
  context: string
  strategy: string
  rounding: string
  down: string
  nearest: string
  up: string
  calculateHint: string
  invalid: string
  results: string
  invested: string
  shares: string
  averagePrice: string
  reserveCash: string
  unallocatedCash: string
  remainingCash: string
  batches: string
  ratio: string
  planned: string
  wholeShares: string
  actual: string
  cumulativeShares: string
  cumulativeAmount: string
  warning: string
  utilization: string
  overBudget: string
  failure: string
  signIn: string
  ratioWarning: string
  adjustedLast: string
  priceHigh: string
  noShares: string
  copy: string
  copied: string
  copyFailed: string
  markdown: string
  saveActions: string
  saveNew: string
  appendToday: string
  diarySaved: string
  tradePlan: string
  tradePlanReady: string
  strategyNames: Record<PositionSizingStrategyId, string>
  strategyDescriptions: Record<PositionSizingStrategyId, string>
  roundingNames: Record<PositionSizingRounding, string>
  savedCopyLabel: string
}

export const positionSizingCopy: Record<PositionSizingLocale, PositionSizingCopy> = {
  en: {
    title: 'Position sizing', intro: 'Split a planned position into whole-share batches without changing your ledger.', inputs: 'Inputs', capital: 'Available capital', price: 'Intended stock price', reserve: 'Reserve cash', symbol: 'Symbol (optional)', context: 'Context (optional)', strategy: 'Strategy', rounding: 'Rounding', down: 'Round down', nearest: 'Nearest whole share', up: 'Round up', calculateHint: 'This is a hypothetical price; no live quote is requested.', invalid: 'Enter a positive capital amount and stock price to calculate.', results: 'Results', invested: 'Invested amount', shares: 'Total shares', averagePrice: 'Average price', utilization: 'Capital utilization', reserveCash: 'Reserved cash', unallocatedCash: 'Unallocated cash', remainingCash: 'Total remaining cash', batches: 'Batch breakdown', ratio: 'Ratio', planned: 'Planned amount', wholeShares: 'Whole shares', actual: 'Actual amount', cumulativeShares: 'Cumulative shares', cumulativeAmount: 'Cumulative amount', warning: 'Warnings', overBudget: 'Over budget', failure: 'The action could not be completed. Your inputs remain here; try again.', signIn: 'Sign in', ratioWarning: 'Strategy ratios total {sum}%, not 100%.', adjustedLast: 'Final batch shares were adjusted to avoid exceeding the budget.', priceHigh: 'Stock price is too high to buy one whole share with available capital.', noShares: 'Available capital cannot buy one whole share in any batch.', copy: 'Copy Markdown', copied: 'Markdown copied.', copyFailed: 'Clipboard unavailable. Select the Markdown below to copy it.', markdown: 'Position sizing Markdown', saveActions: 'Record this decision', saveNew: 'Save as new Diary', appendToday: "Append to today's Diary", diarySaved: 'Diary saved.', tradePlan: 'Prepare Trade Plan', tradePlanReady: 'Trade Plan prefilled.', savedCopyLabel: 'Selectable Markdown', strategyNames: { pyramid: 'Pyramid', 'pyramid-variant': 'Pyramid variant', rectangular: 'Rectangular', 'inverted-pyramid': 'Inverted pyramid' }, strategyDescriptions: { pyramid: 'Larger first batches, then smaller additions.', 'pyramid-variant': 'A five-batch pyramid with a larger middle allocation.', rectangular: 'Equal core batches with a smaller final batch.', 'inverted-pyramid': 'Start small and increase each batch.' }, roundingNames: { down: 'Round down', nearest: 'Nearest whole share', up: 'Round up' },
  },
  'zh-TW': {
    title: '部位計算', intro: '把預計部位分成整股批次，不會修改交易帳本。', inputs: '輸入條件', capital: '可用資金', price: '預計股價', reserve: '保留現金', symbol: '標的代號（選填）', context: '背景（選填）', strategy: '策略', rounding: '整股處理', down: '無條件捨去', nearest: '四捨五入', up: '無條件進位', calculateHint: '這是自行輸入的假設價格，不會查詢即時報價。', invalid: '請輸入大於零的資金及股價以開始計算。', results: '計算結果', invested: '實際投入', shares: '總股數', averagePrice: '平均價格', utilization: '資金使用率', reserveCash: '策略保留', unallocatedCash: '整股剩餘', remainingCash: '總剩餘現金', batches: '分批明細', ratio: '比例', planned: '計劃金額', wholeShares: '整股數', actual: '實際金額', cumulativeShares: '累計股數', cumulativeAmount: '累計金額', warning: '提醒', overBudget: '超過可用預算', failure: '操作未完成，輸入仍保留，請再試一次。', signIn: '登入', ratioWarning: '策略比例合計為 {sum}%，不是 100%。', adjustedLast: '最後一批股數已調整，以免超過可用預算。', priceHigh: '股價過高，可用資金不足以買入一股。', noShares: '可用資金不足以在任何批次買入一股。', copy: '複製 Markdown', copied: 'Markdown 已複製。', copyFailed: '無法使用剪貼簿，請選取下方 Markdown 複製。', markdown: '部位計算 Markdown', saveActions: '記錄這個判斷', saveNew: '儲存為新日記', appendToday: '追加至今天日記', diarySaved: '日記已儲存。', tradePlan: '準備交易計劃', tradePlanReady: '交易計劃已預填。', savedCopyLabel: '可選取的 Markdown', strategyNames: { pyramid: '金字塔', 'pyramid-variant': '金字塔變體', rectangular: '矩形', 'inverted-pyramid': '倒金字塔' }, strategyDescriptions: { pyramid: '前段批次較大，之後逐步減少。', 'pyramid-variant': '五批次配置，中間批次較大。', rectangular: '前三批接近相等，最後一批較小。', 'inverted-pyramid': '從小批次開始，逐批增加。' }, roundingNames: { down: '無條件捨去', nearest: '四捨五入', up: '無條件進位' },
  },
  'zh-CN': {
    title: '仓位计算', intro: '把计划仓位分成整股批次，不会修改交易账本。', inputs: '输入条件', capital: '可用资金', price: '预计股价', reserve: '保留现金', symbol: '标的代码（选填）', context: '背景（选填）', strategy: '策略', rounding: '整股处理', down: '向下取整', nearest: '四舍五入', up: '向上取整', calculateHint: '这是自行输入的假设价格，不会查询实时行情。', invalid: '请输入大于零的资金和股价开始计算。', results: '计算结果', invested: '实际投入', shares: '总股数', averagePrice: '平均价格', utilization: '资金使用率', reserveCash: '策略保留', unallocatedCash: '整股剩余', remainingCash: '总剩余现金', batches: '分批明细', ratio: '比例', planned: '计划金额', wholeShares: '整股数', actual: '实际金额', cumulativeShares: '累计股数', cumulativeAmount: '累计金额', warning: '提醒', overBudget: '超过可用预算', failure: '操作未完成，输入仍保留，请再试一次。', signIn: '登录', ratioWarning: '策略比例合计为 {sum}%，不是 100%。', adjustedLast: '最后一批股数已调整，以免超过可用预算。', priceHigh: '股价过高，可用资金不足以买入一股。', noShares: '可用资金不足以在任何批次买入一股。', copy: '复制 Markdown', copied: 'Markdown 已复制。', copyFailed: '无法使用剪贴板，请选择下方 Markdown 复制。', markdown: '仓位计算 Markdown', saveActions: '记录这个判断', saveNew: '保存为新日记', appendToday: '追加至今天日记', diarySaved: '日记已保存。', tradePlan: '准备交易计划', tradePlanReady: '交易计划已预填。', savedCopyLabel: '可选择的 Markdown', strategyNames: { pyramid: '金字塔', 'pyramid-variant': '金字塔变体', rectangular: '矩形', 'inverted-pyramid': '倒金字塔' }, strategyDescriptions: { pyramid: '前段批次较大，之后逐步减少。', 'pyramid-variant': '五批次配置，中间批次较大。', rectangular: '前三批接近相等，最后一批较小。', 'inverted-pyramid': '从小批次开始，逐批增加。' }, roundingNames: { down: '向下取整', nearest: '四舍五入', up: '向上取整' },
  },
}
