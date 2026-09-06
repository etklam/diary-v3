import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { secCompanySearchResultSchema, secFilingPageSchema, type SecCompanySearchResult, type SecFilingPage, type SecFilingSummary } from '@diary/contracts/sec-filings'
import { api, useUi } from '../ui'
import { apiFailure, FailureNotice, type Failure } from '../api-error'
import { MarketResearchCapture } from '../market-research-capture'
import { ToolShell, toolByHref } from '../tool-shell'
import './sec-filings.css'

const copy = {
    en: {
    kicker: 'Official SEC EDGAR documents', title: 'SEC filings', subtitle: 'Search official submissions, inspect the document index, and download source files or bounded ZIP packages.', search: 'Company, ticker, or CIK', searchAction: 'Search SEC', results: 'Company matches', selected: 'Selected company', cik: 'CIK', forms: 'Forms', filedFrom: 'Filed from', filedTo: 'Filed to', periodFrom: 'Report period from', periodTo: 'Report period to', amendments: 'Amendments', include: 'Include amendments', exclude: 'Exclude amendments', only: 'Amendments only', apply: 'Apply filters', reset: 'Reset', filing: 'Filing', filed: 'Filed', reportPeriod: 'Report period', accession: 'Accession', primary: 'Primary document', select: 'Select', open: 'Open filing', original: 'Original SEC file', capture: 'Capture read', selectedCount: 'filings selected', batchMode: 'Batch mode', primaryDocuments: 'Primary documents', completeSubmissions: 'Complete submissions', downloadBatch: 'Download batch ZIP', previous: 'Previous', next: 'Next', noResults: 'No filings match the selected filters.', initial: 'Search for a company to read its filings.', loading: 'Loading SEC data…', retry: 'Try again', failed: 'SEC filings are temporarily unavailable.', stale: 'Showing previously fetched SEC metadata because the provider could not refresh.', detail: 'Filing detail', back: 'Back to filings', documents: 'Documents', document: 'Document', description: 'Description', type: 'Type', size: 'Size', download: 'Download', downloadZip: 'Download all as ZIP', noPdf: 'This filing does not include a PDF. The original submitted files remain available below.', amendment: 'Amendment', unavailableDate: 'Not provided', captureSummary: (filing: SecFilingSummary) => `SEC filing ${filing.form} filed ${filing.filingDate}. Accession ${filing.accession}. Report period: ${filing.reportDate ?? 'not provided'}.`, captureTitle: (filing: SecFilingSummary) => `SEC ${filing.form} · ${filing.accession}`,
  },
  'zh-TW': {
    kicker: 'SEC EDGAR 官方文件', title: 'SEC 申報', subtitle: '搜尋官方申報、查看文件索引，下載原始檔案或受限 ZIP 套件。', search: '公司、代號或 CIK', searchAction: '搜尋 SEC', results: '公司結果', selected: '已選公司', cik: 'CIK', forms: '表格', filedFrom: '申報起日', filedTo: '申報迄日', periodFrom: '報告期起日', periodTo: '報告期迄日', amendments: '修訂申報', include: '包括修訂', exclude: '排除修訂', only: '只顯示修訂', apply: '套用篩選', reset: '重設', filing: '申報', filed: '申報日期', reportPeriod: '報告期', accession: 'Accession', primary: '主要文件', select: '選取', open: '查看申報', original: 'SEC 原始檔案', capture: '捕捉讀法', selectedCount: '項申報已選取', batchMode: '批次模式', primaryDocuments: '主要文件', completeSubmissions: '完整提交檔案', downloadBatch: '下載批次 ZIP', previous: '上一頁', next: '下一頁', noResults: '沒有符合篩選條件的申報。', initial: '搜尋公司以查看其申報。', loading: '正在載入 SEC 資料…', retry: '重試', failed: 'SEC 申報暫時無法使用。', stale: '供應商未能更新，現正顯示之前取得的 SEC 資料。', detail: '申報詳情', back: '返回申報', documents: '文件', document: '文件', description: '說明', type: '類型', size: '大小', download: '下載', downloadZip: '下載全部 ZIP', noPdf: '此申報沒有 PDF；下方仍提供官方提交檔案。', amendment: '修訂', unavailableDate: '未提供', captureSummary: (filing: SecFilingSummary) => `SEC ${filing.form} 申報日期為 ${filing.filingDate}，Accession ${filing.accession}。報告期：${filing.reportDate ?? '未提供'}。`, captureTitle: (filing: SecFilingSummary) => `SEC ${filing.form}・${filing.accession}`,
  },
  'zh-CN': {
    kicker: 'SEC EDGAR 官方文件', title: 'SEC 申报', subtitle: '搜索官方申报、查看文件索引，下载原始文件或受限 ZIP 包。', search: '公司、代码或 CIK', searchAction: '搜索 SEC', results: '公司结果', selected: '已选公司', cik: 'CIK', forms: '表格', filedFrom: '申报起日', filedTo: '申报止日', periodFrom: '报告期起日', periodTo: '报告期止日', amendments: '修订申报', include: '包括修订', exclude: '排除修订', only: '仅显示修订', apply: '应用筛选', reset: '重置', filing: '申报', filed: '申报日期', reportPeriod: '报告期', accession: 'Accession', primary: '主要文件', select: '选择', open: '查看申报', original: 'SEC 原始文件', capture: '捕捉读法', selectedCount: '项申报已选择', batchMode: '批量模式', primaryDocuments: '主要文件', completeSubmissions: '完整提交文件', downloadBatch: '下载批量 ZIP', previous: '上一页', next: '下一页', noResults: '没有符合筛选条件的申报。', initial: '搜索公司以查看其申报。', loading: '正在加载 SEC 数据…', retry: '重试', failed: 'SEC 申报暂时无法使用。', stale: '供应商未能更新，现正显示之前获取的 SEC 数据。', detail: '申报详情', back: '返回申报', documents: '文件', document: '文件', description: '说明', type: '类型', size: '大小', download: '下载', downloadZip: '下载全部 ZIP', noPdf: '此申报没有 PDF；下方仍提供官方提交文件。', amendment: '修订', unavailableDate: '未提供', captureSummary: (filing: SecFilingSummary) => `SEC ${filing.form} 申报日期为 ${filing.filingDate}，Accession ${filing.accession}。报告期：${filing.reportDate ?? '未提供'}。`, captureTitle: (filing: SecFilingSummary) => `SEC ${filing.form}・${filing.accession}`,
  },
} as const

const formOptions = ['10-K', '10-Q', '8-K', '20-F', '6-K', '40-F'] as const
type Filters = { forms: string[]; filedFrom: string; filedTo: string; periodFrom: string; periodTo: string; amendments: 'include' | 'exclude' | 'only' }
const initialFilters: Filters = { forms: [], filedFrom: '', filedTo: '', periodFrom: '', periodTo: '', amendments: 'include' }

function originalDocumentUrl(cik: string, filing: SecFilingSummary) {
  return `https://www.sec.gov/Archives/edgar/data/${String(Number(cik))}/${filing.accession.replaceAll('-', '')}/${encodeURIComponent(filing.primaryDocument)}`
}

function failureFor(error: Failure | null, fallback: string): Failure | null {
  return error ? { ...error, message: fallback } : null
}

export default function SecFilings() {
  const { locale } = useUi()
  const c = copy[locale]
  const [query, setQuery] = useState('')
  const [companies, setCompanies] = useState<SecCompanySearchResult[]>([])
  const [selectedCompany, setSelectedCompany] = useState<SecCompanySearchResult | null>(null)
  const [page, setPage] = useState<SecFilingPage | null>(null)
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<Failure | null>(null)
  const [stale, setStale] = useState(false)
  const [selectedAccessions, setSelectedAccessions] = useState<string[]>([])
  const [captureFiling, setCaptureFiling] = useState<SecFilingSummary | null>(null)
  const [batchMode, setBatchMode] = useState<'primary' | 'complete'>('primary')
  const cursors = useRef<Array<string | undefined>>([undefined])
  const pageIndex = useRef(0)
  const loadVersion = useRef(0)

  async function search(event?: FormEvent) {
    event?.preventDefault()
    if (!query.trim() || pending) return
    setPending(true); setError(null); setSelectedCompany(null); setPage(null); setSelectedAccessions([]); setCaptureFiling(null)
    try {
      const result = await api.GET('/api/tools/sec-filings/companies', { params: { query: { q: query.trim(), limit: 10 } } })
      const parsed = secCompanySearchResultSchema.array().safeParse(result.data?.data)
      if (!result.response.ok || !parsed.success) setError(apiFailure(result.error, c.failed))
      else { setCompanies(parsed.data); setStale(Boolean(result.data?.meta.stale)) }
    } catch { setError({ message: c.failed, fields: [] }) }
    finally { setPending(false) }
  }

  async function loadFilings(company: SecCompanySearchResult, nextFilters: Filters, cursor?: string) {
    const version = ++loadVersion.current
    setPending(true); setError(null)
    try {
      const result = await api.GET('/api/tools/sec-filings/companies/{cik}/filings', { params: { path: { cik: company.cik }, query: { forms: nextFilters.forms.length ? nextFilters.forms.join(',') : undefined, filedFrom: nextFilters.filedFrom || undefined, filedTo: nextFilters.filedTo || undefined, periodFrom: nextFilters.periodFrom || undefined, periodTo: nextFilters.periodTo || undefined, amendments: nextFilters.amendments, cursor, limit: 50 } } })
      if (version !== loadVersion.current) return
      const parsed = secFilingPageSchema.safeParse(result.data?.data)
      if (!result.response.ok || !parsed.success) setError(apiFailure(result.error, c.failed))
      else { setPage(parsed.data); setStale(Boolean(result.data?.meta.stale)) }
    } catch { if (version === loadVersion.current) setError({ message: c.failed, fields: [] }) }
    finally { if (version === loadVersion.current) setPending(false) }
  }

  function selectCompany(company: SecCompanySearchResult) {
    setSelectedCompany(company); setFilters(initialFilters); setSelectedAccessions([]); setCaptureFiling(null); cursors.current = [undefined]; pageIndex.current = 0
    void loadFilings(company, initialFilters)
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedCompany) return
    const form = new FormData(event.currentTarget)
    const next: Filters = { forms: form.getAll('forms').map(String), filedFrom: String(form.get('filedFrom') ?? ''), filedTo: String(form.get('filedTo') ?? ''), periodFrom: String(form.get('periodFrom') ?? ''), periodTo: String(form.get('periodTo') ?? ''), amendments: String(form.get('amendments') ?? 'include') as Filters['amendments'] }
    setFilters(next); setSelectedAccessions([]); setCaptureFiling(null); cursors.current = [undefined]; pageIndex.current = 0; void loadFilings(selectedCompany, next)
  }

  function nextPage() {
    if (!selectedCompany || !page?.nextCursor || pending) return
    cursors.current[pageIndex.current + 1] = page.nextCursor; pageIndex.current += 1; void loadFilings(selectedCompany, filters, page.nextCursor)
  }
  function previousPage() {
    if (!selectedCompany || pageIndex.current === 0 || pending) return
    pageIndex.current -= 1; void loadFilings(selectedCompany, filters, cursors.current[pageIndex.current])
  }
  function toggle(accession: string) {
    setSelectedAccessions(current => current.includes(accession) ? current.filter(value => value !== accession) : current.length >= 10 ? current : [...current, accession])
  }
  const batchHref = selectedCompany ? `/api/tools/sec-filings/batch?cik=${encodeURIComponent(selectedCompany.cik)}&mode=${batchMode}&${selectedAccessions.map(accession => `accessions=${encodeURIComponent(accession)}`).join('&')}` : '#'
  const retry = () => selectedCompany ? void loadFilings(selectedCompany, filters, cursors.current[pageIndex.current]) : void search()

  return <section className="sec-filings-page">
    <ToolShell tool={toolByHref('/tools/sec-filings')} title={c.title} intro={c.subtitle} actions={<form className="sec-company-search" onSubmit={search}><label htmlFor="sec-company-query">{c.search}</label><div><input id="sec-company-query" value={query} onChange={event => setQuery(event.target.value)} maxLength={120} required spellCheck={false} /><button type="submit" disabled={pending}>{pending ? '…' : c.searchAction}</button></div></form>} />
    {stale && <p className="sec-filings-stale" role="status">{c.stale}</p>}
    {error && <><FailureNotice failure={failureFor(error, c.failed)} id="sec-filings-error" /><button type="button" className="secondary" onClick={retry}>{c.retry}</button></>}
    {companies.length > 0 && !selectedCompany && <section className="sec-filings-section" aria-labelledby="sec-company-results"><h2 id="sec-company-results">{c.results}</h2><div className="sec-company-results">{companies.map(company => <button type="button" className="sec-company-result" key={company.cik} onClick={() => selectCompany(company)}><strong>{company.name}</strong><span>{company.tickers.join(', ') || '—'} · {c.cik} {company.cik}</span></button>)}</div></section>}
    {!selectedCompany && companies.length === 0 && !pending && !error && <p className="sec-filings-empty">{c.initial}</p>}
    {selectedCompany && <>
      <section className="sec-filings-section sec-selected-company" aria-labelledby="sec-selected-company"><p className="sec-filings-kicker">{c.selected}</p><h2 id="sec-selected-company">{selectedCompany.name}</h2><p>{selectedCompany.tickers.join(', ') || '—'} · {c.cik} {selectedCompany.cik}</p></section>
      <form className="sec-filings-filters" onSubmit={applyFilters}><fieldset><legend>{c.forms}</legend>{formOptions.map(form => <label key={form}><input type="checkbox" name="forms" value={form} defaultChecked={filters.forms.includes(form)} />{form}</label>)}</fieldset><label>{c.filedFrom}<input type="date" name="filedFrom" defaultValue={filters.filedFrom} /></label><label>{c.filedTo}<input type="date" name="filedTo" defaultValue={filters.filedTo} /></label><label>{c.periodFrom}<input type="date" name="periodFrom" defaultValue={filters.periodFrom} /></label><label>{c.periodTo}<input type="date" name="periodTo" defaultValue={filters.periodTo} /></label><label>{c.amendments}<select name="amendments" defaultValue={filters.amendments}><option value="include">{c.include}</option><option value="exclude">{c.exclude}</option><option value="only">{c.only}</option></select></label><button type="submit" disabled={pending}>{c.apply}</button></form>
      {selectedAccessions.length > 0 && <section className="sec-batch-bar" aria-label={c.batchMode}><strong>{selectedAccessions.length} {c.selectedCount}</strong><label>{c.batchMode}<select value={batchMode} onChange={event => setBatchMode(event.target.value as 'primary' | 'complete')}><option value="primary">{c.primaryDocuments}</option><option value="complete">{c.completeSubmissions}</option></select></label><a href={batchHref}>{c.downloadBatch}</a></section>}
      {pending && !page && <p role="status">{c.loading}</p>}
      {!pending && page?.filings.length === 0 && <p className="sec-filings-empty">{c.noResults}</p>}
      {page && page.filings.length > 0 && <><div className="sec-filing-table-wrap"><table className="sec-filing-table"><caption>{selectedCompany.name} · {page.filings.length} {c.filing}</caption><thead><tr><th scope="col">{c.select}</th><th scope="col">{c.filing}</th><th scope="col">{c.filed}</th><th scope="col">{c.reportPeriod}</th><th scope="col">{c.accession}</th><th scope="col">{c.primary}</th><th scope="col">{c.original}</th></tr></thead><tbody>{page.filings.map(filing => <tr key={filing.accession}><td><input type="checkbox" aria-label={`${c.select} ${filing.accession}`} checked={selectedAccessions.includes(filing.accession)} onChange={() => toggle(filing.accession)} /></td><td><Link to={`/tools/sec-filings/${selectedCompany.cik}/${filing.accession}`}>{filing.form}{filing.isAmendment ? ` · ${c.amendment}` : ''}</Link></td><td><time dateTime={filing.filingDate}>{filing.filingDate}</time></td><td>{filing.reportDate ?? c.unavailableDate}</td><td>{filing.accession}</td><td><Link to={`/tools/sec-filings/${selectedCompany.cik}/${filing.accession}`}>{filing.primaryDocument}</Link></td><td><a href={originalDocumentUrl(selectedCompany.cik, filing)} target="_blank" rel="noreferrer">{c.original}</a><button type="button" className="sec-inline-capture" onClick={() => setCaptureFiling(filing)}>{c.capture}</button></td></tr>)}</tbody></table></div>{captureFiling && <MarketResearchCapture symbol={selectedCompany.tickers[0]} sourceType="SEC_FILING" sourceTitle={c.captureTitle(captureFiling)} sourceUrl={originalDocumentUrl(selectedCompany.cik, captureFiling)} suggestedSummary={c.captureSummary(captureFiling)} metadata={{ cik: selectedCompany.cik, accession: captureFiling.accession, form: captureFiling.form, filingDate: captureFiling.filingDate, reportDate: captureFiling.reportDate, ticker: selectedCompany.tickers[0] ?? null }} /> }<div className="sec-pagination"><button type="button" className="secondary" disabled={pageIndex.current === 0 || pending} onClick={previousPage}>{c.previous}</button><span>{pageIndex.current + 1}</span><button type="button" className="secondary" disabled={!page.nextCursor || pending} onClick={nextPage}>{c.next}</button></div></>}
    </>}
  </section>
}
