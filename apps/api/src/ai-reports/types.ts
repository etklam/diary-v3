import type { AiReportCoverage, AiReportMetric, AiReportSourceState, AiReportType } from '@diary/contracts/ai-reports'
import type { Database } from '@diary/db'

export type AiDb = Database

export interface ReportContextSource {
  alias: string
  sourceType: 'diary' | 'transaction' | 'discipline' | 'holding'
  sourceId: string
  contentHash: string
  dependency: boolean
}

export interface BuiltReportContext {
  period: {
    periodType: AiReportType
    periodStart: string
    periodEndExclusive: string
    isPartialPeriod: boolean
    timezone: string
  }
  coverage: AiReportCoverage
  metrics: AiReportMetric[]
  sources: ReportContextSource[]
  context: unknown
  inputSnapshotHash: string
  dataRevision: number
}

export interface BuildReportContextInput {
  userId: bigint
  periodType: AiReportType
  periodStart: string
  timezone: string
  locale: 'zh-TW' | 'zh-CN' | 'en'
  capturedAt: Date
}

export type ReportContextBuilder = (input: BuildReportContextInput) => Promise<BuiltReportContext>

export interface AiReportConfigSnapshot {
  id: bigint
  revision: number
  baseUrl: string
  model: string
  thinking: 'enabled' | 'disabled'
  maxInputTokens: number
  maxOutputTokens: number
  timeoutMs: number
  recipientRevision: number
  recipientName: string
  disclosureVersion: string
  pricingCurrency: string
  pricingVersion: string | null
  reservationCostCents: number
  encryptedApiKey: string | null
}

export interface AiPromptSnapshot {
  id: bigint
  reportType: AiReportType
  revision: number
  template: string
}

export type ReportSourceState = AiReportSourceState
