import type { Locale } from './destinations'

const copy = {
  en: {
    title: 'AI analysis', quarter: 'Reported quarter', loading: 'Loading the prepared quarter…',
    failed: 'Guru analysis is temporarily unavailable.', retry: 'Try again',
    facts: 'Prepared facts', interpretation: 'Interpretation', factLabel: 'Prepared fact', interpretationLabel: 'Interpretation',
    evidence: 'Cites', positions: 'Positions', caveats: 'What 13F cannot tell you', provenance: 'Generation record',
    sections: {
      executiveSummary: 'Executive summary', portfolioDirection: 'Portfolio direction', convictionPositions: 'Conviction positions',
      newPositions: 'New positions', increasedPositions: 'Increased positions', reducedPositions: 'Reduced positions',
      exitedPositions: 'Exited positions', sectorAndThemeChange: 'Sector and theme change', concentrationChange: 'Concentration change',
      turnoverInterpretation: 'Turnover', historicalContext: 'Historical context', consensusContext: 'Cross-Guru consensus',
      risks: 'Risks and caveats', takeaways: 'Takeaways',
    },
    states: {
      NOT_GENERATED: 'No analysis has been generated for this quarter. The prepared facts below are still available.',
      QUEUED: 'An analysis is queued for this quarter.',
      RUNNING: 'An analysis is being generated for this quarter.',
      READY: '',
      STALE: 'This analysis was generated from an earlier rebuild of the quarter. It is kept for audit and is no longer current.',
      FAILED: 'The last generation attempt did not complete. An administrator must request it again.',
      BLOCKED_BY_COVERAGE: 'This quarter is not prepared yet, so no analysis can be generated from it.',
    },
    provenanceLabels: {
      runId: 'Generation', status: 'Status', prompt: 'Prompt', promptVersion: 'Prompt version', provider: 'Provider', model: 'Model',
      inputHash: 'Structured input hash', analytics: 'Analytics version', consensus: 'Consensus version', schema: 'Output schema',
      tokens: 'Tokens in / out', latency: 'Latency', generatedAt: 'Generated', queuedAt: 'Queued', error: 'Error', source: 'Prompt source', resultState: 'Result state',
    },
    coverage: 'Coverage', mappingCoverage: 'Mapping coverage', comparison: 'Comparison', consensusAvailable: 'Consensus',
    available: 'Available', unavailable: 'Unavailable', history: 'Previous generations', noHistory: 'No previous generations.',
    disclosed: '13F holdings are delayed quarter-end disclosures and may not represent the manager’s current or complete portfolio.',
    sourceLabel: 'SEC source', noFacts: 'No prepared facts are available for this quarter yet.',
  },
  'zh-TW': {
    title: 'AI 分析', quarter: '申報季度', loading: '正在載入已整理的季度資料…',
    failed: '暫時無法載入大師 AI 分析。', retry: '重試',
    facts: '已整理事實', interpretation: '解讀', factLabel: '已整理事實', interpretationLabel: '解讀',
    evidence: '引用', positions: '相關持倉', caveats: '13F 無法回答的事', provenance: '生成紀錄',
    sections: {
      executiveSummary: '重點摘要', portfolioDirection: '組合方向', convictionPositions: '高信心持倉',
      newPositions: '新建持倉', increasedPositions: '增加持倉', reducedPositions: '減少持倉',
      exitedPositions: '清空持倉', sectorAndThemeChange: '產業與主題變化', concentrationChange: '集中度變化',
      turnoverInterpretation: '換手解讀', historicalContext: '歷史脈絡', consensusContext: '跨大師共識',
      risks: '風險與限制', takeaways: '結論',
    },
    states: {
      NOT_GENERATED: '本季度尚未生成分析。以下仍會顯示已整理的事實。',
      QUEUED: '本季度的分析已排入佇列。',
      RUNNING: '本季度的分析正在生成。',
      READY: '',
      STALE: '這份分析來自較早的季度重建版本，僅保留供稽核，已非最新。',
      FAILED: '上一次生成未完成，需由管理員重新要求。',
      BLOCKED_BY_COVERAGE: '本季度資料尚未整理完成，無法據此生成分析。',
    },
    provenanceLabels: {
      runId: '生成編號', status: '狀態', prompt: '提示詞', promptVersion: '提示詞版本', provider: '供應商', model: '模型',
      inputHash: '結構化輸入雜湊', analytics: '分析版本', consensus: '共識版本', schema: '輸出結構',
      tokens: '輸入／輸出 token', latency: '延遲', generatedAt: '生成時間', queuedAt: '排入時間', error: '錯誤', source: '提示詞來源', resultState: '結果狀態',
    },
    coverage: '覆蓋狀況', mappingCoverage: '映射覆蓋率', comparison: '比較狀態', consensusAvailable: '共識資料',
    available: '可用', unavailable: '不可用', history: '歷次生成', noHistory: '尚無歷次生成紀錄。',
    disclosed: '13F 是延遲發布的季末持倉披露，未必反映管理人目前或完整的投資組合。',
    sourceLabel: 'SEC 來源', noFacts: '本季度尚無已整理的事實資料。',
  },
  'zh-CN': {
    title: 'AI 分析', quarter: '申报季度', loading: '正在加载整理完成的季度数据…',
    failed: '暂时无法加载大师 AI 分析。', retry: '重试',
    facts: '整理事实', interpretation: '解读', factLabel: '整理事实', interpretationLabel: '解读',
    evidence: '引用', positions: '相关持仓', caveats: '13F 无法回答的事', provenance: '生成记录',
    sections: {
      executiveSummary: '重点摘要', portfolioDirection: '组合方向', convictionPositions: '高信心持仓',
      newPositions: '新建持仓', increasedPositions: '增加持仓', reducedPositions: '减少持仓',
      exitedPositions: '清空持仓', sectorAndThemeChange: '行业与主题变化', concentrationChange: '集中度变化',
      turnoverInterpretation: '换手解读', historicalContext: '历史脉络', consensusContext: '跨大师共识',
      risks: '风险与限制', takeaways: '结论',
    },
    states: {
      NOT_GENERATED: '本季度尚未生成分析。以下仍会显示整理完成的事实。',
      QUEUED: '本季度的分析已排入队列。',
      RUNNING: '本季度的分析正在生成。',
      READY: '',
      STALE: '这份分析来自较早的季度重建版本，仅保留供审计，已非最新。',
      FAILED: '上一次生成未完成，需由管理员重新请求。',
      BLOCKED_BY_COVERAGE: '本季度数据尚未整理完成，无法据此生成分析。',
    },
    provenanceLabels: {
      runId: '生成编号', status: '状态', prompt: '提示词', promptVersion: '提示词版本', provider: '供应商', model: '模型',
      inputHash: '结构化输入哈希', analytics: '分析版本', consensus: '共识版本', schema: '输出结构',
      tokens: '输入／输出 token', latency: '延迟', generatedAt: '生成时间', queuedAt: '排入时间', error: '错误', source: '提示词来源', resultState: '结果状态',
    },
    coverage: '覆盖状况', mappingCoverage: '映射覆盖率', comparison: '比较状态', consensusAvailable: '共识数据',
    available: '可用', unavailable: '不可用', history: '历次生成', noHistory: '暂无历次生成记录。',
    disclosed: '13F 是延迟发布的季末持仓披露，不一定反映管理人当前或完整的投资组合。',
    sourceLabel: 'SEC 来源', noFacts: '本季度暂无整理完成的事实数据。',
  },
}

export type GuruAnalysisCopy = typeof copy['en']

export function guruAnalysisCopy(locale: Locale): GuruAnalysisCopy {
  return copy[locale]
}
