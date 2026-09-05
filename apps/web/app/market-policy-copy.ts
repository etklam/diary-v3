export type PolicyLocale = 'en' | 'zh-TW' | 'zh-CN'

const labels: Record<PolicyLocale, { states: Record<string, string>; modes: Record<string, string> }> = {
  en: {
    states: { risk_on: 'Risk-on', neutral: 'Neutral', defensive: 'Defensive', risk_off: 'Risk-off', unknown: 'Unknown' },
    modes: { aggressive: 'Aggressive', balanced: 'Balanced', defensive: 'Defensive', capital_preservation: 'Capital preservation', unknown: 'Unknown' },
  },
  'zh-TW': {
    states: { risk_on: '風險偏好', neutral: '中性', defensive: '防禦', risk_off: '風險規避', unknown: '未知' },
    modes: { aggressive: '積極', balanced: '平衡', defensive: '防禦', capital_preservation: '資本保全', unknown: '未知' },
  },
  'zh-CN': {
    states: { risk_on: '风险偏好', neutral: '中性', defensive: '防御', risk_off: '风险规避', unknown: '未知' },
    modes: { aggressive: '积极', balanced: '平衡', defensive: '防御', capital_preservation: '资本保全', unknown: '未知' },
  },
}

const explanationCopy: Record<string, Record<'zh-TW' | 'zh-CN', string>> = {
  'Market is risk-on with confirming breadth. Suggested posture is aggressive: maintain high beta exposure, but avoid chasing extended names.': {
    'zh-TW': '市場處於風險偏好，市場廣度確認。建議採取積極姿態：維持高 beta 曝險，但避免追逐過度延伸的標的。',
    'zh-CN': '市场处于风险偏好，市场广度确认。建议采取积极姿态：维持高 beta 敞口，但避免追逐过度延伸的标的。',
  },
  'Market is risk-on but breadth is mixed. Balanced posture: keep core exposure, trim extended high beta into strength.': {
    'zh-TW': '市場處於風險偏好，但市場廣度混合。建議採取平衡姿態：維持核心曝險，趁高位減少過度延伸的高 beta 部位。',
    'zh-CN': '市场处于风险偏好，但市场广度混合。建议采取平衡姿态：维持核心敞口，在走强时减少过度延伸的高 beta 部位。',
  },
  'Market is risk-on yet breadth warns of divergence. Drift toward balanced; do not add high beta on weakness.': {
    'zh-TW': '市場處於風險偏好，但市場廣度警示背離。逐步轉向平衡；弱勢時不要增加高 beta。',
    'zh-CN': '市场处于风险偏好，但市场广度警示背离。逐步转向平衡；弱势时不要增加高 beta。',
  },
  'Market is risk-on but breadth confirmation is missing. Balanced posture until breadth clarifies.': {
    'zh-TW': '市場處於風險偏好，但缺少市場廣度確認。在廣度明朗前維持平衡姿態。',
    'zh-CN': '市场处于风险偏好，但缺少市场广度确认。在广度明朗前维持平衡姿态。',
  },
  'Market is neutral with constructive breadth. Balanced posture; favor index core over high beta chasing.': {
    'zh-TW': '市場中性，市場廣度具建設性。維持平衡姿態；偏好指數核心，避免追逐高 beta。',
    'zh-CN': '市场中性，市场广度具有建设性。维持平衡姿态；偏好指数核心，避免追逐高 beta。',
  },
  'Market is neutral with mixed breadth. Balanced posture; reduce high beta tilt, keep core index exposure.': {
    'zh-TW': '市場中性，市場廣度混合。維持平衡姿態；降低高 beta 偏向，保留核心指數曝險。',
    'zh-CN': '市场中性，市场广度混合。维持平衡姿态；降低高 beta 偏向，保留核心指数敞口。',
  },
  'Market is neutral but breadth is deteriorating. Defensive tilt: cut high beta, raise cash buffer.': {
    'zh-TW': '市場中性，但市場廣度正在惡化。轉向防禦：降低高 beta，增加現金緩衝。',
    'zh-CN': '市场中性，但市场广度正在恶化。转向防御：降低高 beta，增加现金缓冲。',
  },
  'Market is neutral with unclear breadth. Balanced posture pending confirmation.': {
    'zh-TW': '市場中性，市場廣度不明。在確認前維持平衡姿態。',
    'zh-CN': '市场中性，市场广度不明。在确认前维持平衡姿态。',
  },
  'Market posture is defensive, though breadth still confirms. Balanced-lite: modest high beta, larger core + cash.': {
    'zh-TW': '市場姿態防禦，但市場廣度仍確認。採取偏平衡：少量高 beta，加大核心及現金。',
    'zh-CN': '市场姿态防御，但市场广度仍确认。采取偏平衡：少量高 beta，增加核心及现金。',
  },
  'Market is defensive with mixed breadth. Defensive posture: minimal high beta, emphasize core and cash.': {
    'zh-TW': '市場防禦，市場廣度混合。採取防禦姿態：高 beta 維持最低，偏重核心及現金。',
    'zh-CN': '市场防御，市场广度混合。采取防御姿态：高 beta 维持最低，偏重核心及现金。',
  },
  'Market is defensive and breadth is warning. Defensive posture: high beta to cash proxy, raise cash aggressively.': {
    'zh-TW': '市場防禦，市場廣度發出警示。採取防禦姿態：將高 beta 轉向現金替代資產，大幅提高現金配置。',
    'zh-CN': '市场防御，市场广度发出警示。采取防御姿态：将高 beta 转向现金替代资产，大幅提高现金配置。',
  },
  'Market is defensive with unclear breadth. Defensive posture as a precaution.': {
    'zh-TW': '市場防禦，市場廣度不明。基於預防採取防禦姿態。',
    'zh-CN': '市场防御，市场广度不明。基于预防采取防御姿态。',
  },
  'Market is risk-off. Capital preservation mode: raise cash, reduce high beta to zero.': {
    'zh-TW': '市場處於風險規避。採取資本保全模式：提高現金，將高 beta 降至零。',
    'zh-CN': '市场处于风险规避。采取资本保全模式：提高现金，将高 beta 降至零。',
  },
  'Market is risk-off, breadth mixed. Capital preservation mode; do not add risk.': {
    'zh-TW': '市場處於風險規避，市場廣度混合。採取資本保全模式；不要增加風險。',
    'zh-CN': '市场处于风险规避，市场广度混合。采取资本保全模式；不要增加风险。',
  },
  'Market is risk-off, breadth deteriorating fast. Maximum capital preservation: highest cash allocation.': {
    'zh-TW': '市場處於風險規避，市場廣度快速惡化。最大化資本保全：採取最高現金配置。',
    'zh-CN': '市场处于风险规避，市场广度快速恶化。最大化资本保全：采取最高现金配置。',
  },
  'Market is risk-off with unclear breadth. Capital preservation mode.': {
    'zh-TW': '市場處於風險規避，市場廣度不明。採取資本保全模式。',
    'zh-CN': '市场处于风险规避，市场广度不明。采取资本保全模式。',
  },
  'Market regime is unclear despite confirming breadth. Balanced posture; await regime resolution.': {
    'zh-TW': '市場狀態不明，儘管市場廣度確認。維持平衡姿態，等待市場狀態明朗。',
    'zh-CN': '市场状态不明，尽管市场广度确认。维持平衡姿态，等待市场状态明朗。',
  },
  'Market regime unclear, breadth mixed. Balanced posture; no high-confidence allocation.': {
    'zh-TW': '市場狀態不明，市場廣度混合。維持平衡姿態，不作高信心配置。',
    'zh-CN': '市场状态不明，市场广度混合。维持平衡姿态，不作高信心配置。',
  },
  'Market regime unclear and breadth warns. Defensive tilt; reduce high beta exposure.': {
    'zh-TW': '市場狀態不明，市場廣度發出警示。轉向防禦，降低高 beta 曝險。',
    'zh-CN': '市场状态不明，市场广度发出警示。转向防御，降低高 beta 敞口。',
  },
  'Market regime unclear. No high-confidence allocation. Default to balanced cash position.': {
    'zh-TW': '市場狀態不明，沒有高信心配置。預設採取平衡的現金配置。',
    'zh-CN': '市场状态不明，没有高信心配置。默认采取平衡的现金配置。',
  },
  'Market regime unclear. No market regime data available. Showing current exposure only.': {
    'zh-TW': '市場狀態不明，沒有可用的市場狀態資料。只顯示目前曝險。',
    'zh-CN': '市场状态不明，没有可用的市场状态数据。只显示当前敞口。',
  },
}

export function localizeMarketState(value: string, locale: PolicyLocale): string {
  return labels[locale].states[value] ?? value
}

export function localizeAllocationMode(value: string, locale: PolicyLocale): string {
  return labels[locale].modes[value] ?? value
}

export function localizePolicyExplanation(value: string, locale: PolicyLocale): string {
  return locale === 'en' ? value : explanationCopy[value]?.[locale] ?? value
}

export function localizePolicyWarning(value: string, locale: PolicyLocale): string {
  if (locale === 'en') return value
  const weakBreadth = value.match(/^Weak breadth ratio: (.+)% of names above 50-day SMA despite confirmation\.$/)
  if (weakBreadth) return locale === 'zh-TW' ? `市場廣度比例偏弱：儘管已有確認，只有 ${weakBreadth[1]}% 的標的高於 50 日均線。` : `市场广度比例偏弱：尽管已有确认，只有 ${weakBreadth[1]}% 的标的高于 50 日均线。`
  const rsi = value.match(/^Average RSI at (.+) is overbought \(> 70\); pullback risk elevated\.$/)
  if (rsi) return locale === 'zh-TW' ? `平均 RSI 為 ${rsi[1]}，處於超買（> 70）；回調風險升高。` : `平均 RSI 为 ${rsi[1]}，处于超买（> 70）；回调风险升高。`
  if (value === 'Conflicting signals (contradiction): risk-on regime with warning breadth. Size high beta conservatively.') return locale === 'zh-TW' ? '訊號互相矛盾：市場處於風險偏好但市場廣度發出警示。高 beta 部位應保守配置。' : '信号互相矛盾：市场处于风险偏好但市场广度发出警示。高 beta 部位应保守配置。'
  if (value === 'No leadership confirmed: top improving list is empty; trend lacks a leader.') return locale === 'zh-TW' ? '未確認領導群組：改善幅度最大的清單為空，趨勢缺少領導者。' : '未确认领导群组：改善幅度最大的清单为空，趋势缺少领导者。'
  const weakLeadership = value.match(/^Leadership ETF under pressure \(weakening\): (.+)\. Broad-market follow-through at risk\.$/)
  if (weakLeadership) return locale === 'zh-TW' ? `領導 ETF 承受壓力（轉弱）：${weakLeadership[1]}。大市跟進動能有風險。` : `领导 ETF 承受压力（转弱）：${weakLeadership[1]}。大市跟进动能有风险。`
  return value
}
