import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { secFilingDetailSchema, type SecFilingDetail } from '@diary/contracts/sec-filings'
import { api, useUi } from '../ui'
import { apiFailure, FailureNotice, type Failure } from '../api-error'
import { MarketResearchCapture } from '../market-research-capture'
import './sec-filings.css'

const copy = {
  en: { title: 'SEC filings', back: 'Back to filings', loading: 'Loading filing…', failed: 'SEC filing detail is temporarily unavailable.', retry: 'Try again', filed: 'Filed', reportPeriod: 'Report period', accession: 'Accession', amendment: 'Amendment', documents: 'Documents', description: 'Description', type: 'Type', size: 'Size', download: 'Download', downloadZip: 'Download all as ZIP', noPdf: 'This filing does not include a PDF. The original submitted files remain available below.', unavailable: 'Not provided', primary: 'Primary', complete: 'Complete submission', captureTitle: (form: string, accession: string) => `SEC ${form} · ${accession}`, captureSummary: (detail: SecFilingDetail) => `SEC filing ${detail.filing.form} filed ${detail.filing.filingDate}. Accession ${detail.filing.accession}. Report period: ${detail.filing.reportDate ?? 'not provided'}.`,
  },
  'zh-TW': { title: 'SEC 申報', back: '返回申報', loading: '正在載入申報…', failed: 'SEC 申報詳情暫時無法使用。', retry: '重試', filed: '申報日期', reportPeriod: '報告期', accession: 'Accession', amendment: '修訂', documents: '文件', description: '說明', type: '類型', size: '大小', download: '下載', downloadZip: '下載全部 ZIP', noPdf: '此申報沒有 PDF；下方仍提供官方提交檔案。', unavailable: '未提供', primary: '主要文件', complete: '完整提交檔案', captureTitle: (form: string, accession: string) => `SEC ${form}・${accession}`, captureSummary: (detail: SecFilingDetail) => `SEC ${detail.filing.form} 申報日期為 ${detail.filing.filingDate}，Accession ${detail.filing.accession}。報告期：${detail.filing.reportDate ?? '未提供'}。`,
  },
  'zh-CN': { title: 'SEC 申报', back: '返回申报', loading: '正在加载申报…', failed: 'SEC 申报详情暂时无法使用。', retry: '重试', filed: '申报日期', reportPeriod: '报告期', accession: 'Accession', amendment: '修订', documents: '文件', description: '说明', type: '类型', size: '大小', download: '下载', downloadZip: '下载全部 ZIP', noPdf: '此申报没有 PDF；下方仍提供官方提交文件。', unavailable: '未提供', primary: '主要文件', complete: '完整提交文件', captureTitle: (form: string, accession: string) => `SEC ${form}・${accession}`, captureSummary: (detail: SecFilingDetail) => `SEC ${detail.filing.form} 申报日期为 ${detail.filing.filingDate}，Accession ${detail.filing.accession}。报告期：${detail.filing.reportDate ?? '未提供'}。`,
  },
} as const

function formatBytes(value: number, locale: string) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / 1024)} KB`
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / (1024 * 1024))} MB`
}

function documentHref(cik: string, accession: string, basename: string) {
  return `/api/tools/sec-filings/companies/${encodeURIComponent(cik)}/filings/${encodeURIComponent(accession)}/documents/${encodeURIComponent(basename)}`
}

export default function SecFilingDetailRoute() {
  const { locale } = useUi()
  const c = copy[locale]
  const { cik = '', accession = '' } = useParams()
  const [detail, setDetail] = useState<SecFilingDetail | null>(null)
  const [pending, setPending] = useState(true)
  const [error, setError] = useState<Failure | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setPending(true); setError(null); setDetail(null)
    api.GET('/api/tools/sec-filings/companies/{cik}/filings/{accession}', { params: { path: { cik, accession } }, signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return
      const parsed = secFilingDetailSchema.safeParse(result.data?.data)
      if (!result.response.ok || !parsed.success) setError(apiFailure(result.error, c.failed))
      else setDetail(parsed.data)
    }).catch(() => { if (!controller.signal.aborted) setError({ message: c.failed, fields: [] }) }).finally(() => { if (!controller.signal.aborted) setPending(false) })
    return () => controller.abort()
  }, [c.failed, cik, accession, attempt])

  const packageHref = `/api/tools/sec-filings/companies/${encodeURIComponent(cik)}/filings/${encodeURIComponent(accession)}/package?include=all`
  return <section className="sec-filings-page sec-filing-detail"><Link to="/tools/sec-filings" className="sec-back">← {c.back}</Link>
    {pending && <p role="status">{c.loading}</p>}
    {error && <><FailureNotice failure={error} id="sec-filing-detail-error" /><button type="button" className="secondary" onClick={() => setAttempt(value => value + 1)}>{c.retry}</button></>}
    {detail && <>
      <header className="sec-detail-header"><div><p className="sec-filings-kicker">{detail.company.name}</p><h1>{detail.filing.form}{detail.filing.isAmendment ? ` · ${c.amendment}` : ''}</h1><p>{c.accession} {detail.filing.accession}</p><p>{c.filed} <time dateTime={detail.filing.filingDate}>{detail.filing.filingDate}</time> · {c.reportPeriod} {detail.filing.reportDate ?? c.unavailable}</p></div><a href={packageHref} className="sec-primary-action">{c.downloadZip}</a></header>
      {!detail.hasPdf && <p className="sec-filings-note">{c.noPdf}</p>}
      <section className="sec-filings-section" aria-labelledby="sec-documents-title"><h2 id="sec-documents-title">{c.documents} · {detail.documents.length}</h2><div className="sec-document-list">{detail.documents.map(document => <article className="sec-document-row" key={document.basename}><div><h3>{document.basename}</h3><p>{document.description ?? c.unavailable} · {document.type ?? c.unavailable}</p><p>{document.classification}{document.isPrimary ? ` · ${c.primary}` : ''}{document.classification === 'complete-submission' ? ` · ${c.complete}` : ''} · {formatBytes(document.size, locale)}</p></div><a href={documentHref(cik, accession, document.basename)} download>{c.download}</a></article>)}</div></section>
      <MarketResearchCapture symbol={detail.company.tickers[0]} sourceType="SEC_FILING" sourceTitle={c.captureTitle(detail.filing.form, detail.filing.accession)} sourceUrl={packageHref} suggestedSummary={c.captureSummary(detail)} metadata={{ cik: detail.company.cik, accession: detail.filing.accession, form: detail.filing.form, filingDate: detail.filing.filingDate, reportDate: detail.filing.reportDate, ticker: detail.company.tickers[0] ?? null }} />
    </>}
  </section>
}

